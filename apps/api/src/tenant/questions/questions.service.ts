import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

const INCLUDE = {
  subject: { select: { id: true, name: true, code: true } },
  chapter: { select: { id: true, name: true } },
  topic: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, code: true } },
  options: { orderBy: { sequence: 'asc' } },
  _count: { select: { testLinks: true } },
} as const;

/**
 * Spec §51 — the question bank.
 *
 * Visibility is the interesting part: an organization-wide question (branchId
 * null) is reusable everywhere, while a branch-private one is visible only to
 * that branch. Both live in one table, and the scope predicate below is what
 * keeps a Branch Admin from reading another branch's private bank.
 */
@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Org-wide questions, plus the private questions of branches you can reach. */
  private visibility(ctx: TenantContext): Prisma.QuestionWhereInput {
    const reachable = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.accessibleBranchIds;
    if (reachable === null) return {};
    return { OR: [{ branchId: null }, { branchId: { in: reachable } }] };
  }

  async list(
    ctx: TenantContext,
    query: PaginationQuery & { subjectId?: string; chapterId?: string; difficulty?: any; type?: any; scope?: 'org' | 'branch' },
  ) {
    const where: Prisma.QuestionWhereInput = {
      organizationId: ctx.organizationId,
      isActive: true,
      ...this.visibility(ctx),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.chapterId ? { chapterId: query.chapterId } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.scope === 'org' ? { branchId: null } : query.scope === 'branch' ? { branchId: { not: null } } : {}),
      ...(query.search ? { body: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.question.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['createdAt', 'difficulty', 'usageCount'] as const, query.sortBy, query.sortDir, 'createdAt'),
        include: INCLUDE,
      }),
      this.prisma.question.count({ where }),
    ]);

    return paginate(rows.map(shape), total, query);
  }

  async get(ctx: TenantContext, id: string) {
    const question = await this.prisma.question.findFirst({
      where: { id, organizationId: ctx.organizationId, ...this.visibility(ctx) },
      include: INCLUDE,
    });
    if (!question) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That question does not exist.' });
    return shape(question);
  }

  /** Counts by subject and difficulty — what a paper-setter needs before building. */
  async stats(ctx: TenantContext) {
    const where: Prisma.QuestionWhereInput = {
      organizationId: ctx.organizationId,
      isActive: true,
      ...this.visibility(ctx),
    };

    const [total, bySubject, byDifficulty, orgWide] = await Promise.all([
      this.prisma.question.count({ where }),
      this.prisma.question.groupBy({ by: ['subjectId'], where, _count: true }),
      this.prisma.question.groupBy({ by: ['difficulty'], where, _count: true }),
      this.prisma.question.count({ where: { ...where, branchId: null } }),
    ]);

    const subjects = await this.prisma.subject.findMany({
      where: { id: { in: bySubject.map((g) => g.subjectId) } },
      select: { id: true, name: true, code: true },
    });
    const byId = new Map(subjects.map((s) => [s.id, s]));

    return {
      total,
      organizationWide: orgWide,
      branchSpecific: total - orgWide,
      bySubject: bySubject
        .map((g) => ({ ...(byId.get(g.subjectId) ?? { id: g.subjectId, name: 'Unknown', code: '?' }), count: g._count }))
        .sort((a, b) => b.count - a.count),
      byDifficulty: byDifficulty.map((g) => ({ difficulty: g.difficulty, count: g._count })),
    };
  }

  async create(ctx: TenantContext, input: any) {
    await this.assertSubject(ctx, input);

    // Only an org-level role may add to the shared library; a Branch Admin's
    // questions land in their own branch's bank.
    let branchId: string | null = input.branchId ?? null;
    if (branchId === null && ctx.accessibleBranchIds !== null) {
      branchId = ctx.activeBranchId ?? ctx.accessibleBranchIds[0];
    }
    if (branchId) assertBranchAccess(ctx, branchId);

    const question = await this.prisma.question.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        subjectId: input.subjectId,
        chapterId: input.chapterId ?? null,
        topicId: input.topicId ?? null,
        type: input.type,
        difficulty: input.difficulty,
        body: input.body,
        explanation: input.explanation || null,
        marks: input.marks,
        negativeMarks: input.negativeMarks,
        numericAnswer: input.type === 'NUMERIC' ? input.numericAnswer : null,
        numericTolerance: input.numericTolerance,
        isActive: input.isActive,
        createdById: ctx.userId,
        options: {
          create: (input.type === 'NUMERIC' ? [] : input.options).map((o: any, i: number) => ({
            label: o.label || String.fromCharCode(65 + i),
            body: o.body,
            isCorrect: o.isCorrect,
            sequence: i,
          })),
        },
      },
      include: INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'question.create', entityType: 'Question', entityId: question.id,
      after: { subjectId: input.subjectId, type: input.type, branchId },
    });

    return shape(question);
  }

  /**
   * Spec §51 — "questions used in historical tests cannot be destructively
   * modified". Once a question is locked, only presentation-level fields stay
   * editable; body, options and answer are frozen, because students have already
   * been marked against them.
   */
  async update(ctx: TenantContext, id: string, input: any) {
    const existing = await this.prisma.question.findFirst({
      where: { id, organizationId: ctx.organizationId, ...this.visibility(ctx) },
      include: { options: true },
    });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That question does not exist.' });
    if (existing.branchId) assertBranchAccess(ctx, existing.branchId);

    if (existing.lockedAt) {
      const destructive =
        (input.body !== undefined && input.body !== existing.body) ||
        input.options !== undefined ||
        (input.type !== undefined && input.type !== existing.type) ||
        (input.numericAnswer !== undefined && input.numericAnswer !== existing.numericAnswer);

      if (destructive) {
        throw new BadRequestException({
          code: 'QUESTION_LOCKED',
          message:
            'This question has been used in a published test. Its wording and answer are frozen — duplicate it and edit the copy instead.',
          details: { lockedAt: existing.lockedAt, usageCount: existing.usageCount },
        });
      }
    }

    const question = await this.prisma.$transaction(async (tx) => {
      if (input.options !== undefined && !existing.lockedAt) {
        await tx.questionOption.deleteMany({ where: { questionId: id } });
        await tx.questionOption.createMany({
          data: input.options.map((o: any, i: number) => ({
            questionId: id,
            label: o.label || String.fromCharCode(65 + i),
            body: o.body,
            isCorrect: o.isCorrect,
            sequence: i,
          })),
        });
      }

      return tx.question.update({
        where: { id },
        data: {
          ...(input.subjectId !== undefined ? { subjectId: input.subjectId } : {}),
          ...(input.chapterId !== undefined ? { chapterId: input.chapterId } : {}),
          ...(input.topicId !== undefined ? { topicId: input.topicId } : {}),
          ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
          ...(input.explanation !== undefined ? { explanation: input.explanation || null } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(existing.lockedAt
            ? {}
            : {
                ...(input.body !== undefined ? { body: input.body } : {}),
                ...(input.type !== undefined ? { type: input.type } : {}),
                ...(input.marks !== undefined ? { marks: input.marks } : {}),
                ...(input.negativeMarks !== undefined ? { negativeMarks: input.negativeMarks } : {}),
                ...(input.numericAnswer !== undefined ? { numericAnswer: input.numericAnswer } : {}),
                ...(input.numericTolerance !== undefined ? { numericTolerance: input.numericTolerance } : {}),
              }),
        },
        include: INCLUDE,
      });
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'question.update', entityType: 'Question', entityId: id,
      after: { locked: Boolean(existing.lockedAt) },
    });

    return shape(question);
  }

  /** The supported way to change a locked question: copy it, edit the copy. */
  async duplicate(ctx: TenantContext, id: string) {
    const source = await this.prisma.question.findFirst({
      where: { id, organizationId: ctx.organizationId, ...this.visibility(ctx) },
      include: { options: { orderBy: { sequence: 'asc' } } },
    });
    if (!source) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That question does not exist.' });

    const copy = await this.prisma.question.create({
      data: {
        organizationId: source.organizationId,
        branchId: source.branchId,
        subjectId: source.subjectId,
        chapterId: source.chapterId,
        topicId: source.topicId,
        type: source.type,
        difficulty: source.difficulty,
        body: source.body,
        explanation: source.explanation,
        marks: source.marks,
        negativeMarks: source.negativeMarks,
        numericAnswer: source.numericAnswer,
        numericTolerance: source.numericTolerance,
        createdById: ctx.userId,
        options: {
          create: source.options.map((o) => ({
            label: o.label, body: o.body, isCorrect: o.isCorrect, sequence: o.sequence,
          })),
        },
      },
      include: INCLUDE,
    });

    return shape(copy);
  }

  /** Retiring a question keeps every past paper intact — it is never deleted. */
  async retire(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    await this.prisma.question.update({ where: { id }, data: { isActive: false } });
    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'question.retire', entityType: 'Question', entityId: id,
    });
    return { retired: true };
  }

  private async assertSubject(ctx: TenantContext, input: any) {
    const subject = await this.prisma.subject.findFirst({
      where: { id: input.subjectId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!subject) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That subject does not exist.', details: { subjectId: 'Pick a subject.' } });
    }
    if (input.chapterId) {
      const chapter = await this.prisma.chapter.findFirst({
        where: { id: input.chapterId, organizationId: ctx.organizationId, subjectId: input.subjectId },
        select: { id: true },
      });
      if (!chapter) {
        throw new BadRequestException({
          code: 'CHAPTER_MISMATCH',
          message: 'That chapter does not belong to the chosen subject.',
          details: { chapterId: 'Pick a chapter from this subject.' },
        });
      }
    }
  }
}

function shape<T extends { _count: { testLinks: number }; lockedAt: Date | null; branchId: string | null }>(q: T) {
  const { _count, ...rest } = q;
  return {
    ...rest,
    usedInTests: _count.testLinks,
    locked: Boolean(q.lockedAt),
    scope: q.branchId ? ('branch' as const) : ('organization' as const),
  };
}
