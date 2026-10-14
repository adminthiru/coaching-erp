import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type EnquiryStage } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { StudentsService } from '../students/students.service';
import { assertBranchAccess, branchScope, type TenantContext } from '../scope/tenant-context';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

/**
 * Spec §38 pipeline: New → Contacted → Counselling → Trial → Follow-up →
 * Admission, with Lost reachable from anywhere before admission.
 *
 * Moving backwards is allowed — a trial that needs more counselling is ordinary —
 * but ADMITTED is terminal and only the conversion endpoint may set it, so an
 * enquiry can never be marked admitted without a student actually existing.
 */
const ALLOWED: Record<EnquiryStage, EnquiryStage[]> = {
  NEW: ['CONTACTED', 'COUNSELLING', 'TRIAL', 'FOLLOW_UP', 'LOST'],
  CONTACTED: ['NEW', 'COUNSELLING', 'TRIAL', 'FOLLOW_UP', 'LOST'],
  COUNSELLING: ['CONTACTED', 'TRIAL', 'FOLLOW_UP', 'LOST'],
  TRIAL: ['COUNSELLING', 'FOLLOW_UP', 'LOST'],
  FOLLOW_UP: ['COUNSELLING', 'TRIAL', 'LOST'],
  ADMITTED: [],
  LOST: ['NEW', 'CONTACTED', 'COUNSELLING', 'FOLLOW_UP'],
};

const LIST_SORTS = ['createdAt', 'studentName', 'stage', 'nextFollowUpAt'] as const;

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly students: StudentsService,
  ) {}

  async list(
    ctx: TenantContext,
    query: PaginationQuery & { stage?: EnquiryStage; assignedToId?: string; overdue?: boolean },
  ) {
    const where: Prisma.EnquiryWhereInput = {
      organizationId: ctx.organizationId,
      ...branchScope(ctx),
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.overdue
        ? { nextFollowUpAt: { lt: new Date() }, stage: { notIn: ['ADMITTED', 'LOST'] } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { studentName: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { enquiryCode: { contains: query.search.toUpperCase() } },
              { parentName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.enquiry.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(LIST_SORTS, query.sortBy, query.sortDir, 'createdAt'),
        include: {
          branch: { select: { id: true, name: true, code: true } },
          course: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          convertedStudent: { select: { id: true, studentCode: true } },
        },
      }),
      this.prisma.enquiry.count({ where }),
    ]);

    const now = new Date();
    return paginate(
      rows.map((e) => ({
        ...e,
        overdue: Boolean(
          e.nextFollowUpAt && e.nextFollowUpAt < now && !['ADMITTED', 'LOST'].includes(e.stage),
        ),
      })),
      total,
      query,
    );
  }

  /** Counts per stage — drives the pipeline board (spec §38). */
  async pipeline(ctx: TenantContext) {
    const where: Prisma.EnquiryWhereInput = { organizationId: ctx.organizationId, ...branchScope(ctx) };

    // groupBy is issued outside $transaction: Prisma's conditional result typing
    // collapses inside the array form, and these two reads need no atomicity.
    const [grouped, overdue] = await Promise.all([
      this.prisma.enquiry.groupBy({ by: ['stage'], where, _count: true }),
      this.prisma.enquiry.count({
        where: { ...where, nextFollowUpAt: { lt: new Date() }, stage: { notIn: ['ADMITTED', 'LOST'] } },
      }),
    ]);

    const counts = Object.fromEntries(grouped.map((g) => [g.stage, g._count])) as Record<EnquiryStage, number>;
    const total = grouped.reduce((sum, g) => sum + g._count, 0);
    const admitted = counts.ADMITTED ?? 0;
    const closed = admitted + (counts.LOST ?? 0);

    return {
      counts,
      total,
      overdue,
      // Conversion measured against *closed* enquiries; open ones have not had
      // their chance yet, and including them would understate the rate.
      conversionRate: closed === 0 ? 0 : (admitted / closed) * 100,
    };
  }

  async get(ctx: TenantContext, id: string) {
    const enquiry = await this.prisma.enquiry.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        course: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        convertedStudent: { select: { id: true, studentCode: true, name: true } },
        activities: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!enquiry) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That enquiry does not exist.' });
    assertBranchAccess(ctx, enquiry.branchId);
    return enquiry;
  }

  async create(ctx: TenantContext, input: any) {
    const branchId = input.branchId ?? ctx.activeBranchId;
    if (!branchId) {
      throw new BadRequestException({
        code: 'BRANCH_REQUIRED',
        message: 'Choose a branch first, or switch out of the all-branch view.',
        details: { branchId: 'Pick a branch.' },
      });
    }
    assertBranchAccess(ctx, branchId);

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, organizationId: ctx.organizationId },
      select: { id: true, status: true },
    });
    if (!branch) throw new BadRequestException({ code: 'NOT_FOUND', message: 'That branch does not exist.' });
    if (branch.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'ARCHIVED', message: 'You cannot log enquiries for an archived branch.' });
    }
    if (input.assignedToId) await this.assertCounsellor(ctx, input.assignedToId, branchId);

    const enquiry = await this.prisma.$transaction(async (tx) => {
      const count = await tx.enquiry.count({ where: { organizationId: ctx.organizationId } });
      const created = await tx.enquiry.create({
        data: {
          organizationId: ctx.organizationId,
          branchId,
          enquiryCode: `ENQ${String(count + 1).padStart(5, '0')}`,
          studentName: input.studentName,
          phone: input.phone,
          email: input.email || null,
          parentName: input.parentName || null,
          parentPhone: input.parentPhone || null,
          targetExam: input.targetExam,
          courseId: input.courseId ?? null,
          source: input.source,
          assignedToId: input.assignedToId ?? null,
          nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null,
          notes: input.notes || null,
        },
      });

      await tx.enquiryActivity.create({
        data: {
          enquiryId: created.id,
          type: 'STAGE_CHANGE',
          toStage: 'NEW',
          note: 'Enquiry logged',
          actorId: ctx.userId,
          actorName: ctx.name,
        },
      });

      return created;
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'enquiry.create', entityType: 'Enquiry', entityId: enquiry.id,
      after: { enquiryCode: enquiry.enquiryCode, studentName: enquiry.studentName, branchId },
    });

    return this.get(ctx, enquiry.id);
  }

  async update(ctx: TenantContext, id: string, input: any) {
    const before = await this.get(ctx, id);
    if (before.stage === 'ADMITTED') {
      throw new BadRequestException({
        code: 'ALREADY_ADMITTED',
        message: 'This enquiry has been converted. Edit the student record instead.',
      });
    }
    if (input.assignedToId) await this.assertCounsellor(ctx, input.assignedToId, before.branchId);

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined) continue;
      if (k === 'nextFollowUpAt') data[k] = v ? new Date(v as string) : null;
      else data[k] = v === '' ? null : v;
    }

    await this.prisma.enquiry.update({ where: { id }, data });
    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'enquiry.update', entityType: 'Enquiry', entityId: id, after: data,
    });

    return this.get(ctx, id);
  }

  /** Every stage move is recorded on the enquiry's timeline. */
  async moveStage(ctx: TenantContext, id: string, stage: EnquiryStage, input: any) {
    const enquiry = await this.get(ctx, id);

    if (stage === 'ADMITTED') {
      throw new BadRequestException({
        code: 'USE_CONVERT',
        message: 'Convert the enquiry to a student instead — that is what marks it admitted.',
      });
    }
    if (enquiry.stage === stage) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: 'The enquiry is already at that stage.' });
    }
    if (!ALLOWED[enquiry.stage].includes(stage)) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `An enquiry cannot move from ${enquiry.stage} to ${stage}.`,
        details: { from: enquiry.stage, to: stage, allowed: ALLOWED[enquiry.stage] },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.enquiry.update({
        where: { id },
        data: {
          stage,
          lostReason: stage === 'LOST' ? input.lostReason : null,
          nextFollowUpAt: input.nextFollowUpAt
            ? new Date(input.nextFollowUpAt)
            : stage === 'LOST'
              ? null
              : enquiry.nextFollowUpAt,
        },
      });
      await tx.enquiryActivity.create({
        data: {
          enquiryId: id,
          type: 'STAGE_CHANGE',
          fromStage: enquiry.stage,
          toStage: stage,
          note: input.note || (stage === 'LOST' ? input.lostReason : null),
          actorId: ctx.userId,
          actorName: ctx.name,
        },
      });
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: `enquiry.${stage.toLowerCase()}`, entityType: 'Enquiry', entityId: id,
      before: { stage: enquiry.stage }, after: { stage }, reason: input.lostReason || input.note,
    });

    return this.get(ctx, id);
  }

  async addActivity(ctx: TenantContext, id: string, input: any) {
    await this.get(ctx, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.enquiryActivity.create({
        data: {
          enquiryId: id,
          type: input.type,
          note: input.note,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          actorId: ctx.userId,
          actorName: ctx.name,
        },
      });
      // Logging a scheduled follow-up moves the enquiry's due date with it.
      if (input.type === 'FOLLOW_UP' && input.scheduledAt) {
        await tx.enquiry.update({ where: { id }, data: { nextFollowUpAt: new Date(input.scheduledAt) } });
      }
    });
    return this.get(ctx, id);
  }

  /**
   * Spec §38 — admission conversion.
   *
   * Creating the student and marking the enquiry admitted happen together: an
   * enquiry marked ADMITTED with no student, or a student with no trace of the
   * enquiry that produced them, are both states the product should never show.
   */
  async convert(ctx: TenantContext, id: string, input: any) {
    const enquiry = await this.get(ctx, id);

    if (enquiry.stage === 'ADMITTED' || enquiry.convertedStudentId) {
      throw new BadRequestException({
        code: 'ALREADY_ADMITTED',
        message: 'This enquiry has already been converted.',
        details: { studentId: enquiry.convertedStudentId },
      });
    }
    if (enquiry.stage === 'LOST') {
      throw new BadRequestException({
        code: 'ENQUIRY_LOST',
        message: 'Reopen this enquiry before converting it.',
      });
    }

    // Delegated so admission runs the same quota check, code allocation, branch
    // history and batch-capacity rules as any other student creation.
    const student = await this.students.create(ctx, {
      name: enquiry.studentName,
      studentCode: input.studentCode,
      phone: enquiry.phone,
      email: enquiry.email ?? undefined,
      parentName: enquiry.parentName ?? undefined,
      parentPhone: enquiry.parentPhone ?? undefined,
      targetExam: enquiry.targetExam,
      courseId: enquiry.courseId ?? undefined,
      branchId: enquiry.branchId,
      batchId: input.batchId,
      admissionDate: input.admissionDate,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
    });

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.enquiry.update({
        where: { id },
        data: { stage: 'ADMITTED', convertedStudentId: student.id, admittedAt: now, nextFollowUpAt: null },
      });
      await tx.enquiryActivity.create({
        data: {
          enquiryId: id,
          type: 'STAGE_CHANGE',
          fromStage: enquiry.stage,
          toStage: 'ADMITTED',
          note: `Converted to student ${student.studentCode}`,
          actorId: ctx.userId,
          actorName: ctx.name,
        },
      });
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'enquiry.convert', entityType: 'Enquiry', entityId: id,
      after: { studentId: student.id, studentCode: student.studentCode },
    });

    return { enquiry: await this.get(ctx, id), student };
  }

  /** A counsellor must be able to work at the enquiry's branch. */
  private async assertCounsellor(ctx: TenantContext, userId: string, branchId: string) {
    const user = await this.prisma.orgUser.findFirst({
      where: { id: userId, organizationId: ctx.organizationId, deletedAt: null },
      include: { branches: { where: { endedAt: null }, select: { branchId: true } } },
    });
    if (!user) {
      throw new BadRequestException({
        code: 'NOT_FOUND',
        message: 'That person does not exist.',
        details: { assignedToId: 'Pick someone from this organization.' },
      });
    }
    const crossBranch = user.role === 'ORG_OWNER' || user.role === 'ORG_ADMIN';
    if (!crossBranch && !user.branches.some((b) => b.branchId === branchId)) {
      throw new BadRequestException({
        code: 'ASSIGNEE_WRONG_BRANCH',
        message: `${user.name} is not assigned to this branch.`,
        details: { assignedToId: 'Not assigned to this branch.' },
      });
    }
  }
}
