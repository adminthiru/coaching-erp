import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type HomeworkStatus, type SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

/** Spec §58. CLOSED is terminal — a closed assignment does not reopen. */
const ALLOWED: Record<HomeworkStatus, HomeworkStatus[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['CLOSED'],
  CLOSED: [],
};

const INCLUDE = {
  subject: { select: { id: true, name: true, code: true } },
  batch: { select: { id: true, name: true, code: true, branchId: true } },
  createdBy: { select: { id: true, name: true } },
  targets: { include: { branch: { select: { id: true, name: true, code: true } } } },
  students: { include: { student: { select: { id: true, name: true, studentCode: true } } } },
  _count: { select: { submissions: true } },
} as const;

@Injectable()
export class HomeworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** A homework item is visible if it reaches a branch this caller can see. */
  private visibility(ctx: TenantContext): Prisma.HomeworkWhereInput {
    const reachable = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.accessibleBranchIds;
    if (reachable === null) return {};
    return {
      OR: [
        { targets: { some: { branchId: { in: reachable } } } },
        { batch: { branchId: { in: reachable } } },
        { students: { some: { student: { branchId: { in: reachable } } } } },
      ],
    };
  }

  async list(ctx: TenantContext, query: PaginationQuery & { status?: HomeworkStatus }) {
    const where: Prisma.HomeworkWhereInput = {
      organizationId: ctx.organizationId,
      ...this.visibility(ctx),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.homework.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['dueAt', 'createdAt', 'title'] as const, query.sortBy, query.sortDir, 'dueAt'),
        include: INCLUDE,
      }),
      this.prisma.homework.count({ where }),
    ]);

    return paginate(rows.map(shape), total, query);
  }

  async get(ctx: TenantContext, id: string) {
    const homework = await this.prisma.homework.findFirst({
      where: { id, organizationId: ctx.organizationId, ...this.visibility(ctx) },
      include: INCLUDE,
    });
    if (!homework) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That homework does not exist.' });
    return shape(homework);
  }

  async create(ctx: TenantContext, input: any) {
    const { branchIds, batch, students } = await this.resolveAudience(ctx, input);

    const homework = await this.prisma.homework.create({
      data: {
        organizationId: ctx.organizationId,
        title: input.title,
        instructions: input.instructions,
        subjectId: input.subjectId || null,
        audience: input.audience,
        batchId: batch?.id ?? null,
        dueAt: new Date(input.dueAt),
        maxMarks: input.maxMarks ?? null,
        attachmentUrl: input.attachmentUrl || null,
        createdById: ctx.userId,
        targets: { create: branchIds.map((branchId: string) => ({ branchId })) },
        students: { create: students.map((s: { id: string }) => ({ studentId: s.id })) },
      },
      include: INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'homework.create', entityType: 'Homework', entityId: homework.id,
      after: { title: homework.title, audience: homework.audience },
    });

    return shape(homework);
  }

  /** PUBLISHED locks who this reaches and creates the roster; CLOSED just ends it. */
  async changeStatus(ctx: TenantContext, id: string, status: HomeworkStatus) {
    const homework = await this.get(ctx, id);

    if (homework.status === status) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: `This homework is already ${status.toLowerCase()}.` });
    }
    if (!ALLOWED[homework.status].includes(status)) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `Homework cannot move from ${homework.status} to ${status}.`,
      });
    }

    if (status === 'PUBLISHED') {
      const roster = await this.resolveRoster(
        ctx, id, homework.audience, homework.batch?.id ?? null, homework.targets.map((t) => t.id),
      );
      if (!roster.length) {
        throw new BadRequestException({
          code: 'NO_STUDENTS',
          message: 'Nobody is reached by this homework yet — check its targeting.',
        });
      }
      await this.prisma.$transaction([
        this.prisma.homework.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } }),
        this.prisma.homeworkSubmission.createMany({
          data: roster.map((s) => ({
            organizationId: ctx.organizationId, homeworkId: id, studentId: s.id, branchId: s.branchId,
          })),
          skipDuplicates: true,
        }),
      ]);
    } else {
      await this.prisma.homework.update({ where: { id }, data: { status } });
    }

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: `homework.${status.toLowerCase()}`, entityType: 'Homework', entityId: id,
      before: { status: homework.status }, after: { status },
    });

    return this.get(ctx, id);
  }

  /** The roster — one row per student this homework reaches, for marking. */
  async roster(ctx: TenantContext, id: string) {
    await this.get(ctx, id); // visibility + existence check
    const reachable = ctx.activeBranchId ? [ctx.activeBranchId] : ctx.accessibleBranchIds;

    return this.prisma.homeworkSubmission.findMany({
      where: { homeworkId: id, ...(reachable ? { branchId: { in: reachable } } : {}) },
      orderBy: [{ status: 'asc' }],
      include: {
        student: { select: { id: true, name: true, studentCode: true } },
        branch: { select: { id: true, name: true, code: true } },
        gradedBy: { select: { id: true, name: true } },
      },
    });
  }

  async markSubmission(ctx: TenantContext, submissionId: string, input: { status: SubmissionStatus; note?: string }) {
    const submission = await this.prisma.homeworkSubmission.findFirst({
      where: { id: submissionId, organizationId: ctx.organizationId },
    });
    if (!submission) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That submission does not exist.' });
    assertBranchAccess(ctx, submission.branchId);

    return this.prisma.homeworkSubmission.update({
      where: { id: submissionId },
      data: {
        status: input.status,
        submittedAt: input.status === 'PENDING' ? null : (submission.submittedAt ?? new Date()),
        note: input.note || null,
      },
      include: { student: { select: { id: true, name: true, studentCode: true } } },
    });
  }

  async gradeSubmission(ctx: TenantContext, submissionId: string, input: { marksAwarded: number | null; feedback?: string }) {
    const submission = await this.prisma.homeworkSubmission.findFirst({
      where: { id: submissionId, organizationId: ctx.organizationId },
    });
    if (!submission) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That submission does not exist.' });
    assertBranchAccess(ctx, submission.branchId);

    return this.prisma.homeworkSubmission.update({
      where: { id: submissionId },
      data: {
        marksAwarded: input.marksAwarded,
        feedback: input.feedback || null,
        gradedAt: new Date(),
        gradedById: ctx.userId,
      },
      include: { student: { select: { id: true, name: true, studentCode: true } } },
    });
  }

  /** Turns an audience choice into branches/batch/students, refusing anything the caller cannot reach. */
  private async resolveAudience(ctx: TenantContext, input: any) {
    let branchIds: string[] = [];
    let batch: { id: string; branchId: string } | null = null;
    let students: { id: string; branchId: string }[] = [];

    if (input.audience === 'BATCH') {
      const found = await this.prisma.batch.findFirst({
        where: { id: input.batchId, organizationId: ctx.organizationId },
        select: { id: true, branchId: true },
      });
      if (!found) {
        throw new BadRequestException({ code: 'NOT_FOUND', message: 'That batch does not exist.', details: { batchId: 'Pick a batch.' } });
      }
      assertBranchAccess(ctx, found.branchId);
      batch = found;
    } else if (input.audience === 'BRANCH' || input.audience === 'MULTI_BRANCH') {
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
      for (const id of requested) assertBranchAccess(ctx, id);
      const found = await this.prisma.branch.count({ where: { id: { in: requested }, organizationId: ctx.organizationId } });
      if (found !== requested.length) {
        throw new BadRequestException({ code: 'NOT_FOUND', message: 'One or more selected branches do not exist.' });
      }
      branchIds = requested;
    } else if (input.audience === 'STUDENTS') {
      const found = await this.prisma.student.findMany({
        where: { id: { in: input.studentIds }, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, branchId: true },
      });
      if (found.length !== input.studentIds.length) {
        throw new BadRequestException({ code: 'NOT_FOUND', message: 'One or more selected students do not exist.', details: { studentIds: 'Pick valid students.' } });
      }
      for (const s of found) assertBranchAccess(ctx, s.branchId);
      students = found;
    }

    return { branchIds, batch, students };
  }

  /** Everyone spec §58's audience resolves to, as of the moment this publishes. */
  private async resolveRoster(
    ctx: TenantContext,
    homeworkId: string,
    audience: string,
    batchId: string | null,
    branchIds: string[],
  ): Promise<{ id: string; branchId: string }[]> {
    if (audience === 'STUDENTS') {
      const rows = await this.prisma.homeworkStudent.findMany({
        where: { homeworkId },
        select: { student: { select: { id: true, branchId: true } } },
      });
      return rows.map((r) => r.student);
    }
    if (audience === 'BATCH' && batchId) {
      const rows = await this.prisma.batchStudent.findMany({
        where: { batchId, status: 'ENROLLED' },
        select: { student: { select: { id: true, branchId: true } } },
      });
      return rows.map((r) => r.student);
    }
    // BRANCH / MULTI_BRANCH — every active student currently at one of the target branches.
    return this.prisma.student.findMany({
      where: { organizationId: ctx.organizationId, branchId: { in: branchIds }, status: 'ACTIVE', deletedAt: null },
      select: { id: true, branchId: true },
    });
  }
}

function shape<T extends {
  targets: { branch: { id: string; name: string; code: string } }[];
  students: { student: { id: string; name: string; studentCode: string } }[];
  _count: { submissions: number };
}>(homework: T) {
  const { _count, targets, students, ...rest } = homework;
  return {
    ...rest,
    targets: targets.map((t) => t.branch),
    students: students.map((s) => s.student),
    submissionCount: _count.submissions,
  };
}
