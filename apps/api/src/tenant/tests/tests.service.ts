import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type TestStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

/** Spec §52. RESULTS_PUBLISHED is terminal — a published result is not unpublished. */
const ALLOWED: Record<TestStatus, TestStatus[]> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['LIVE', 'DRAFT', 'CANCELLED'],
  LIVE: ['CLOSED', 'CANCELLED'],
  CLOSED: ['RESULTS_PUBLISHED', 'LIVE'],
  RESULTS_PUBLISHED: [],
  CANCELLED: [],
};

const INCLUDE = {
  course: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  branches: { include: { branch: { select: { id: true, name: true, code: true } } } },
  batches: { include: { batch: { select: { id: true, name: true, code: true, branchId: true } } } },
  _count: { select: { questions: true, attempts: true } },
} as const;

@Injectable()
export class TestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * A test is visible if it reaches a branch you can see: organization-wide
   * always, otherwise via its branch targets. The predicate is part of the query,
   * so another branch's test is never read.
   */
  private visibility(ctx: TenantContext): Prisma.TestWhereInput {
    const reachable = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.accessibleBranchIds;
    if (reachable === null) return {};
    return {
      OR: [
        { scope: 'ORGANIZATION' },
        { branches: { some: { branchId: { in: reachable } } } },
      ],
    };
  }

  async list(ctx: TenantContext, query: PaginationQuery & { status?: TestStatus; scope?: any }) {
    const where: Prisma.TestWhereInput = {
      organizationId: ctx.organizationId,
      ...this.visibility(ctx),
      ...(query.status ? { status: query.status } : {}),
      ...(query.scope ? { scope: query.scope } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search.toUpperCase() } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.test.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['startAt', 'createdAt', 'title', 'status'] as const, query.sortBy, query.sortDir, 'startAt'),
        include: INCLUDE,
      }),
      this.prisma.test.count({ where }),
    ]);

    return paginate(rows.map(shape), total, query);
  }

  async get(ctx: TenantContext, id: string) {
    const test = await this.prisma.test.findFirst({
      where: { id, organizationId: ctx.organizationId, ...this.visibility(ctx) },
      include: INCLUDE,
    });
    if (!test) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That test does not exist.' });
    return shape(test);
  }

  /** The paper. Answers are withheld until results are published. */
  async questions(ctx: TenantContext, id: string, includeAnswers = false) {
    const test = await this.get(ctx, id);
    const rows = await this.prisma.testQuestion.findMany({
      where: { testId: id },
      orderBy: { sequence: 'asc' },
      include: {
        question: {
          include: {
            subject: { select: { id: true, name: true, code: true } },
            options: { orderBy: { sequence: 'asc' } },
          },
        },
      },
    });

    const reveal = includeAnswers && test.status === 'RESULTS_PUBLISHED';
    return rows.map((r) => ({
      id: r.id,
      sequence: r.sequence,
      marks: r.marks,
      negativeMarks: r.negativeMarks,
      question: {
        ...r.question,
        numericAnswer: reveal ? r.question.numericAnswer : undefined,
        explanation: reveal ? r.question.explanation : undefined,
        options: r.question.options.map((o) => ({
          id: o.id,
          label: o.label,
          body: o.body,
          ...(reveal ? { isCorrect: o.isCorrect } : {}),
        })),
      },
    }));
  }

  async create(ctx: TenantContext, input: any) {
    const branchIds = await this.resolveBranches(ctx, input);
    const batches = await this.resolveBatches(ctx, input.batchIds, input.scope, branchIds);

    const clash = await this.prisma.test.findFirst({
      where: { organizationId: ctx.organizationId, code: input.code },
    });
    if (clash) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: `Test code ${input.code} is already used.`,
        details: { code: 'That test code is already used.' },
      });
    }

    const test = await this.prisma.test.create({
      data: {
        organizationId: ctx.organizationId,
        title: input.title,
        code: input.code,
        description: input.description || null,
        scope: input.scope,
        mode: input.mode,
        courseId: input.courseId ?? null,
        durationMinutes: input.durationMinutes,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        negativeMarking: input.negativeMarking,
        shuffleQuestions: input.shuffleQuestions,
        instantResults: input.instantResults,
        createdById: ctx.userId,
        branches: { create: branchIds.map((branchId) => ({ branchId })) },
        batches: { create: batches.map((b) => ({ batchId: b.id })) },
      },
      include: INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'test.create', entityType: 'Test', entityId: test.id,
      after: { title: test.title, scope: test.scope, branches: branchIds.length, batches: batches.length },
    });

    return shape(test);
  }

  /**
   * Sets the paper. Marks live on the link, not the question, so re-weighting the
   * bank never changes a paper that has already been sat.
   */
  async setQuestions(ctx: TenantContext, id: string, questions: { questionId: string; marks: number; negativeMarks: number }[]) {
    const test = await this.get(ctx, id);
    if (!['DRAFT', 'SCHEDULED'].includes(test.status)) {
      throw new BadRequestException({
        code: 'TEST_LOCKED',
        message: 'The paper can only be changed while the test is a draft or scheduled.',
      });
    }

    // Every question must be one this caller can actually see.
    const reachable = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.accessibleBranchIds;
    const found = await this.prisma.question.count({
      where: {
        id: { in: questions.map((q) => q.questionId) },
        organizationId: ctx.organizationId,
        isActive: true,
        ...(reachable === null ? {} : { OR: [{ branchId: null }, { branchId: { in: reachable } }] }),
      },
    });
    if (found !== questions.length) {
      throw new BadRequestException({
        code: 'QUESTION_NOT_FOUND',
        message: 'Some selected questions are unavailable to you or have been retired.',
      });
    }

    const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

    await this.prisma.$transaction(async (tx) => {
      await tx.testQuestion.deleteMany({ where: { testId: id } });
      await tx.testQuestion.createMany({
        data: questions.map((q, i) => ({
          testId: id,
          questionId: q.questionId,
          sequence: i,
          marks: q.marks,
          negativeMarks: q.negativeMarks,
        })),
      });
      await tx.test.update({ where: { id }, data: { totalMarks } });
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'test.set_questions', entityType: 'Test', entityId: id,
      after: { questions: questions.length, totalMarks },
    });

    return this.get(ctx, id);
  }

  async changeStatus(ctx: TenantContext, id: string, status: TestStatus, reason?: string) {
    const test = await this.get(ctx, id);

    if (test.status === status) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: `This test is already ${status.toLowerCase().replace(/_/g, ' ')}.` });
    }
    if (!ALLOWED[test.status].includes(status)) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `A test cannot move from ${test.status} to ${status}.`,
        details: { from: test.status, to: status, allowed: ALLOWED[test.status] },
      });
    }
    // Scheduling an empty paper would let students sit a test with no questions.
    if (status === 'SCHEDULED' && test.questionCount === 0) {
      throw new BadRequestException({
        code: 'NO_QUESTIONS',
        message: 'Add questions to the paper before scheduling it.',
      });
    }

    if (status === 'RESULTS_PUBLISHED') return this.publishResults(ctx, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.test.update({ where: { id }, data: { status } });

      // Spec §51: going live is the point at which the paper's questions become
      // historical record, so they are frozen from here on.
      if (status === 'LIVE') {
        const links = await tx.testQuestion.findMany({ where: { testId: id }, select: { questionId: true } });
        const ids = links.map((l) => l.questionId);
        await tx.question.updateMany({
          where: { id: { in: ids }, lockedAt: null },
          data: { lockedAt: new Date() },
        });
        await tx.question.updateMany({ where: { id: { in: ids } }, data: { usageCount: { increment: 1 } } });
      }
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: `test.${status.toLowerCase()}`, entityType: 'Test', entityId: id,
      before: { status: test.status }, after: { status }, reason,
    });

    return this.get(ctx, id);
  }

  /**
   * Spec §54 — batch, branch and organization rank plus percentile.
   *
   * All four are derived in one pass over the attempt set: an attempt's rank at
   * each level is one plus the number of attempts scoring strictly higher, so
   * ties share a rank (two students on 96 are both 2nd, and the next is 4th).
   */
  async publishResults(ctx: TenantContext, id: string) {
    const test = await this.get(ctx, id);
    if (test.status !== 'CLOSED') {
      throw new BadRequestException({
        code: 'NOT_CLOSED',
        message: 'Close the test before publishing results.',
      });
    }

    const attempts = await this.prisma.testAttempt.findMany({
      where: { testId: id, status: { in: ['SUBMITTED', 'AUTO_SUBMITTED', 'EVALUATED'] } },
      select: { id: true, score: true, branchId: true, studentId: true },
    });
    if (!attempts.length) {
      throw new BadRequestException({
        code: 'NO_ATTEMPTS',
        message: 'Nobody sat this test, so there are no results to publish.',
      });
    }

    // Batch membership drives batch rank; a student may sit with exactly one of
    // the test's batches.
    const enrolments = await this.prisma.batchStudent.findMany({
      where: {
        studentId: { in: attempts.map((a) => a.studentId) },
        status: 'ENROLLED',
        batch: { tests: { some: { testId: id } } },
      },
      select: { studentId: true, batchId: true },
    });
    const batchOf = new Map(enrolments.map((e) => [e.studentId, e.batchId]));

    const rankWithin = (pool: typeof attempts, score: number) =>
      pool.filter((a) => a.score > score).length + 1;

    const total = attempts.length;
    const updates = attempts.map((a) => {
      const branchPool = attempts.filter((x) => x.branchId === a.branchId);
      const myBatch = batchOf.get(a.studentId);
      const batchPool = myBatch ? attempts.filter((x) => batchOf.get(x.studentId) === myBatch) : [a];
      const below = attempts.filter((x) => x.score < a.score).length;

      return this.prisma.testAttempt.update({
        where: { id: a.id },
        data: {
          organizationRank: rankWithin(attempts, a.score),
          branchRank: rankWithin(branchPool, a.score),
          batchRank: rankWithin(batchPool, a.score),
          // Share scoring strictly below, over the rest of the cohort — the
          // convention NEET and JEE use.
          percentile: total <= 1 ? 100 : (below / (total - 1)) * 100,
          status: 'EVALUATED',
        },
      });
    });

    await this.prisma.$transaction([
      ...updates,
      this.prisma.test.update({
        where: { id },
        data: { status: 'RESULTS_PUBLISHED', resultsPublishedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'test.publish_results', entityType: 'Test', entityId: id,
      after: { attempts: total },
    });

    return this.get(ctx, id);
  }

  /** Spec §54 — the result sheet, ranked. */
  async results(ctx: TenantContext, id: string) {
    const test = await this.get(ctx, id);

    const attempts = await this.prisma.testAttempt.findMany({
      where: {
        testId: id,
        // A branch-scoped user sees only their own branch's candidates.
        ...(ctx.accessibleBranchIds ? { branchId: { in: ctx.accessibleBranchIds } } : {}),
      },
      orderBy: [{ score: 'desc' }],
      include: {
        student: { select: { id: true, name: true, studentCode: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    const scored = attempts.filter((a) => a.status !== 'IN_PROGRESS');
    const scores = scored.map((a) => a.score);
    const average = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;

    return {
      test: {
        id: test.id, title: test.title, code: test.code, status: test.status,
        totalMarks: test.totalMarks, resultsPublishedAt: test.resultsPublishedAt,
      },
      published: test.status === 'RESULTS_PUBLISHED',
      summary: {
        candidates: attempts.length,
        submitted: scored.length,
        inProgress: attempts.length - scored.length,
        average,
        highest: scores.length ? Math.max(...scores) : 0,
        lowest: scores.length ? Math.min(...scores) : 0,
      },
      attempts: attempts.map((a) => ({
        id: a.id,
        student: a.student,
        branch: a.branch,
        status: a.status,
        score: a.score,
        maxScore: a.maxScore,
        percentage: a.percentage,
        correctCount: a.correctCount,
        wrongCount: a.wrongCount,
        unattemptedCount: a.unattemptedCount,
        // Ranks stay hidden until publication, so a partial sheet cannot mislead.
        batchRank: test.status === 'RESULTS_PUBLISHED' ? a.batchRank : null,
        branchRank: test.status === 'RESULTS_PUBLISHED' ? a.branchRank : null,
        organizationRank: test.status === 'RESULTS_PUBLISHED' ? a.organizationRank : null,
        percentile: test.status === 'RESULTS_PUBLISHED' ? a.percentile : null,
        submittedAt: a.submittedAt,
      })),
    };
  }

  /**
   * Spec §52 mode=OFFLINE — a paper/OMR test has no attempt engine to compute a
   * score, so a staff member records each student's outcome directly. Upsert
   * keeps entry correctable up until publication, mirroring how a live online
   * attempt stays editable until it is submitted; once results are published
   * this is blocked like every other historical record (spec §51, §75).
   */
  async recordOfflineScores(
    ctx: TenantContext,
    id: string,
    rows: { studentId: string; score: number; correctCount: number; wrongCount: number; unattemptedCount: number }[],
  ) {
    const test = await this.get(ctx, id);
    if (test.mode !== 'OFFLINE') {
      throw new BadRequestException({
        code: 'NOT_OFFLINE',
        message: 'Scores are entered manually only for offline tests — an online test is scored by the attempt itself.',
      });
    }
    if (!['LIVE', 'CLOSED'].includes(test.status)) {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: 'Go live before entering scores.',
      });
    }

    const ids = rows.map((r) => r.studentId);
    const students = await this.prisma.student.findMany({
      where: { id: { in: ids }, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, branchId: true },
    });
    if (students.length !== ids.length) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'One or more selected students do not exist.' });
    }
    for (const s of students) assertBranchAccess(ctx, s.branchId);

    // Only a student actually enrolled in one of this test's batches may be scored.
    const enrolled = await this.prisma.batchStudent.findMany({
      where: { studentId: { in: ids }, status: 'ENROLLED', batch: { tests: { some: { testId: id } } } },
      select: { studentId: true },
    });
    const eligible = new Set(enrolled.map((e) => e.studentId));
    const stray = rows.filter((r) => !eligible.has(r.studentId));
    if (stray.length) {
      throw new BadRequestException({
        code: 'NOT_IN_TEST_BATCH',
        message: 'One or more students are not enrolled in a batch sitting this test.',
      });
    }

    const branchOf = new Map(students.map((s) => [s.id, s.branchId]));
    const maxScore = test.totalMarks || 0;
    const now = new Date();

    await this.prisma.$transaction(
      rows.map((r) => {
        const percentage = maxScore === 0 ? 0 : (r.score / maxScore) * 100;
        return this.prisma.testAttempt.upsert({
          where: { testId_studentId: { testId: id, studentId: r.studentId } },
          create: {
            organizationId: ctx.organizationId,
            branchId: branchOf.get(r.studentId)!,
            testId: id,
            studentId: r.studentId,
            status: 'EVALUATED',
            startedAt: now,
            expiresAt: now,
            submittedAt: now,
            score: r.score,
            maxScore,
            correctCount: r.correctCount,
            wrongCount: r.wrongCount,
            unattemptedCount: r.unattemptedCount,
            percentage,
          },
          update: {
            status: 'EVALUATED',
            submittedAt: now,
            score: r.score,
            maxScore,
            correctCount: r.correctCount,
            wrongCount: r.wrongCount,
            unattemptedCount: r.unattemptedCount,
            percentage,
          },
        });
      }),
    );

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'test.record_offline_scores', entityType: 'Test', entityId: id,
      after: { count: rows.length },
    });

    return this.results(ctx, id);
  }

  private async resolveBranches(ctx: TenantContext, input: any): Promise<string[]> {
    if (input.scope === 'ORGANIZATION') {
      if (ctx.accessibleBranchIds !== null) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Only organization-level roles can run a test across every branch.',
        });
      }
      return [];
    }

    const requested: string[] = input.branchIds?.length
      ? input.branchIds
      : ctx.activeBranchId
        ? [ctx.activeBranchId]
        : [];
    if (!requested.length) {
      throw new BadRequestException({
        code: 'BRANCH_REQUIRED',
        message: 'Choose at least one branch, or switch out of the all-branch view.',
        details: { branchIds: 'Pick a branch.' },
      });
    }
    for (const b of requested) assertBranchAccess(ctx, b);

    const found = await this.prisma.branch.count({
      where: { id: { in: requested }, organizationId: ctx.organizationId },
    });
    if (found !== requested.length) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'One or more selected branches do not exist.' });
    }
    return requested;
  }

  private async resolveBatches(ctx: TenantContext, batchIds: string[], scope: string, branchIds: string[]) {
    const batches = await this.prisma.batch.findMany({
      where: { id: { in: batchIds }, organizationId: ctx.organizationId },
      select: { id: true, name: true, branchId: true, status: true },
    });
    if (batches.length !== batchIds.length) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'One or more selected batches do not exist.', details: { batchIds: 'Pick valid batches.' } });
    }
    for (const b of batches) assertBranchAccess(ctx, b.branchId);

    // A batch outside the test's own branch targeting would never see the paper.
    if (scope !== 'ORGANIZATION') {
      const stray = batches.filter((b) => !branchIds.includes(b.branchId));
      if (stray.length) {
        throw new BadRequestException({
          code: 'BATCH_OUT_OF_SCOPE',
          message: `${stray.map((s) => s.name).join(', ')} ${stray.length === 1 ? 'is' : 'are'} not in the branches this test targets.`,
          details: { batchIds: 'Pick batches from the selected branches.' },
        });
      }
    }
    return batches;
  }
}

function shape<T extends {
  branches: { branch: { id: string; name: string; code: string } }[];
  batches: { batch: { id: string; name: string; code: string; branchId: string } }[];
  _count: { questions: number; attempts: number };
}>(test: T) {
  const { _count, branches, batches, ...rest } = test;
  return {
    ...rest,
    branches: branches.map((b) => b.branch),
    batches: batches.map((b) => b.batch),
    questionCount: _count.questions,
    attemptCount: _count.attempts,
  };
}
