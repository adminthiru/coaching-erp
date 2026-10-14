import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type BatchStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, branchScope, type TenantContext } from '../scope/tenant-context';
import { orderBy, paginate, skipTake } from '../../common/dto/pagination';
import type { PaginationQuery } from '@acadia/validation';

const ALLOWED: Record<BatchStatus, BatchStatus[]> = {
  PLANNED: ['ACTIVE', 'CANCELLED', 'ARCHIVED'],
  ACTIVE: ['COMPLETED', 'CANCELLED', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};

const LIST_SORTS = ['name', 'code', 'status', 'startDate', 'createdAt'] as const;

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, query: PaginationQuery & { status?: BatchStatus; courseId?: string }) {
    const where: Prisma.BatchWhereInput = {
      organizationId: ctx.organizationId,
      ...branchScope(ctx),
      ...(query.status ? { status: query.status } : { status: { not: 'ARCHIVED' } }),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search.toUpperCase() } },
              { room: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.batch.findMany({
        where,
        ...skipTake(query),
        orderBy: orderBy(LIST_SORTS, query.sortBy, query.sortDir, 'name'),
        include: {
          branch: { select: { id: true, name: true, code: true } },
          course: { select: { id: true, name: true, targetExam: true } },
          academicYear: { select: { id: true, name: true } },
          _count: {
            select: {
              students: { where: { status: 'ENROLLED' } },
              faculty: { where: { endedAt: null } },
            },
          },
        },
      }),
      this.prisma.batch.count({ where }),
    ]);

    return paginate(rows.map(shape), total, query);
  }

  async get(ctx: TenantContext, id: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        branch: { select: { id: true, name: true, code: true, city: true } },
        course: { select: { id: true, name: true, targetExam: true } },
        academicYear: { select: { id: true, name: true } },
        faculty: {
          where: { endedAt: null },
          include: {
            faculty: { select: { id: true, name: true, email: true } },
            subject: { select: { id: true, name: true, code: true } },
          },
        },
        _count: {
          select: {
            students: { where: { status: 'ENROLLED' } },
            faculty: { where: { endedAt: null } },
          },
        },
      },
    });
    if (!batch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That batch does not exist.' });
    assertBranchAccess(ctx, batch.branchId);
    return shape(batch);
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

    const [branch, course, year, clash] = await Promise.all([
      this.prisma.branch.findFirst({ where: { id: branchId, organizationId: ctx.organizationId } }),
      this.prisma.course.findFirst({ where: { id: input.courseId, organizationId: ctx.organizationId } }),
      this.prisma.academicYear.findFirst({ where: { id: input.academicYearId, organizationId: ctx.organizationId } }),
      this.prisma.batch.findFirst({ where: { organizationId: ctx.organizationId, code: input.code } }),
    ]);

    if (!branch) throw new BadRequestException({ code: 'NOT_FOUND', message: 'That branch does not exist.' });
    if (branch.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'ARCHIVED', message: 'You cannot create a batch in an archived branch.' });
    }
    if (!course) throw new BadRequestException({ code: 'NOT_FOUND', message: 'That course does not exist.', details: { courseId: 'Pick a course.' } });
    if (!year) throw new BadRequestException({ code: 'NOT_FOUND', message: 'That academic year does not exist.', details: { academicYearId: 'Pick an academic year.' } });
    if (clash) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: `Batch code ${input.code} is already used in this organization.`,
        details: { code: 'That batch code is already used.' },
      });
    }

    const batch = await this.prisma.batch.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        courseId: input.courseId,
        academicYearId: input.academicYearId,
        name: input.name,
        code: input.code,
        capacity: input.capacity,
        room: input.room || null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
      },
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'batch.create', entityType: 'Batch', entityId: batch.id,
      after: { name: batch.name, code: batch.code, branchId, capacity: batch.capacity },
    });

    return this.get(ctx, batch.id);
  }

  async update(ctx: TenantContext, id: string, input: any) {
    const before = await this.get(ctx, id);
    if (before.status === 'ARCHIVED') {
      throw new BadRequestException({ code: 'ARCHIVED', message: 'Archived batches are read-only.' });
    }

    // Capacity may not drop below the number already enrolled.
    if (input.capacity !== undefined && input.capacity < before.enrolled) {
      throw new BadRequestException({
        code: 'CAPACITY_TOO_LOW',
        message: `${before.enrolled} students are already enrolled.`,
        details: { capacity: `Must be at least ${before.enrolled}.` },
      });
    }
    if (input.code && input.code !== before.code) {
      const clash = await this.prisma.batch.findFirst({
        where: { organizationId: ctx.organizationId, code: input.code, id: { not: id } },
      });
      if (clash) {
        throw new BadRequestException({
          code: 'DUPLICATE',
          message: `Batch code ${input.code} is already used.`,
          details: { code: 'That batch code is already used.' },
        });
      }
    }

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined) continue;
      if (k === 'startDate' || k === 'endDate') data[k] = v ? new Date(v as string) : null;
      else data[k] = v === '' ? null : v;
    }

    await this.prisma.batch.update({ where: { id }, data });
    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'batch.update', entityType: 'Batch', entityId: id, after: data,
    });

    return this.get(ctx, id);
  }

  async changeStatus(ctx: TenantContext, id: string, status: BatchStatus, reason?: string) {
    const batch = await this.get(ctx, id);
    if (batch.status === status) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: `This batch is already ${status.toLowerCase()}.` });
    }
    if (!ALLOWED[batch.status].includes(status)) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `A batch cannot move from ${batch.status} to ${status}.`,
        details: { from: batch.status, to: status, allowed: ALLOWED[batch.status] },
      });
    }
    if (status === 'ARCHIVED' && batch.enrolled > 0) {
      throw new BadRequestException({
        code: 'BATCH_NOT_EMPTY',
        message: `${batch.enrolled} students are still enrolled. Move or release them first.`,
        details: { enrolled: batch.enrolled },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.batch.update({ where: { id }, data: { status } });
      // Completing a batch completes its enrolments rather than leaving them open.
      if (status === 'COMPLETED') {
        await tx.batchStudent.updateMany({
          where: { batchId: id, status: 'ENROLLED' },
          data: { status: 'COMPLETED', leftAt: new Date() },
        });
      }
      if (status === 'CANCELLED') {
        await tx.batchStudent.updateMany({
          where: { batchId: id, status: 'ENROLLED' },
          data: { status: 'LEFT', leftAt: new Date() },
        });
      }
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: `batch.${status.toLowerCase()}`, entityType: 'Batch', entityId: id,
      before: { status: batch.status }, after: { status }, reason,
    });

    return this.get(ctx, id);
  }

  listStudents(ctx: TenantContext, id: string, query: PaginationQuery) {
    return this.get(ctx, id).then(async () => {
      const where: Prisma.BatchStudentWhereInput = { batchId: id, status: 'ENROLLED' };
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.batchStudent.findMany({
          where,
          ...skipTake(query),
          orderBy: { student: { name: 'asc' } },
          include: {
            student: {
              select: {
                id: true, studentCode: true, name: true, phone: true, status: true,
                photoUrl: true, targetExam: true, parentPhone: true,
              },
            },
          },
        }),
        this.prisma.batchStudent.count({ where }),
      ]);
      return paginate(rows.map((r) => ({ ...r.student, joinedAt: r.joinedAt })), total, query);
    });
  }

  /**
   * Bulk enrolment. Capacity is checked against the whole batch, and students
   * from another branch are rejected — a batch runs at exactly one branch.
   */
  async enrol(ctx: TenantContext, id: string, studentIds: string[]) {
    const batch = await this.get(ctx, id);
    if (!['PLANNED', 'ACTIVE'].includes(batch.status)) {
      throw new BadRequestException({ code: 'BATCH_CLOSED', message: 'That batch is no longer taking students.' });
    }

    const students = await this.prisma.student.findMany({
      where: {
        id: { in: studentIds },
        organizationId: ctx.organizationId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: { id: true, name: true, branchId: true },
    });

    const missing = studentIds.filter((sid) => !students.some((s) => s.id === sid));
    if (missing.length) {
      throw new BadRequestException({
        code: 'NOT_FOUND',
        message: `${missing.length} of the selected students could not be found or are not active.`,
      });
    }

    const wrongBranch = students.filter((s) => s.branchId !== batch.branchId);
    if (wrongBranch.length) {
      throw new BadRequestException({
        code: 'STUDENT_WRONG_BRANCH',
        message: `${wrongBranch.map((s) => s.name).join(', ')} ${wrongBranch.length === 1 ? 'belongs' : 'belong'} to a different branch. Transfer them first.`,
        details: { studentIds: wrongBranch.map((s) => s.id) },
      });
    }

    const already = await this.prisma.batchStudent.findMany({
      where: { batchId: id, studentId: { in: studentIds }, status: 'ENROLLED' },
      select: { studentId: true },
    });
    const toEnrol = students.filter((s) => !already.some((a) => a.studentId === s.id));
    if (!toEnrol.length) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: 'Those students are already in this batch.' });
    }

    const seatsLeft = batch.capacity - batch.enrolled;
    if (toEnrol.length > seatsLeft) {
      throw new BadRequestException({
        code: 'BATCH_FULL',
        message: `Only ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left in ${batch.name}, but ${toEnrol.length} ${toEnrol.length === 1 ? 'student was' : 'students were'} selected.`,
        details: { seatsLeft, requested: toEnrol.length },
      });
    }

    await this.prisma.$transaction(
      toEnrol.map((s) =>
        this.prisma.batchStudent.upsert({
          where: { batchId_studentId: { batchId: id, studentId: s.id } },
          create: { batchId: id, studentId: s.id },
          update: { status: 'ENROLLED', leftAt: null, joinedAt: new Date() },
        }),
      ),
    );

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'batch.enrol', entityType: 'Batch', entityId: id,
      after: { enrolled: toEnrol.length, studentIds: toEnrol.map((s) => s.id) },
    });

    return this.get(ctx, id);
  }

  async release(ctx: TenantContext, id: string, studentId: string) {
    await this.get(ctx, id);
    const { count } = await this.prisma.batchStudent.updateMany({
      where: { batchId: id, studentId, status: 'ENROLLED' },
      data: { status: 'LEFT', leftAt: new Date() },
    });
    if (!count) throw new BadRequestException({ code: 'NOT_FOUND', message: 'That student is not in this batch.' });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'batch.release', entityType: 'Batch', entityId: id, after: { studentId },
    });

    return this.get(ctx, id);
  }

  /**
   * Spec §45 — faculty assignment, with a conflict warning. The faculty member
   * must already be assigned to this batch's branch.
   */
  async assignFaculty(ctx: TenantContext, id: string, facultyId: string, subjectId: string, isClassTeacher: boolean) {
    const batch = await this.get(ctx, id);

    const faculty = await this.prisma.orgUser.findFirst({
      where: { id: facultyId, organizationId: ctx.organizationId, deletedAt: null },
      include: { branches: { where: { endedAt: null }, select: { branchId: true } } },
    });
    if (!faculty) throw new BadRequestException({ code: 'NOT_FOUND', message: 'That person does not exist.' });
    if (!faculty.branches.some((b) => b.branchId === batch.branchId)) {
      throw new BadRequestException({
        code: 'FACULTY_WRONG_BRANCH',
        message: `${faculty.name} is not assigned to ${batch.branch.name}. Assign them to that branch first.`,
        details: { facultyId: 'Not assigned to this branch.' },
      });
    }

    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, organizationId: ctx.organizationId },
    });
    if (!subject) throw new BadRequestException({ code: 'NOT_FOUND', message: 'That subject does not exist.' });

    const existing = await this.prisma.batchFaculty.findUnique({
      where: { batchId_facultyId_subjectId: { batchId: id, facultyId, subjectId } },
    });
    if (existing && !existing.endedAt) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: `${faculty.name} already teaches ${subject.name} in this batch.` });
    }

    await this.prisma.$transaction(async (tx) => {
      // Only one class teacher per batch.
      if (isClassTeacher) {
        await tx.batchFaculty.updateMany({ where: { batchId: id, endedAt: null }, data: { isClassTeacher: false } });
      }
      if (existing) {
        await tx.batchFaculty.update({
          where: { id: existing.id },
          data: { endedAt: null, isClassTeacher, assignedAt: new Date() },
        });
      } else {
        await tx.batchFaculty.create({ data: { batchId: id, facultyId, subjectId, isClassTeacher } });
      }
    });

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'batch.assign_faculty', entityType: 'Batch', entityId: id,
      after: { facultyId, subjectId, isClassTeacher },
    });

    return this.get(ctx, id);
  }

  async unassignFaculty(ctx: TenantContext, id: string, assignmentId: string) {
    await this.get(ctx, id);
    const { count } = await this.prisma.batchFaculty.updateMany({
      where: { id: assignmentId, batchId: id, endedAt: null },
      data: { endedAt: new Date(), isClassTeacher: false },
    });
    if (!count) throw new BadRequestException({ code: 'NOT_FOUND', message: 'That assignment does not exist.' });
    return this.get(ctx, id);
  }
}

function shape<
  T extends {
    capacity: number;
    _count: { students: number; faculty: number };
  },
>(batch: T) {
  const { _count, ...rest } = batch;
  const enrolled = _count.students;
  return {
    ...rest,
    enrolled,
    facultyCount: _count.faculty,
    seatsLeft: Math.max(0, batch.capacity - enrolled),
    full: enrolled >= batch.capacity,
    fillRate: batch.capacity === 0 ? 0 : (enrolled / batch.capacity) * 100,
  };
}
