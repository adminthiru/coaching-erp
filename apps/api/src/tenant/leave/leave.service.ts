import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type LeaveStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, branchScope, type TenantContext } from '../scope/tenant-context';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

const INCLUDE = {
  student: { select: { id: true, name: true, studentCode: true } },
  faculty: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, code: true } },
} as const;

/**
 * Spec §48 — student and faculty leave.
 *
 * A Branch Admin approves requests at their own branch; an org-level role can
 * approve anywhere. That falls out of `branchScope()` and `assertBranchAccess()`
 * rather than needing its own permission table.
 */
@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, query: PaginationQuery & { status?: LeaveStatus; subjectType?: any }) {
    const where: Prisma.LeaveRequestWhereInput = {
      organizationId: ctx.organizationId,
      ...branchScope(ctx),
      ...(query.status ? { status: query.status } : {}),
      ...(query.subjectType ? { subjectType: query.subjectType } : {}),
      ...(query.search
        ? {
            OR: [
              { student: { name: { contains: query.search, mode: 'insensitive' } } },
              { faculty: { name: { contains: query.search, mode: 'insensitive' } } },
              { reason: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(['createdAt', 'fromDate', 'status'] as const, query.sortBy, query.sortDir, 'createdAt'),
        include: INCLUDE,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return paginate(
      rows.map((r) => ({
        ...r,
        person: r.student ?? r.faculty,
        days: Math.round((r.toDate.getTime() - r.fromDate.getTime()) / 864e5) + 1,
      })),
      total,
      query,
    );
  }

  async pendingCount(ctx: TenantContext) {
    return this.prisma.leaveRequest.count({
      where: { organizationId: ctx.organizationId, ...branchScope(ctx), status: 'PENDING' },
    });
  }

  async create(ctx: TenantContext, input: any) {
    const from = new Date(`${input.fromDate}T00:00:00.000Z`);
    const to = new Date(`${input.toDate}T00:00:00.000Z`);

    let branchId: string;
    if (input.subjectType === 'STUDENT') {
      const student = await this.prisma.student.findFirst({
        where: { id: input.studentId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, branchId: true, status: true, name: true },
      });
      if (!student) {
        throw new BadRequestException({ code: 'NOT_FOUND', message: 'That student does not exist.', details: { studentId: 'Pick a student.' } });
      }
      if (student.status !== 'ACTIVE') {
        throw new BadRequestException({ code: 'STUDENT_INACTIVE', message: `${student.name} is not an active student.` });
      }
      assertBranchAccess(ctx, student.branchId);
      branchId = student.branchId;
    } else {
      const faculty = await this.prisma.orgUser.findFirst({
        where: { id: input.facultyId, organizationId: ctx.organizationId, deletedAt: null },
        include: { branches: { where: { endedAt: null }, select: { branchId: true, isPrimary: true } } },
      });
      if (!faculty) {
        throw new BadRequestException({ code: 'NOT_FOUND', message: 'That person does not exist.', details: { facultyId: 'Pick a staff member.' } });
      }
      const primary = faculty.branches.find((b) => b.isPrimary) ?? faculty.branches[0];
      if (!primary) {
        throw new BadRequestException({
          code: 'NO_BRANCH',
          message: `${faculty.name} is not assigned to a branch.`,
        });
      }
      assertBranchAccess(ctx, primary.branchId);
      branchId = primary.branchId;
    }

    // A second request over the same dates is almost always a double-submit.
    const overlapping = await this.prisma.leaveRequest.findFirst({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['PENDING', 'APPROVED'] },
        ...(input.subjectType === 'STUDENT' ? { studentId: input.studentId } : { facultyId: input.facultyId }),
        fromDate: { lte: to },
        toDate: { gte: from },
      },
      select: { id: true, fromDate: true, toDate: true, status: true },
    });
    if (overlapping) {
      throw new BadRequestException({
        code: 'LEAVE_OVERLAP',
        message: `There is already a ${overlapping.status.toLowerCase()} request covering ${overlapping.fromDate.toISOString().slice(0, 10)} to ${overlapping.toDate.toISOString().slice(0, 10)}.`,
        details: { fromDate: 'These dates overlap an existing request.' },
      });
    }

    const leave = await this.prisma.leaveRequest.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        subjectType: input.subjectType,
        studentId: input.subjectType === 'STUDENT' ? input.studentId : null,
        facultyId: input.subjectType === 'FACULTY' ? input.facultyId : null,
        fromDate: from,
        toDate: to,
        reason: input.reason,
        requestedById: ctx.userId,
      },
      include: INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'leave.create', entityType: 'LeaveRequest', entityId: leave.id,
      after: { subjectType: leave.subjectType, from: input.fromDate, to: input.toDate },
    });

    return leave;
  }

  /**
   * Approving marks the covered classes EXCUSED rather than leaving them to be
   * mis-marked absent later — the whole point of asking for leave in advance.
   */
  async review(ctx: TenantContext, id: string, status: 'APPROVED' | 'REJECTED', reviewNote?: string) {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: INCLUDE,
    });
    if (!leave) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That request does not exist.' });
    assertBranchAccess(ctx, leave.branchId);

    if (leave.status !== 'PENDING') {
      throw new BadRequestException({
        code: 'ALREADY_REVIEWED',
        message: `This request was already ${leave.status.toLowerCase()}.`,
      });
    }
    // Reviewing your own request is not a review.
    if (leave.requestedById === ctx.userId && leave.facultyId === ctx.userId) {
      throw new ForbiddenException({
        code: 'SELF_REVIEW',
        message: 'You cannot approve your own leave request.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.leaveRequest.update({
        where: { id },
        data: { status, reviewedById: ctx.userId, reviewedAt: new Date(), reviewNote: reviewNote || null },
        include: INCLUDE,
      });

      if (status === 'APPROVED' && leave.studentId) {
        await tx.attendance.updateMany({
          where: {
            studentId: leave.studentId,
            date: { gte: leave.fromDate, lte: leave.toDate },
            // Only correct unexplained absences; a recorded PRESENT stays as it is.
            status: 'ABSENT',
          },
          data: { status: 'EXCUSED', note: 'Approved leave' },
        });
      }

      return row;
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: `leave.${status.toLowerCase()}`, entityType: 'LeaveRequest', entityId: id,
      before: { status: leave.status }, after: { status }, reason: reviewNote,
    });

    return updated;
  }

  async cancel(ctx: TenantContext, id: string) {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!leave) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That request does not exist.' });
    assertBranchAccess(ctx, leave.branchId);
    if (leave.status === 'CANCELLED') {
      throw new BadRequestException({ code: 'NO_CHANGE', message: 'That request is already cancelled.' });
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: INCLUDE,
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'leave.cancel', entityType: 'LeaveRequest', entityId: id,
      before: { status: leave.status },
    });

    return updated;
  }
}
