import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';

/** FNV-1a — a stable numeric seed from the attempt id, so the same student sees the same order every reconnect. */
function seedFrom(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic Fisher–Yates via mulberry32 — same seed always yields the same order. */
function shuffled<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let state = seed || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Spec §53 — the online test engine.
 *
 * The deadline is server-side and immutable: `expiresAt` is stamped when the
 * attempt starts, and every read enforces it. A paused tab, a changed device
 * clock or a reconnect cannot buy extra time, and an attempt that lapses while
 * the browser is closed is still auto-submitted the next time anyone looks at it.
 */
@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Starting is idempotent: calling it again returns the live attempt with the
   * remaining time, which is exactly what "reconnect" needs. It never restarts
   * the clock.
   */
  async start(ctx: TenantContext, testId: string, studentId: string) {
    const { test, student } = await this.candidate(ctx, testId, studentId);

    const now = new Date();
    if (test.status !== 'LIVE') {
      throw new BadRequestException({
        code: 'TEST_NOT_LIVE',
        message:
          test.status === 'SCHEDULED'
            ? 'This test has not opened yet.'
            : 'This test is no longer accepting attempts.',
        details: { status: test.status },
      });
    }
    if (now < test.startAt) {
      throw new BadRequestException({ code: 'TEST_NOT_OPEN', message: 'This test has not opened yet.' });
    }
    if (now > test.endAt) {
      throw new BadRequestException({ code: 'TEST_WINDOW_CLOSED', message: 'The window for this test has closed.' });
    }

    const existing = await this.prisma.testAttempt.findUnique({
      where: { testId_studentId: { testId, studentId } },
    });
    if (existing) {
      const settled = await this.enforceDeadline(existing);
      if (settled.status !== 'IN_PROGRESS') {
        throw new BadRequestException({
          code: 'ALREADY_SUBMITTED',
          message: 'This student has already submitted this test.',
          details: { status: settled.status, submittedAt: settled.submittedAt },
        });
      }
      return this.resume(ctx, settled.id);
    }

    // The deadline is the earlier of "duration from now" and the test's own close
    // time — a student starting 10 minutes before the window shuts gets 10, not
    // the full duration.
    const durationEnd = new Date(now.getTime() + test.durationMinutes * 60_000);
    const expiresAt = durationEnd < test.endAt ? durationEnd : test.endAt;

    const questions = await this.prisma.testQuestion.count({ where: { testId } });
    const attempt = await this.prisma.testAttempt.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: student.branchId,
        testId,
        studentId,
        startedAt: now,
        expiresAt,
        maxScore: test.totalMarks,
        unattemptedCount: questions,
      },
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'attempt.start', entityType: 'TestAttempt', entityId: attempt.id,
      after: { testId, studentId, expiresAt },
    });

    return this.resume(ctx, attempt.id);
  }

  /**
   * The reconnect payload: the paper, the answers saved so far, and how long is
   * left — computed from the server's clock, never the client's.
   */
  async resume(ctx: TenantContext, attemptId: string) {
    const raw = await this.prisma.testAttempt.findFirst({
      where: { id: attemptId, organizationId: ctx.organizationId },
      include: {
        test: { select: { id: true, title: true, code: true, durationMinutes: true, shuffleQuestions: true, status: true, totalMarks: true } },
        student: { select: { id: true, name: true, studentCode: true } },
        answers: true,
      },
    });
    if (!raw) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That attempt does not exist.' });
    assertBranchAccess(ctx, raw.branchId);

    const attempt = await this.enforceDeadline(raw);

    const inOrder = await this.prisma.testQuestion.findMany({
      where: { testId: raw.testId },
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

    // Spec §52 shuffleQuestions — seeded on the attempt, not randomised per
    // request, so refreshing the page never reorders the paper mid-attempt.
    const paper = raw.test.shuffleQuestions ? shuffled(inOrder, seedFrom(attempt.id)) : inOrder;

    const answered = new Map(raw.answers.map((a) => [a.questionId, a]));

    return {
      attempt: {
        id: attempt.id,
        status: attempt.status,
        startedAt: attempt.startedAt,
        expiresAt: attempt.expiresAt,
        // The single number the client should trust for its countdown.
        secondsRemaining: Math.max(0, Math.floor((attempt.expiresAt.getTime() - Date.now()) / 1000)),
        lastSavedAt: attempt.lastSavedAt,
        submittedAt: attempt.submittedAt,
      },
      test: raw.test,
      student: raw.student,
      questions: paper.map((p) => ({
        id: p.questionId,
        sequence: p.sequence,
        marks: p.marks,
        negativeMarks: p.negativeMarks,
        type: p.question.type,
        body: p.question.body,
        subject: p.question.subject,
        // Correctness is never sent to a live attempt.
        options: p.question.options.map((o) => ({ id: o.id, label: o.label, body: o.body })),
        saved: answered.get(p.questionId)
          ? {
              selectedOptionIds: answered.get(p.questionId)!.selectedOptionIds,
              numericAnswer: answered.get(p.questionId)!.numericAnswer,
            }
          : null,
      })),
      progress: {
        total: paper.length,
        answered: raw.answers.filter((a) => a.selectedOptionIds.length > 0 || a.numericAnswer !== null).length,
      },
    };
  }

  /** Auto-save. Overwrites each question's answer, so repeated calls are safe. */
  async save(ctx: TenantContext, attemptId: string, answers: any[]) {
    const raw = await this.prisma.testAttempt.findFirst({
      where: { id: attemptId, organizationId: ctx.organizationId },
    });
    if (!raw) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That attempt does not exist.' });
    assertBranchAccess(ctx, raw.branchId);

    const attempt = await this.enforceDeadline(raw);
    if (attempt.status !== 'IN_PROGRESS') {
      // Distinguish running out of time from choosing to submit — telling a
      // student "time is up" when they pressed Submit is simply untrue.
      throw new BadRequestException({
        code: 'ATTEMPT_CLOSED',
        message:
          attempt.status === 'AUTO_SUBMITTED'
            ? 'Time is up — this attempt was submitted automatically.'
            : 'This attempt has already been submitted, so it can no longer be changed.',
        details: { status: attempt.status },
      });
    }

    const valid = await this.prisma.testQuestion.findMany({
      where: { testId: raw.testId, questionId: { in: answers.map((a) => a.questionId) } },
      select: { questionId: true },
    });
    const known = new Set(valid.map((v) => v.questionId));
    const strays = answers.filter((a) => !known.has(a.questionId));
    if (strays.length) {
      throw new BadRequestException({
        code: 'QUESTION_NOT_IN_TEST',
        message: 'Some answers refer to questions that are not in this paper.',
      });
    }

    await this.prisma.$transaction([
      ...answers.map((a) =>
        this.prisma.testAnswer.upsert({
          where: { attemptId_questionId: { attemptId, questionId: a.questionId } },
          create: {
            attemptId,
            questionId: a.questionId,
            selectedOptionIds: a.selectedOptionIds ?? [],
            numericAnswer: a.numericAnswer ?? null,
            timeSpentSeconds: a.timeSpentSeconds ?? 0,
          },
          update: {
            selectedOptionIds: a.selectedOptionIds ?? [],
            numericAnswer: a.numericAnswer ?? null,
            timeSpentSeconds: a.timeSpentSeconds ?? 0,
            answeredAt: new Date(),
          },
        }),
      ),
      this.prisma.testAttempt.update({ where: { id: attemptId }, data: { lastSavedAt: new Date() } }),
    ]);

    return {
      saved: answers.length,
      savedAt: new Date(),
      secondsRemaining: Math.max(0, Math.floor((attempt.expiresAt.getTime() - Date.now()) / 1000)),
    };
  }

  async submit(ctx: TenantContext, attemptId: string) {
    const raw = await this.prisma.testAttempt.findFirst({
      where: { id: attemptId, organizationId: ctx.organizationId },
    });
    if (!raw) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That attempt does not exist.' });
    assertBranchAccess(ctx, raw.branchId);

    const attempt = await this.enforceDeadline(raw);
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException({
        code: 'ALREADY_SUBMITTED',
        message: 'This attempt has already been submitted.',
        details: { status: attempt.status, submittedAt: attempt.submittedAt },
      });
    }

    return this.evaluate(attemptId, 'SUBMITTED');
  }

  /**
   * Marks the paper. Evaluation is server-side and runs once, on submission —
   * the client never sees a correct answer while an attempt is live.
   *
   * Multiple-choice is all-or-nothing: a partially correct set scores the
   * negative, matching how NEET and JEE treat it.
   */
  private async evaluate(attemptId: string, status: 'SUBMITTED' | 'AUTO_SUBMITTED') {
    const attempt = await this.prisma.testAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { test: { select: { negativeMarking: true, totalMarks: true } }, answers: true },
    });

    const paper = await this.prisma.testQuestion.findMany({
      where: { testId: attempt.testId },
      include: { question: { include: { options: true } } },
    });

    const byQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));
    let score = 0;
    let correct = 0;
    let wrong = 0;
    let unattempted = 0;
    const updates: { id: string; isCorrect: boolean | null; marksAwarded: number }[] = [];

    for (const p of paper) {
      const answer = byQuestion.get(p.questionId);
      const attempted =
        answer && (answer.selectedOptionIds.length > 0 || answer.numericAnswer !== null);

      if (!answer || !attempted) {
        unattempted += 1;
        if (answer) updates.push({ id: answer.id, isCorrect: null, marksAwarded: 0 });
        continue;
      }

      let isCorrect: boolean;
      if (p.question.type === 'NUMERIC') {
        const expected = p.question.numericAnswer;
        isCorrect =
          expected !== null &&
          answer.numericAnswer !== null &&
          Math.abs(answer.numericAnswer - expected) <= p.question.numericTolerance;
      } else {
        const keys = p.question.options.filter((o) => o.isCorrect).map((o) => o.id).sort();
        const given = [...answer.selectedOptionIds].sort();
        isCorrect = keys.length === given.length && keys.every((k, i) => k === given[i]);
      }

      const awarded = isCorrect
        ? p.marks
        : attempt.test.negativeMarking
          ? -p.negativeMarks
          : 0;

      score += awarded;
      isCorrect ? (correct += 1) : (wrong += 1);
      updates.push({ id: answer.id, isCorrect, marksAwarded: awarded });
    }

    // A negative total helps nobody; the floor is zero.
    const finalScore = Math.max(0, score);
    const maxScore = attempt.test.totalMarks || paper.reduce((s, p) => s + p.marks, 0);

    await this.prisma.$transaction([
      ...updates.map((u) =>
        this.prisma.testAnswer.update({
          where: { id: u.id },
          data: { isCorrect: u.isCorrect, marksAwarded: u.marksAwarded },
        }),
      ),
      this.prisma.testAttempt.update({
        where: { id: attemptId },
        data: {
          status,
          submittedAt: new Date(),
          score: finalScore,
          maxScore,
          correctCount: correct,
          wrongCount: wrong,
          unattemptedCount: unattempted,
          percentage: maxScore === 0 ? 0 : (finalScore / maxScore) * 100,
        },
      }),
    ]);

    return this.prisma.testAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: {
        student: { select: { id: true, name: true, studentCode: true } },
        test: { select: { id: true, title: true, instantResults: true, status: true } },
      },
    });
  }

  /**
   * The heart of the timer guarantee: any read of a lapsed attempt closes it.
   * There is no scheduler to miss, and no way for an abandoned browser to leave
   * an attempt open indefinitely.
   */
  private async enforceDeadline<T extends { id: string; status: string; expiresAt: Date }>(attempt: T) {
    if (attempt.status !== 'IN_PROGRESS' || attempt.expiresAt > new Date()) {
      return attempt as T & { submittedAt?: Date | null };
    }
    await this.evaluate(attempt.id, 'AUTO_SUBMITTED');
    return this.prisma.testAttempt.findUniqueOrThrow({ where: { id: attempt.id } }) as unknown as T & {
      submittedAt?: Date | null;
    };
  }

  /** Validates that this student may sit this test at all (spec §53). */
  private async candidate(ctx: TenantContext, testId: string, studentId: string) {
    const test = await this.prisma.test.findFirst({
      where: { id: testId, organizationId: ctx.organizationId },
      include: { branches: { select: { branchId: true } }, batches: { select: { batchId: true } } },
    });
    if (!test) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That test does not exist.' });

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true, branchId: true, status: true },
    });
    if (!student) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That student does not exist.' });
    assertBranchAccess(ctx, student.branchId);

    if (student.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'STUDENT_INACTIVE', message: `${student.name} is not an active student.` });
    }

    // The student's branch must be in the test's reach…
    if (test.scope !== 'ORGANIZATION' && !test.branches.some((b) => b.branchId === student.branchId)) {
      throw new ForbiddenException({
        code: 'TEST_OUT_OF_SCOPE',
        message: `${student.name}'s branch is not sitting this test.`,
      });
    }

    // …and they must be enrolled in one of the batches actually taking it.
    const enrolled = await this.prisma.batchStudent.count({
      where: {
        studentId,
        status: 'ENROLLED',
        batchId: { in: test.batches.map((b) => b.batchId) },
      },
    });
    if (!enrolled) {
      throw new ForbiddenException({
        code: 'NOT_IN_TEST_BATCH',
        message: `${student.name} is not in a batch sitting this test.`,
      });
    }

    return { test, student };
  }
}
