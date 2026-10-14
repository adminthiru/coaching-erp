import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type DoubtStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, branchScope, type TenantContext } from '../scope/tenant-context';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

/** ANSWERED can reopen (a follow-up call); CLOSED is terminal. */
const ALLOWED: Record<DoubtStatus, DoubtStatus[]> = {
  OPEN: ['ANSWERED', 'CLOSED'],
  ANSWERED: ['OPEN', 'CLOSED'],
  CLOSED: [],
};

const INCLUDE = {
  student: { select: { id: true, name: true, studentCode: true } },
  subject: { select: { id: true, name: true, code: true } },
  batch: { select: { id: true, name: true, code: true } },
  branch: { select: { id: true, name: true, code: true } },
  assignedTo: { select: { id: true, name: true } },
  raisedBy: { select: { id: true, name: true } },
  _count: { select: { messages: true } },
} as const;

/**
 * Spec §59 — a doubt routes to branch faculty (unassigned, anyone at the
 * branch can pick it up), one specifically assigned faculty member, or an
 * organization-wide pool. No student portal exists yet (see README), so a
 * doubt is logged by staff on the student's behalf.
 */
@Injectable()
export class DoubtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, query: PaginationQuery & { status?: DoubtStatus; mine?: boolean }) {
    const where: Prisma.DoubtWhereInput = {
      organizationId: ctx.organizationId,
      ...branchScope(ctx),
      ...(query.status ? { status: query.status } : {}),
      ...(query.mine ? { assignedToId: ctx.userId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.doubt.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['createdAt', 'status'] as const, query.sortBy, query.sortDir, 'createdAt'),
        include: INCLUDE,
      }),
      this.prisma.doubt.count({ where }),
    ]);

    return paginate(rows, total, query);
  }

  async get(ctx: TenantContext, id: string) {
    const doubt = await this.prisma.doubt.findFirst({
      where: { id, organizationId: ctx.organizationId, ...branchScope(ctx) },
      include: { ...INCLUDE, messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, name: true } } } } },
    });
    if (!doubt) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That doubt does not exist.' });
    return doubt;
  }

  async create(ctx: TenantContext, input: any) {
    const student = await this.prisma.student.findFirst({
      where: { id: input.studentId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, branchId: true },
    });
    if (!student) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That student does not exist.', details: { studentId: 'Pick a student.' } });
    }
    assertBranchAccess(ctx, student.branchId);

    const subject = await this.prisma.subject.findFirst({
      where: { id: input.subjectId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!subject) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That subject does not exist.', details: { subjectId: 'Pick a subject.' } });
    }

    // A snapshot of the student's current batch — both the routing lookup below
    // and the historical record use this, not a live join that would drift if
    // the student later transfers batches.
    const enrolment = await this.prisma.batchStudent.findFirst({
      where: { studentId: student.id, status: 'ENROLLED' },
      select: { batchId: true },
    });

    let assignedToId: string | null = input.assignedToId ?? null;
    if (assignedToId) {
      await this.assertFaculty(ctx, assignedToId);
    } else if (enrolment) {
      // Spec §59 tier 2 — the faculty already teaching this subject to this
      // batch is the natural first guess; tier 1 (branch faculty, unassigned)
      // and tier 3 (org pool) are both represented by leaving this null.
      const assignment = await this.prisma.batchFaculty.findFirst({
        where: { batchId: enrolment.batchId, subjectId: subject.id, endedAt: null },
        select: { facultyId: true },
      });
      assignedToId = assignment?.facultyId ?? null;
    }

    const doubt = await this.prisma.doubt.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: student.branchId,
        studentId: student.id,
        batchId: enrolment?.batchId ?? null,
        subjectId: subject.id,
        question: input.question,
        assignedToId,
        raisedById: ctx.userId,
      },
      include: INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'doubt.create', entityType: 'Doubt', entityId: doubt.id,
      after: { studentId: student.id, subjectId: subject.id, assignedToId },
    });

    return doubt;
  }

  async assign(ctx: TenantContext, id: string, assignedToId: string | null) {
    const doubt = await this.getRaw(ctx, id);
    if (doubt.status === 'CLOSED') {
      throw new BadRequestException({ code: 'DOUBT_CLOSED', message: 'This doubt is closed and cannot be reassigned.' });
    }
    if (assignedToId) await this.assertFaculty(ctx, assignedToId);

    const updated = await this.prisma.doubt.update({ where: { id }, data: { assignedToId }, include: INCLUDE });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'doubt.assign', entityType: 'Doubt', entityId: id,
      before: { assignedToId: doubt.assignedToId }, after: { assignedToId },
    });

    return updated;
  }

  /** A reply is the resolution mechanism — `resolve` is a separate flag because a reply can just be a follow-up question. */
  async reply(ctx: TenantContext, id: string, input: { body: string; resolve: boolean }) {
    const doubt = await this.getRaw(ctx, id);
    if (doubt.status === 'CLOSED') {
      throw new BadRequestException({ code: 'DOUBT_CLOSED', message: 'This doubt is closed. Reopen it to add another reply.' });
    }

    await this.prisma.$transaction([
      this.prisma.doubtMessage.create({ data: { doubtId: id, authorId: ctx.userId, body: input.body } }),
      ...(input.resolve && doubt.status !== 'ANSWERED'
        ? [this.prisma.doubt.update({ where: { id }, data: { status: 'ANSWERED' as const } })]
        : []),
    ]);

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'doubt.reply', entityType: 'Doubt', entityId: id,
      after: { resolve: input.resolve },
    });

    return this.get(ctx, id);
  }

  async setStatus(ctx: TenantContext, id: string, status: DoubtStatus) {
    const doubt = await this.getRaw(ctx, id);
    if (doubt.status === status) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: `This doubt is already ${status.toLowerCase()}.` });
    }
    if (!ALLOWED[doubt.status].includes(status)) {
      throw new BadRequestException({ code: 'INVALID_TRANSITION', message: `A doubt cannot move from ${doubt.status} to ${status}.` });
    }

    await this.prisma.doubt.update({
      where: { id },
      data: { status, closedAt: status === 'CLOSED' ? new Date() : null },
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: `doubt.${status.toLowerCase()}`, entityType: 'Doubt', entityId: id,
      before: { status: doubt.status }, after: { status },
    });

    return this.get(ctx, id);
  }

  private async getRaw(ctx: TenantContext, id: string) {
    const doubt = await this.prisma.doubt.findFirst({ where: { id, organizationId: ctx.organizationId, ...branchScope(ctx) } });
    if (!doubt) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That doubt does not exist.' });
    return doubt;
  }

  private async assertFaculty(ctx: TenantContext, facultyId: string) {
    const faculty = await this.prisma.orgUser.findFirst({
      where: { id: facultyId, organizationId: ctx.organizationId, role: 'FACULTY', deletedAt: null },
      select: { id: true },
    });
    if (!faculty) {
      throw new BadRequestException({ code: 'NOT_FOUND', message: 'That faculty member does not exist.', details: { assignedToId: 'Pick a faculty member.' } });
    }
  }
}
