import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type AttendanceStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../platform/audit/audit.service';
import { assertBranchAccess, branchScope, type TenantContext } from '../scope/tenant-context';
import { ATTENDANCE_WEIGHT } from '@acadia/types';

/**
 * Spec §47.
 *
 * Every read goes through `branchScope()`, so a Branch Admin's reports are
 * filtered in the query rather than after it — cross-branch attendance is
 * unreachable, not merely hidden.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The roll for one class: every enrolled student, plus whatever has already
   * been marked. Returning the full roster (not just marked rows) is what makes
   * the marking screen a single request.
   */
  async roster(ctx: TenantContext, sessionId: string) {
    const session = await this.prisma.classSession.findFirst({
      where: { id: sessionId, organizationId: ctx.organizationId },
      include: {
        batch: { select: { id: true, name: true, code: true } },
        subject: { select: { id: true, name: true, code: true } },
        faculty: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
        room: { select: { id: true, name: true } },
      },
    });
    if (!session) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That class does not exist.' });
    assertBranchAccess(ctx, session.branchId);

    const [enrolments, marked, leave] = await Promise.all([
      this.prisma.batchStudent.findMany({
        where: { batchId: session.batchId, status: 'ENROLLED' },
        include: {
          student: { select: { id: true, studentCode: true, name: true, photoUrl: true, status: true } },
        },
        orderBy: { student: { name: 'asc' } },
      }),
      this.prisma.attendance.findMany({ where: { sessionId } }),
      // Approved leave covering this date pre-fills as EXCUSED, so an authorised
      // absence is never mis-marked by a teacher working through the roll quickly.
      this.prisma.leaveRequest.findMany({
        where: {
          organizationId: ctx.organizationId,
          subjectType: 'STUDENT',
          status: 'APPROVED',
          fromDate: { lte: session.date },
          toDate: { gte: session.date },
        },
        select: { studentId: true },
      }),
    ]);

    const byStudent = new Map(marked.map((m) => [m.studentId, m]));
    const onLeave = new Set(leave.map((l) => l.studentId));

    const students = enrolments
      .filter((e) => e.student.status === 'ACTIVE')
      .map((e) => {
        const record = byStudent.get(e.student.id);
        return {
          ...e.student,
          attendanceId: record?.id ?? null,
          status: record?.status ?? (onLeave.has(e.student.id) ? 'EXCUSED' : null),
          minutesLate: record?.minutesLate ?? null,
          note: record?.note ?? null,
          onApprovedLeave: onLeave.has(e.student.id),
          marked: Boolean(record),
        };
      });

    return {
      session: {
        id: session.id,
        date: session.date.toISOString().slice(0, 10),
        startMinute: session.startMinute,
        endMinute: session.endMinute,
        status: session.status,
        batch: session.batch,
        subject: session.subject,
        faculty: session.faculty,
        branch: session.branch,
        room: session.room,
      },
      students,
      markedCount: students.filter((s) => s.marked).length,
      total: students.length,
    };
  }

  /**
   * Marks the whole roll in one transaction. Re-marking updates in place — the
   * `(sessionId, studentId)` unique index means a correction never appends a
   * second, contradictory record.
   */
  async mark(
    ctx: TenantContext,
    sessionId: string,
    entries: { studentId: string; status: AttendanceStatus; minutesLate?: number | null; note?: string }[],
  ) {
    const session = await this.prisma.classSession.findFirst({
      where: { id: sessionId, organizationId: ctx.organizationId },
      select: { id: true, branchId: true, batchId: true, date: true, status: true },
    });
    if (!session) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That class does not exist.' });
    assertBranchAccess(ctx, session.branchId);

    if (session.status === 'CANCELLED') {
      throw new BadRequestException({
        code: 'SESSION_CANCELLED',
        message: 'This class was cancelled — there is no attendance to record.',
      });
    }
    // Marking a class that has not happened yet is almost always a mistake.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (session.date > today) {
      throw new BadRequestException({
        code: 'SESSION_IN_FUTURE',
        message: 'You cannot mark attendance for a class that has not happened yet.',
      });
    }

    // Every student must actually be enrolled in this batch.
    const enrolled = await this.prisma.batchStudent.findMany({
      where: { batchId: session.batchId, status: 'ENROLLED', studentId: { in: entries.map((e) => e.studentId) } },
      select: { studentId: true },
    });
    const enrolledIds = new Set(enrolled.map((e) => e.studentId));
    const strays = entries.filter((e) => !enrolledIds.has(e.studentId));
    if (strays.length) {
      throw new BadRequestException({
        code: 'STUDENT_NOT_ENROLLED',
        message: `${strays.length} of the students are not enrolled in this batch.`,
        details: { studentIds: strays.map((s) => s.studentId) },
      });
    }

    await this.prisma.$transaction(
      entries.map((e) =>
        this.prisma.attendance.upsert({
          where: { sessionId_studentId: { sessionId, studentId: e.studentId } },
          create: {
            organizationId: ctx.organizationId,
            branchId: session.branchId,
            batchId: session.batchId,
            sessionId,
            studentId: e.studentId,
            date: session.date,
            status: e.status,
            minutesLate: e.status === 'LATE' ? e.minutesLate ?? null : null,
            note: e.note || null,
            markedById: ctx.userId,
          },
          update: {
            status: e.status,
            minutesLate: e.status === 'LATE' ? e.minutesLate ?? null : null,
            note: e.note || null,
            markedById: ctx.userId,
          },
        }),
      ),
    );

    // A marked class is a class that took place.
    if (session.status === 'SCHEDULED') {
      await this.prisma.classSession.update({ where: { id: sessionId }, data: { status: 'COMPLETED' } });
    }

    await this.audit.record({
      actorType: 'ORG', actorId: ctx.userId, actorEmail: ctx.email,
      organizationId: ctx.organizationId,
      action: 'attendance.mark', entityType: 'ClassSession', entityId: sessionId,
      after: { marked: entries.length, date: session.date.toISOString().slice(0, 10) },
    });

    return this.roster(ctx, sessionId);
  }

  /** Classes needing a roll — the teacher's and admin's daily worklist. */
  async pending(ctx: TenantContext, from: string, to: string) {
    const sessions = await this.prisma.classSession.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...branchScope(ctx),
        status: { not: 'CANCELLED' },
        date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
      },
      orderBy: [{ date: 'desc' }, { startMinute: 'asc' }],
      include: {
        batch: { select: { id: true, name: true, code: true } },
        subject: { select: { id: true, name: true, code: true } },
        faculty: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
        _count: { select: { attendance: true } },
      },
    });

    return sessions.map(({ _count, ...s }) => ({
      ...s,
      date: s.date.toISOString().slice(0, 10),
      markedCount: _count.attendance,
      marked: _count.attendance > 0,
    }));
  }

  /**
   * Spec §47 reports at student / batch / branch / organization level.
   *
   * All four are the same aggregation over a different grouping, so they share one
   * query path — which also means they can never disagree with each other.
   */
  async report(
    ctx: TenantContext,
    input: { from: string; to: string; batchId?: string; studentId?: string },
  ) {
    if (input.batchId) {
      const batch = await this.prisma.batch.findFirst({
        where: { id: input.batchId, organizationId: ctx.organizationId },
        select: { branchId: true },
      });
      if (!batch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That batch does not exist.' });
      assertBranchAccess(ctx, batch.branchId);
    }

    const where: Prisma.AttendanceWhereInput = {
      organizationId: ctx.organizationId,
      ...branchScope(ctx),
      date: { gte: new Date(`${input.from}T00:00:00.000Z`), lte: new Date(`${input.to}T00:00:00.000Z`) },
      ...(input.batchId ? { batchId: input.batchId } : {}),
      ...(input.studentId ? { studentId: input.studentId } : {}),
    };

    const rows = await this.prisma.attendance.findMany({
      where,
      select: {
        status: true,
        date: true,
        branchId: true,
        batchId: true,
        studentId: true,
        student: { select: { id: true, studentCode: true, name: true } },
        batch: { select: { id: true, name: true, code: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    const byStudent = new Map<string, { label: string; code: string; rows: typeof rows }>();
    const byBatch = new Map<string, { label: string; code: string; rows: typeof rows }>();
    const byBranch = new Map<string, { label: string; code: string; rows: typeof rows }>();
    const byDate = new Map<string, typeof rows>();

    for (const r of rows) {
      push(byStudent, r.studentId, r.student.name, r.student.studentCode, r);
      push(byBatch, r.batchId, r.batch.name, r.batch.code, r);
      push(byBranch, r.branchId, r.branch.name, r.branch.code, r);
      const day = r.date.toISOString().slice(0, 10);
      byDate.set(day, [...(byDate.get(day) ?? []), r]);
    }

    return {
      range: { from: input.from, to: input.to },
      overall: rate(rows),
      // Rows with no countable records sort last in either direction — "no data"
      // is not the worst attendance, and must not head a needs-attention list.
      byStudent: [...byStudent.entries()]
        .map(([id, v]) => ({ id, name: v.label, code: v.code, ...rate(v.rows) }))
        .sort(byPercent('asc')),
      byBatch: [...byBatch.entries()]
        .map(([id, v]) => ({ id, name: v.label, code: v.code, ...rate(v.rows) }))
        .sort(byPercent('asc')),
      byBranch: [...byBranch.entries()]
        .map(([id, v]) => ({ id, name: v.label, code: v.code, ...rate(v.rows) }))
        .sort(byPercent('desc')),
      trend: [...byDate.entries()]
        .map(([date, r]) => ({ date, ...rate(r) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /** One student's record, for the student detail page. */
  async forStudent(ctx: TenantContext, studentId: string, from: string, to: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true, studentCode: true, branchId: true },
    });
    if (!student) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That student does not exist.' });
    assertBranchAccess(ctx, student.branchId);

    const rows = await this.prisma.attendance.findMany({
      where: {
        studentId,
        organizationId: ctx.organizationId,
        date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
      },
      orderBy: [{ date: 'desc' }],
      include: {
        session: { select: { id: true, startMinute: true, subject: { select: { name: true, code: true } } } },
        batch: { select: { id: true, name: true, code: true } },
      },
    });

    return {
      student,
      summary: rate(rows),
      records: rows.map((r) => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        status: r.status,
        minutesLate: r.minutesLate,
        note: r.note,
        subject: r.session.subject,
        batch: r.batch,
        startMinute: r.session.startMinute,
      })),
    };
  }
}

/** Sorts by attendance, always pushing "no countable data" to the end. */
function byPercent(direction: 'asc' | 'desc') {
  return (a: { percent: number | null }, b: { percent: number | null }) => {
    if (a.percent === null && b.percent === null) return 0;
    if (a.percent === null) return 1;
    if (b.percent === null) return -1;
    return direction === 'asc' ? a.percent - b.percent : b.percent - a.percent;
  };
}

function push<T>(
  map: Map<string, { label: string; code: string; rows: T[] }>,
  key: string,
  label: string,
  code: string,
  row: T,
) {
  const entry = map.get(key) ?? { label, code, rows: [] };
  entry.rows.push(row);
  map.set(key, entry);
}

/**
 * Attendance percentage. EXCUSED rows are dropped from both numerator and
 * denominator — authorised absence should neither reward nor penalise.
 *
 * `percent` is **null** when nothing countable remains, which is different from
 * zero: a student on approved leave for the whole period has no attendance record
 * to score, and reporting them at 0% would say the opposite of what excluding
 * EXCUSED is for. Callers render null as "—", never as a number.
 */
function rate(rows: { status: string }[]) {
  const counts = {
    PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0, EXCUSED: 0,
  } as Record<string, number>;
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;

  let earned = 0;
  let possible = 0;
  for (const r of rows) {
    const weight = ATTENDANCE_WEIGHT[r.status as keyof typeof ATTENDANCE_WEIGHT];
    if (weight === null) continue;
    earned += weight;
    possible += 1;
  }

  return {
    counts,
    records: rows.length,
    countable: possible,
    percent: possible === 0 ? null : (earned / possible) * 100,
  };
}
