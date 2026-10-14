import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ATTENDANCE_WEIGHT } from '@acadia/types';
import { assertPortalStudent, portalStudentScope, type TenantContext } from '../scope/tenant-context';

const SCORED: ('SUBMITTED' | 'AUTO_SUBMITTED' | 'EVALUATED')[] = ['SUBMITTED', 'AUTO_SUBMITTED', 'EVALUATED'];

/**
 * Spec §65 — the parent and student portal.
 *
 * Every query here filters on the caller's own students, never on branch. A
 * parent's branch scope necessarily includes their child's branch, so reusing a
 * staff service would hand them every student at that branch; these queries are
 * deliberately separate for exactly that reason.
 */
@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Spec §65's child switcher. Siblings may sit at different branches. */
  async children(ctx: TenantContext) {
    const ids = portalStudentScope(ctx);
    const students = await this.prisma.student.findMany({
      where: { id: { in: ids }, deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, studentCode: true, photoUrl: true, status: true, targetExam: true,
        branch: { select: { id: true, name: true, code: true, city: true } },
        course: { select: { id: true, name: true } },
        batches: {
          where: { status: 'ENROLLED' },
          select: { batch: { select: { id: true, name: true, code: true } } },
          take: 1,
        },
      },
    });

    return students.map(({ batches, ...s }) => ({ ...s, currentBatch: batches[0]?.batch ?? null }));
  }

  /** One child's summary — the portal home for whoever is selected. */
  async overview(ctx: TenantContext, studentId: string) {
    assertPortalStudent(ctx, studentId);

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: {
        id: true, name: true, studentCode: true, photoUrl: true, status: true, targetExam: true,
        branch: { select: { id: true, name: true, code: true, city: true } },
        course: { select: { id: true, name: true } },
      },
    });
    if (!student) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That student does not exist.' });

    const since = new Date(Date.now() - 30 * 864e5);

    const [attendance, attempts, fees, homework] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { studentId, date: { gte: since } },
        select: { status: true },
      }),
      this.prisma.testAttempt.findMany({
        where: { studentId, status: { in: SCORED }, test: { status: 'RESULTS_PUBLISHED' } },
        select: { percentage: true },
      }),
      this.prisma.studentFee.findMany({
        where: { studentId, status: { in: ['PENDING', 'PARTIALLY_PAID'] } },
        select: { netMinor: true, paidMinor: true },
      }),
      this.prisma.homeworkSubmission.count({
        where: { studentId, status: 'PENDING', homework: { status: 'PUBLISHED', dueAt: { gte: new Date() } } },
      }),
    ]);

    return {
      student,
      attendance: rate(attendance),
      tests: {
        published: attempts.length,
        averagePercentage: attempts.length
          ? attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length
          : null,
      },
      fees: { outstandingMinor: fees.reduce((s, f) => s + (f.netMinor - f.paidMinor), 0) },
      homework: { dueSoon: homework },
    };
  }

  async attendance(ctx: TenantContext, studentId: string, from: string, to: string) {
    assertPortalStudent(ctx, studentId);

    const rows = await this.prisma.attendance.findMany({
      where: {
        studentId,
        date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
      },
      orderBy: { date: 'desc' },
      select: {
        id: true, status: true, date: true,
        session: { select: { id: true, subject: { select: { name: true, code: true } } } },
      },
    });

    return { range: { from, to }, overall: rate(rows), records: rows };
  }

  /**
   * Only published results. An unpublished paper is not a parent's to see —
   * the same gate the staff result sheet applies (spec §54).
   */
  async results(ctx: TenantContext, studentId: string) {
    assertPortalStudent(ctx, studentId);

    const attempts = await this.prisma.testAttempt.findMany({
      where: { studentId, status: { in: SCORED }, test: { status: 'RESULTS_PUBLISHED' } },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true, score: true, maxScore: true, percentage: true, submittedAt: true,
        correctCount: true, wrongCount: true, unattemptedCount: true,
        batchRank: true, branchRank: true, organizationRank: true, percentile: true,
        test: { select: { id: true, title: true, code: true, totalMarks: true } },
      },
    });

    return attempts;
  }

  /** Spec §65 — fees are exactly the kind of thing a parent is meant to see. */
  async fees(ctx: TenantContext, studentId: string) {
    assertPortalStudent(ctx, studentId);

    const fees = await this.prisma.studentFee.findMany({
      where: { studentId },
      orderBy: { assignedAt: 'desc' },
      select: {
        id: true, status: true, currency: true,
        grossMinor: true, discountMinor: true, netMinor: true, paidMinor: true,
        assignedAt: true,
        feeStructure: { select: { id: true, name: true } },
        installments: { orderBy: { sequence: 'asc' } },
        payments: {
          orderBy: { paidAt: 'desc' },
          select: { id: true, receiptNumber: true, amountMinor: true, refundedMinor: true, method: true, paidAt: true },
        },
      },
    });

    return fees.map((f) => ({ ...f, outstandingMinor: f.netMinor - f.paidMinor }));
  }

  /** Homework this student was actually set, with how it was marked. */
  async homework(ctx: TenantContext, studentId: string) {
    assertPortalStudent(ctx, studentId);

    const rows = await this.prisma.homeworkSubmission.findMany({
      where: { studentId, homework: { status: { in: ['PUBLISHED', 'CLOSED'] } } },
      orderBy: { homework: { dueAt: 'desc' } },
      select: {
        id: true, status: true, submittedAt: true, marksAwarded: true, feedback: true,
        homework: {
          select: {
            id: true, title: true, instructions: true, dueAt: true, maxMarks: true, attachmentUrl: true,
            subject: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    return rows;
  }

  /**
   * Materials this student can reach: organization-wide, their branch's, their
   * batch's, or named to them. The same four tiers the staff side writes
   * (spec §60), read back from the student's side.
   */
  async materials(ctx: TenantContext, studentId: string) {
    assertPortalStudent(ctx, studentId);

    const student = await this.prisma.student.findFirstOrThrow({
      where: { id: studentId },
      select: {
        branchId: true,
        batches: { where: { status: 'ENROLLED' }, select: { batchId: true } },
      },
    });
    const batchIds = student.batches.map((b) => b.batchId);

    return this.prisma.studyMaterial.findMany({
      where: {
        isArchived: false,
        OR: [
          { audience: 'ORGANIZATION' },
          { targets: { some: { branchId: student.branchId } } },
          ...(batchIds.length ? [{ batchId: { in: batchIds } }] : []),
          { students: { some: { studentId } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, description: true, fileUrl: true, createdAt: true,
        subject: { select: { id: true, name: true, code: true } },
      },
    });
  }

  /** Announcements aimed at this student's branch, batch, or everyone. */
  async announcements(ctx: TenantContext, studentId: string) {
    assertPortalStudent(ctx, studentId);

    const student = await this.prisma.student.findFirstOrThrow({
      where: { id: studentId },
      select: {
        branchId: true, courseId: true,
        batches: { where: { status: 'ENROLLED' }, select: { batchId: true } },
      },
    });
    const batchIds = student.batches.map((b) => b.batchId);

    return this.prisma.announcement.findMany({
      where: {
        status: 'PUBLISHED',
        // Staff-only audiences are excluded outright, not merely unmatched.
        audience: { notIn: ['FACULTY'] },
        OR: [
          { audience: 'ALL_BRANCHES' },
          { targets: { some: { branchId: student.branchId } } },
          ...(batchIds.length ? [{ batchId: { in: batchIds } }] : []),
          ...(student.courseId ? [{ courseId: student.courseId }] : []),
        ],
      },
      orderBy: [{ pinnedUntil: 'desc' }, { publishedAt: 'desc' }],
      take: 50,
      select: { id: true, title: true, body: true, publishedAt: true, pinnedUntil: true, audience: true },
    });
  }
}

/**
 * Attendance percentage, identical in meaning to the staff report: EXCUSED is
 * dropped from both sides, so `percent` can be null rather than a misleading 0.
 */
function rate(rows: { status: string }[]) {
  let earned = 0;
  let possible = 0;
  const counts: Record<string, number> = {};

  for (const r of rows) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    // EXCUSED weighs `null` — dropped from *both* sides, not scored as a zero,
    // which would penalise exactly the students who requested leave properly.
    const weight = ATTENDANCE_WEIGHT[r.status as keyof typeof ATTENDANCE_WEIGHT];
    if (weight === null || weight === undefined) continue;
    earned += weight;
    possible += 1;
  }

  return { percent: possible === 0 ? null : (earned / possible) * 100, records: rows.length, countable: possible, counts };
}
