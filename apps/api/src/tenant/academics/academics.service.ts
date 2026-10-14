import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import type { TenantContext } from '../scope/tenant-context';

/**
 * Courses, subjects and academic years — spec §42.
 *
 * All three are organization-wide, not branch-scoped: the same course runs at
 * several branches, and it is the *batch* that is branch-specific. That is why
 * nothing here consults `branchScope()`.
 */
@Injectable()
export class AcademicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ── Courses ──────────────────────────────────────────────────────────── */

  listCourses(ctx: TenantContext, includeInactive = false) {
    return this.prisma.course.findMany({
      where: { organizationId: ctx.organizationId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
      include: { _count: { select: { batches: true, students: true, subjects: true } } },
    }).then((rows) =>
      rows.map(({ _count, ...c }) => ({
        ...c,
        batchCount: _count.batches,
        studentCount: _count.students,
        subjectCount: _count.subjects,
      })),
    );
  }

  async createCourse(ctx: TenantContext, input: any) {
    await this.assertCourseCodeFree(ctx.organizationId, input.code);
    const course = await this.prisma.course.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.name,
        code: input.code,
        targetExam: input.targetExam,
        durationMonths: input.durationMonths,
        description: input.description || null,
        isActive: input.isActive,
      },
    });
    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'course.create', entityType: 'Course', entityId: course.id,
      after: { name: course.name, code: course.code },
    });
    return course;
  }

  async updateCourse(ctx: TenantContext, id: string, input: any) {
    const before = await this.prisma.course.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!before) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That course does not exist.' });
    if (input.code && input.code !== before.code) {
      await this.assertCourseCodeFree(ctx.organizationId, input.code);
    }

    const course = await this.prisma.course.update({
      where: { id },
      data: { ...input, description: input.description || null },
    });
    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'course.update', entityType: 'Course', entityId: id, after: input,
    });
    return course;
  }

  /* ── Subjects ─────────────────────────────────────────────────────────── */

  listSubjects(ctx: TenantContext, courseId?: string) {
    return this.prisma.subject.findMany({
      where: {
        organizationId: ctx.organizationId,
        isActive: true,
        // A subject with no course is shared across every course.
        ...(courseId ? { OR: [{ courseId }, { courseId: null }] } : {}),
      },
      orderBy: { name: 'asc' },
      include: { course: { select: { id: true, name: true } } },
    });
  }

  async createSubject(ctx: TenantContext, input: any) {
    const clash = await this.prisma.subject.findFirst({
      where: { organizationId: ctx.organizationId, code: input.code },
    });
    if (clash) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: `Subject code ${input.code} is already used.`,
        details: { code: 'That subject code is already used.' },
      });
    }
    if (input.courseId) await this.assertCourseExists(ctx.organizationId, input.courseId);

    return this.prisma.subject.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.name,
        code: input.code,
        courseId: input.courseId ?? null,
        isActive: input.isActive,
      },
    });
  }

  /* ── Academic years ───────────────────────────────────────────────────── */

  listAcademicYears(ctx: TenantContext) {
    return this.prisma.academicYear.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { startDate: 'desc' },
    });
  }

  async createAcademicYear(ctx: TenantContext, input: any) {
    const clash = await this.prisma.academicYear.findFirst({
      where: { organizationId: ctx.organizationId, name: input.name },
    });
    if (clash) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: `${input.name} already exists.`,
        details: { name: 'That academic year already exists.' },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Exactly one year is current at a time.
      if (input.isCurrent) {
        await tx.academicYear.updateMany({
          where: { organizationId: ctx.organizationId },
          data: { isCurrent: false },
        });
      }
      return tx.academicYear.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          isCurrent: input.isCurrent,
        },
      });
    });
  }

  /** The year new batches default to. */
  currentAcademicYear(organizationId: string) {
    return this.prisma.academicYear.findFirst({
      where: { organizationId, isCurrent: true },
      orderBy: { startDate: 'desc' },
    });
  }

  private async assertCourseCodeFree(organizationId: string, code: string) {
    const clash = await this.prisma.course.findFirst({ where: { organizationId, code } });
    if (clash) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: `Course code ${code} is already used.`,
        details: { code: 'That course code is already used.' },
      });
    }
  }

  private async assertCourseExists(organizationId: string, courseId: string) {
    const course = await this.prisma.course.findFirst({ where: { id: courseId, organizationId } });
    if (!course) throw new BadRequestException({ code: 'NOT_FOUND', message: 'That course does not exist.' });
  }
}
