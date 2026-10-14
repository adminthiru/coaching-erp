import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type StudentStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { EntitlementsService } from '../../platform/entitlements/entitlements.service';
import { assertBranchAccess, branchScope, type TenantContext } from '../scope/tenant-context';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

/** Spec §39. A student is never deleted — they are archived. */
const ALLOWED: Record<StudentStatus, StudentStatus[]> = {
  ACTIVE: ['INACTIVE', 'DROPPED', 'PASSED_OUT', 'ARCHIVED'],
  INACTIVE: ['ACTIVE', 'DROPPED', 'ARCHIVED'],
  DROPPED: ['ACTIVE', 'ARCHIVED'],
  PASSED_OUT: ['ARCHIVED'],
  ARCHIVED: [],
};

const LIST_SORTS = ['name', 'studentCode', 'admissionDate', 'status', 'createdAt'] as const;

const LIST_SELECT = {
  id: true, studentCode: true, name: true, photoUrl: true, phone: true, status: true,
  targetExam: true, admissionDate: true, gender: true, parentName: true, parentPhone: true,
  branch: { select: { id: true, name: true, code: true } },
  course: { select: { id: true, name: true } },
} as const;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Branch scope comes from `branchScope()`, so a Branch Admin's list is filtered
   * in the query rather than after it — another branch's students are never read.
   */
  async list(
    ctx: TenantContext,
    query: PaginationQuery & { status?: StudentStatus; batchId?: string; courseId?: string; unbatched?: boolean },
  ) {
    const where: Prisma.StudentWhereInput = {
      organizationId: ctx.organizationId,
      deletedAt: null,
      ...branchScope(ctx),
      ...(query.status ? { status: query.status } : { status: { not: 'ARCHIVED' } }),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.batchId ? { batches: { some: { batchId: query.batchId, status: 'ENROLLED' } } } : {}),
      ...(query.unbatched ? { batches: { none: { status: 'ENROLLED' } } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { studentCode: { contains: query.search.toUpperCase() } },
              { phone: { contains: query.search } },
              { parentPhone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(LIST_SORTS, query.sortBy, query.sortDir, 'name'),
        select: {
          ...LIST_SELECT,
          batches: {
            where: { status: 'ENROLLED' },
            select: { batch: { select: { id: true, name: true, code: true } } },
          },
        },
      }),
      this.prisma.student.count({ where }),
    ]);

    return paginate(
      rows.map(({ batches, ...s }) => ({ ...s, batches: batches.map((b) => b.batch) })),
      total,
      query,
    );
  }

  async get(ctx: TenantContext, id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, organizationId: ctx.organizationId, deletedAt: null },
      include: {
        branch: { select: { id: true, name: true, code: true, city: true } },
        course: { select: { id: true, name: true, targetExam: true } },
        batches: {
          orderBy: { joinedAt: 'desc' },
          include: {
            batch: {
              select: {
                id: true, name: true, code: true, status: true,
                branch: { select: { id: true, name: true } },
                course: { select: { id: true, name: true } },
              },
            },
          },
        },
        branchHistory: {
          orderBy: { fromDate: 'desc' },
          include: { branch: { select: { id: true, name: true, code: true } } },
        },
        enquiry: { select: { id: true, enquiryCode: true, source: true, admittedAt: true } },
      },
    });
    if (!student) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That student does not exist.' });
    assertBranchAccess(ctx, student.branchId);

    return {
      ...student,
      currentBatch: student.batches.find((b) => b.status === 'ENROLLED')?.batch ?? null,
    };
  }

  /**
   * Spec §39. Enrolment is gated on the plan's student quota, and the whole
   * admission — student, branch history, optional batch enrolment, usage counter —
   * lands in one transaction so a partial admission cannot exist.
   */
  async create(ctx: TenantContext, input: any) {
    const branchId = await this.resolveBranch(ctx, input.branchId);
    await this.entitlements.assertWithinLimit(ctx.organizationId, 'students', 1);

    if (input.courseId) await this.assertCourse(ctx.organizationId, input.courseId);

    const studentCode = input.studentCode
      ? await this.assertCodeFree(ctx.organizationId, input.studentCode)
      : await this.nextStudentCode(ctx.organizationId);

    const admissionDate = input.admissionDate ? new Date(input.admissionDate) : new Date();

    const batch = input.batchId ? await this.loadEnrollableBatch(ctx, input.batchId, branchId) : null;

    const student = await this.prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: {
          organizationId: ctx.organizationId,
          branchId,
          studentCode,
          name: input.name,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          gender: input.gender,
          phone: input.phone || null,
          email: input.email || null,
          parentName: input.parentName || null,
          parentPhone: input.parentPhone || null,
          parentEmail: input.parentEmail || null,
          parentRelation: input.parentRelation || null,
          previousSchool: input.previousSchool || null,
          previousClass: input.previousClass || null,
          previousMarks: input.previousMarks || null,
          targetExam: input.targetExam,
          courseId: input.courseId ?? null,
          admissionDate,
          addressLine: input.addressLine || null,
          city: input.city || null,
          state: input.state || null,
          pincode: input.pincode || null,
          photoUrl: input.photoUrl || null,
        },
      });

      // Spec §75 — the branch trail starts at admission, not at the first transfer.
      await tx.studentBranchHistory.create({
        data: { studentId: created.id, branchId, fromDate: admissionDate, reason: 'Admission', actorId: ctx.userId },
      });

      if (batch) {
        await tx.batchStudent.create({ data: { batchId: batch.id, studentId: created.id } });
      }

      await this.entitlements.increment(ctx.organizationId, 'students', 1, tx);
      return created;
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'student.create', entityType: 'Student', entityId: student.id,
      after: { studentCode: student.studentCode, name: student.name, branchId, batchId: batch?.id ?? null },
    });

    return this.get(ctx, student.id);
  }

  async update(ctx: TenantContext, id: string, input: any) {
    const before = await this.get(ctx, id);
    if (before.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'ARCHIVED', message: 'Archived students are read-only.' });
    }
    if (input.courseId) await this.assertCourse(ctx.organizationId, input.courseId);
    if (input.studentCode && input.studentCode !== before.studentCode) {
      await this.assertCodeFree(ctx.organizationId, input.studentCode);
    }

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined) continue;
      if (k === 'dateOfBirth' || k === 'admissionDate') data[k] = v ? new Date(v as string) : null;
      else data[k] = v === '' ? null : v;
    }

    await this.prisma.student.update({ where: { id }, data });
    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'student.update', entityType: 'Student', entityId: id, after: data,
    });

    return this.get(ctx, id);
  }

  async changeStatus(ctx: TenantContext, id: string, status: StudentStatus, reason: string) {
    const student = await this.get(ctx, id);
    if (student.status === status) {
      throw new BadRequestException({
        code: 'NO_CHANGE',
        message: `This student is already ${status.toLowerCase().replace(/_/g, ' ')}.`,
      });
    }
    if (!ALLOWED[student.status].includes(status)) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `A student cannot move from ${student.status} to ${status}.`,
        details: { from: student.status, to: status, allowed: ALLOWED[student.status] },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id }, data: { status } });

      // A student who has left stops occupying a seat and stops counting toward
      // the plan's student quota.
      if (status !== 'ACTIVE') {
        await tx.batchStudent.updateMany({
          where: { studentId: id, status: 'ENROLLED' },
          data: { status: 'LEFT', leftAt: new Date() },
        });
      }
      if (status === 'ARCHIVED' && student.status !== 'ARCHIVED') {
        await this.entitlements.increment(ctx.organizationId, 'students', -1, tx);
      }
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: `student.${status.toLowerCase()}`, entityType: 'Student', entityId: id,
      before: { status: student.status }, after: { status }, reason,
    });

    return this.get(ctx, id);
  }

  /**
   * Spec §35. Closes the branch-history row, opens a new one, ends the old batch
   * enrolment and optionally opens one at the destination — all atomically.
   *
   * Historical records keep pointing at the branch that owned them; only future
   * records follow the destination.
   */
  async transfer(ctx: TenantContext, id: string, toBranchId: string, toBatchId: string | undefined, reason: string) {
    const student = await this.get(ctx, id);
    assertBranchAccess(ctx, toBranchId);

    if (student.branchId === toBranchId) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: 'That student is already in this branch.' });
    }
    if (student.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'ARCHIVED', message: 'Archived students cannot be transferred.' });
    }

    const destination = await this.prisma.branch.findFirst({
      where: { id: toBranchId, organizationId: ctx.organizationId },
      select: { id: true, name: true, status: true },
    });
    if (!destination) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That branch does not exist.' });
    if (destination.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'ARCHIVED', message: 'You cannot transfer into an archived branch.' });
    }

    const batch = toBatchId ? await this.loadEnrollableBatch(ctx, toBatchId, toBranchId) : null;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.studentBranchHistory.updateMany({
        where: { studentId: id, toDate: null },
        data: { toDate: now },
      });
      await tx.studentBranchHistory.create({
        data: { studentId: id, branchId: toBranchId, fromDate: now, reason, actorId: ctx.userId },
      });

      await tx.batchStudent.updateMany({
        where: { studentId: id, status: 'ENROLLED' },
        data: { status: 'TRANSFERRED', leftAt: now },
      });
      if (batch) {
        await tx.batchStudent.upsert({
          where: { batchId_studentId: { batchId: batch.id, studentId: id } },
          create: { batchId: batch.id, studentId: id },
          update: { status: 'ENROLLED', leftAt: null, joinedAt: now },
        });
      }

      await tx.student.update({ where: { id }, data: { branchId: toBranchId } });

      await tx.branchTransfer.create({
        data: {
          organizationId: ctx.organizationId,
          entityType: 'STUDENT',
          entityId: id,
          entityLabel: `${student.studentCode} · ${student.name}`,
          fromBranchId: student.branchId,
          toBranchId,
          reason,
          actorId: ctx.userId,
          actorEmail: ctx.email,
        },
      });
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'student.transfer', entityType: 'Student', entityId: id,
      before: { branchId: student.branchId, branchName: student.branch.name },
      after: { branchId: toBranchId, branchName: destination.name, batchId: batch?.id ?? null },
      reason,
    });

    return this.get(ctx, id);
  }

  /** Shows what a transfer would change, before it is confirmed (spec §35). */
  async transferPreview(ctx: TenantContext, id: string, toBranchId: string) {
    const student = await this.get(ctx, id);
    assertBranchAccess(ctx, toBranchId);

    const destination = await this.prisma.branch.findFirst({
      where: { id: toBranchId, organizationId: ctx.organizationId },
      select: { id: true, name: true, code: true, city: true },
    });
    if (!destination) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That branch does not exist.' });

    const batches = await this.prisma.batch.findMany({
      where: { organizationId: ctx.organizationId, branchId: toBranchId, status: { in: ['PLANNED', 'ACTIVE'] } },
      select: {
        id: true, name: true, code: true, capacity: true,
        _count: { select: { students: { where: { status: 'ENROLLED' } } } },
      },
      orderBy: { name: 'asc' },
    });

    return {
      student: { id: student.id, name: student.name, studentCode: student.studentCode },
      from: student.branch,
      to: destination,
      currentBatch: student.currentBatch,
      availableBatches: batches.map(({ _count, ...b }) => ({
        ...b,
        enrolled: _count.students,
        seatsLeft: Math.max(0, b.capacity - _count.students),
        full: _count.students >= b.capacity,
      })),
      impact: [
        'Attendance, fees and results already recorded stay with the current branch.',
        'Future records are created against the destination branch.',
        student.currentBatch ? `The current batch enrolment (${student.currentBatch.name}) will end.` : 'The student is not in a batch.',
      ],
    };
  }

  /** Allocates the next per-organization code: STU-00001. */
  private async nextStudentCode(organizationId: string) {
    const count = await this.prisma.student.count({ where: { organizationId } });
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = `STU${String(count + 1 + attempt).padStart(5, '0')}`;
      const clash = await this.prisma.student.findFirst({ where: { organizationId, studentCode: code } });
      if (!clash) return code;
    }
    throw new BadRequestException({ code: 'CODE_ALLOCATION', message: 'Could not allocate a student code. Enter one manually.' });
  }

  private async assertCodeFree(organizationId: string, studentCode: string) {
    const clash = await this.prisma.student.findFirst({ where: { organizationId, studentCode } });
    if (clash) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: `Student code ${studentCode} is already used.`,
        details: { studentCode: 'That student code is already used.' },
      });
    }
    return studentCode;
  }

  private async assertCourse(organizationId: string, courseId: string) {
    const course = await this.prisma.course.findFirst({ where: { id: courseId, organizationId } });
    if (!course) throw new BadRequestException({ code: 'NOT_FOUND', message: 'That course does not exist.' });
  }

  /**
   * A batch must belong to the same branch as the student, be open, and have a
   * free seat. Capacity is checked here rather than trusted from the UI (spec §41).
   */
  private async loadEnrollableBatch(ctx: TenantContext, batchId: string, branchId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, organizationId: ctx.organizationId },
      include: { _count: { select: { students: { where: { status: 'ENROLLED' } } } } },
    });
    if (!batch) throw new BadRequestException({ code: 'NOT_FOUND', message: 'That batch does not exist.' });
    if (batch.branchId !== branchId) {
      throw new BadRequestException({
        code: 'BATCH_WRONG_BRANCH',
        message: 'That batch belongs to a different branch.',
        details: { batchId: 'Pick a batch from this branch.' },
      });
    }
    if (!['PLANNED', 'ACTIVE'].includes(batch.status)) {
      throw new BadRequestException({ code: 'BATCH_CLOSED', message: 'That batch is no longer taking students.' });
    }
    if (batch._count.students >= batch.capacity) {
      throw new BadRequestException({
        code: 'BATCH_FULL',
        message: `${batch.name} is full (${batch.capacity} seats).`,
        details: { batchId: 'That batch is full.' },
      });
    }
    return batch;
  }

  /** Falls back to the caller's active branch; an org-level user must be explicit. */
  private async resolveBranch(ctx: TenantContext, requested?: string) {
    const branchId = requested ?? ctx.activeBranchId;
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
      throw new BadRequestException({ code: 'ARCHIVED', message: 'You cannot admit students into an archived branch.' });
    }
    return branch.id;
  }
}
