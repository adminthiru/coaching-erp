import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ATTENDANCE_WEIGHT } from '@acadia/types';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';
import { NarrationService } from './narration.service';

const SCORED: ('SUBMITTED' | 'AUTO_SUBMITTED' | 'EVALUATED')[] = ['SUBMITTED', 'AUTO_SUBMITTED', 'EVALUATED'];

/** A finding is a fact plus how much it matters — never a guess. */
interface Finding {
  kind: string;
  severity: 'info' | 'watch' | 'concern';
  detail: string;
}

const average = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const pct = (n: number) => `${n.toFixed(1)}%`;

/** EXCUSED weighs null — dropped from both sides, so a percentage can be undefined. */
function attendanceRate(rows: { status: string }[]) {
  let earned = 0;
  let possible = 0;
  for (const r of rows) {
    const w = ATTENDANCE_WEIGHT[r.status as keyof typeof ATTENDANCE_WEIGHT];
    if (w === null || w === undefined) continue;
    earned += w;
    possible += 1;
  }
  return possible === 0 ? null : (earned / possible) * 100;
}

/**
 * Spec §§69–71 — AI insights.
 *
 * Every finding below is arithmetic over real rows. The model is handed those
 * findings and asked only to write about them (`NarrationService`), so a
 * narration outage costs the prose and nothing else.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly narration: NarrationService,
  ) {}

  /** Spec §69 — attendance, tests, performance, rank, subject weakness. */
  async student(ctx: TenantContext, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true, branchId: true },
    });
    if (!student) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That student does not exist.' });
    assertBranchAccess(ctx, student.branchId);

    const since = new Date(Date.now() - 90 * 864e5);
    const [attendance, attempts] = await Promise.all([
      this.prisma.attendance.findMany({ where: { studentId, date: { gte: since } }, select: { status: true } }),
      this.prisma.testAttempt.findMany({
        where: { studentId, status: { in: SCORED } },
        orderBy: { submittedAt: 'asc' },
        select: {
          id: true, percentage: true, percentile: true, submittedAt: true,
          test: { select: { title: true, status: true } },
        },
      }),
    ]);

    const answers = attempts.length
      ? await this.prisma.testAnswer.findMany({
          where: { attemptId: { in: attempts.map((a) => a.id) }, isCorrect: { not: null } },
          select: { isCorrect: true, question: { select: { subject: { select: { id: true, name: true } } } } },
        })
      : [];

    const findings: Finding[] = [];

    const rate = attendanceRate(attendance);
    if (rate !== null) {
      findings.push({
        kind: 'attendance',
        severity: rate < 60 ? 'concern' : rate < 75 ? 'watch' : 'info',
        detail: `Attendance over the last 90 days is ${pct(rate)} across ${attendance.length} records.`,
      });
    }

    // Subject accuracy, weakest first. Below 15 answered questions the figure
    // is too thin to act on, so it is reported as context rather than concern.
    const bySubject = new Map<string, { name: string; correct: number; wrong: number }>();
    for (const a of answers) {
      const s = a.question.subject;
      const e = bySubject.get(s.id) ?? { name: s.name, correct: 0, wrong: 0 };
      a.isCorrect ? (e.correct += 1) : (e.wrong += 1);
      bySubject.set(s.id, e);
    }
    const subjects = [...bySubject.values()]
      .map((s) => ({ ...s, total: s.correct + s.wrong, accuracy: (s.correct / (s.correct + s.wrong)) * 100 }))
      .sort((a, b) => a.accuracy - b.accuracy);

    for (const s of subjects.slice(0, 2)) {
      if (s.accuracy >= 70) continue;
      findings.push({
        kind: 'subject_weakness',
        severity: s.total < 15 ? 'info' : s.accuracy < 45 ? 'concern' : 'watch',
        detail: `${s.name} accuracy is ${pct(s.accuracy)} over ${s.total} answered questions${s.total < 15 ? ' — too few to be conclusive' : ''}.`,
      });
    }

    // A trend needs something to compare against.
    const scores = attempts.map((a) => a.percentage);
    if (scores.length >= 4) {
      const recent = scores.slice(-3);
      const earlier = scores.slice(0, -3);
      const delta = average(recent) - average(earlier);
      if (Math.abs(delta) >= 5) {
        findings.push({
          kind: 'trend',
          severity: delta < 0 ? 'watch' : 'info',
          detail: `Average score has ${delta > 0 ? 'risen' : 'fallen'} ${Math.abs(delta).toFixed(1)} points over the last three tests (${pct(average(earlier))} → ${pct(average(recent))}).`,
        });
      }
    }

    const ranked = attempts.filter((a) => a.percentile !== null);
    if (ranked.length) {
      const latest = ranked[ranked.length - 1];
      findings.push({
        kind: 'rank',
        severity: 'info',
        detail: `Latest published percentile is ${latest.percentile!.toFixed(1)} on ${latest.test.title}.`,
      });
    }

    if (!attempts.length) {
      findings.push({ kind: 'coverage', severity: 'info', detail: 'No scored tests yet, so performance cannot be assessed.' });
    }

    return this.withNarrative(`the student ${student.name}`, 'student', {
      student: { id: student.id, name: student.name },
      findings,
      summary: {
        attendancePercent: rate,
        testsScored: attempts.length,
        averagePercentage: scores.length ? average(scores) : null,
        weakestSubject: subjects[0]?.name ?? null,
      },
    });
  }

  /** Spec §70 — weak batches, weak subjects, attendance risk. */
  async batch(ctx: TenantContext, batchId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, organizationId: ctx.organizationId },
      select: { id: true, name: true, branchId: true },
    });
    if (!batch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That batch does not exist.' });
    assertBranchAccess(ctx, batch.branchId);

    const enrolled = await this.prisma.batchStudent.findMany({
      where: { batchId, status: 'ENROLLED' },
      select: { studentId: true, student: { select: { id: true, name: true } } },
    });
    const ids = enrolled.map((e) => e.studentId);
    const since = new Date(Date.now() - 90 * 864e5);

    const [attendance, attempts] = await Promise.all([
      ids.length
        ? this.prisma.attendance.findMany({
            where: { studentId: { in: ids }, date: { gte: since } },
            select: { status: true, studentId: true },
          })
        : [],
      ids.length
        ? this.prisma.testAttempt.findMany({
            where: { studentId: { in: ids }, status: { in: SCORED }, test: { batches: { some: { batchId } } } },
            select: { studentId: true, percentage: true },
          })
        : [],
    ]);

    const findings: Finding[] = [];

    const rate = attendanceRate(attendance);
    if (rate !== null) {
      findings.push({
        kind: 'attendance',
        severity: rate < 70 ? 'concern' : rate < 80 ? 'watch' : 'info',
        detail: `Batch attendance over 90 days is ${pct(rate)}.`,
      });
    }

    // Individual attendance risk — the batch average can hide a few students
    // who have effectively stopped coming.
    const perStudent = new Map<string, { status: string }[]>();
    for (const a of attendance) perStudent.set(a.studentId, [...(perStudent.get(a.studentId) ?? []), a]);
    const atRisk = [...perStudent.entries()]
      .map(([sid, rows]) => ({ sid, rate: attendanceRate(rows) }))
      .filter((s) => s.rate !== null && s.rate < 60);
    if (atRisk.length) {
      const names = atRisk
        .map((s) => enrolled.find((e) => e.studentId === s.sid)?.student.name)
        .filter(Boolean)
        .slice(0, 5);
      findings.push({
        kind: 'attendance_risk',
        severity: 'concern',
        detail: `${atRisk.length} student${atRisk.length === 1 ? ' is' : 's are'} below 60% attendance: ${names.join(', ')}${atRisk.length > names.length ? ' and others' : ''}.`,
      });
    }

    const scores = attempts.map((a) => a.percentage);
    if (scores.length) {
      const avg = average(scores);
      findings.push({
        kind: 'performance',
        severity: avg < 40 ? 'concern' : avg < 55 ? 'watch' : 'info',
        detail: `Average test score across ${scores.length} attempts is ${pct(avg)}.`,
      });

      // Spread matters as much as the mean: a wide gap means one class is
      // serving two very different groups.
      const sorted = [...scores].sort((a, b) => a - b);
      const spread = sorted[sorted.length - 1] - sorted[0];
      if (spread >= 40 && scores.length >= 5) {
        findings.push({
          kind: 'spread',
          severity: 'watch',
          detail: `Scores range from ${pct(sorted[0])} to ${pct(sorted[sorted.length - 1])} — a ${spread.toFixed(0)} point spread within one batch.`,
        });
      }
    } else {
      findings.push({ kind: 'coverage', severity: 'info', detail: 'No scored tests for this batch yet.' });
    }

    const silent = ids.length - new Set(attempts.map((a) => a.studentId)).size;
    if (silent > 0 && attempts.length) {
      findings.push({
        kind: 'coverage',
        severity: silent > ids.length / 2 ? 'watch' : 'info',
        detail: `${silent} of ${ids.length} enrolled students have not sat a scored test.`,
      });
    }

    return this.withNarrative(`the batch ${batch.name}`, 'batch', {
      batch: { id: batch.id, name: batch.name },
      findings,
      summary: {
        studentsEnrolled: ids.length,
        attendancePercent: rate,
        averagePercentage: scores.length ? average(scores) : null,
        studentsAtAttendanceRisk: atRisk.length,
      },
    });
  }

  /**
   * Spec §71 — branch comparison. Organization-level only: a branch admin
   * comparing themselves against branches they cannot otherwise see is exactly
   * the scope escape §56 forbids.
   */
  async organization(ctx: TenantContext) {
    const branches = await this.prisma.branch.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { not: 'ARCHIVED' },
        ...(ctx.accessibleBranchIds ? { id: { in: ctx.accessibleBranchIds } } : {}),
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
    const branchIds = branches.map((b) => b.id);
    const since = new Date(Date.now() - 90 * 864e5);

    const [attendance, attempts, students] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { organizationId: ctx.organizationId, branchId: { in: branchIds }, date: { gte: since } },
        select: { status: true, branchId: true },
      }),
      this.prisma.testAttempt.findMany({
        where: { organizationId: ctx.organizationId, branchId: { in: branchIds }, status: { in: SCORED } },
        select: { branchId: true, percentage: true },
      }),
      this.prisma.student.groupBy({
        by: ['branchId'],
        where: { organizationId: ctx.organizationId, branchId: { in: branchIds }, status: 'ACTIVE' },
        _count: true,
      }),
    ]);

    const studentCount = new Map(students.map((s) => [s.branchId, s._count]));
    const perBranch = branches.map((b) => ({
      branch: b,
      activeStudents: studentCount.get(b.id) ?? 0,
      attendancePercent: attendanceRate(attendance.filter((a) => a.branchId === b.id)),
      averagePercentage: (() => {
        const s = attempts.filter((a) => a.branchId === b.id).map((a) => a.percentage);
        return s.length ? average(s) : null;
      })(),
    }));

    const findings: Finding[] = [];

    // A comparison needs at least two things to compare.
    const scored = perBranch.filter((b) => b.averagePercentage !== null);
    if (scored.length >= 2) {
      const best = scored.reduce((a, b) => (b.averagePercentage! > a.averagePercentage! ? b : a));
      const worst = scored.reduce((a, b) => (b.averagePercentage! < a.averagePercentage! ? b : a));
      const gap = best.averagePercentage! - worst.averagePercentage!;
      findings.push({
        kind: 'performance_gap',
        severity: gap >= 15 ? 'watch' : 'info',
        detail: `${best.branch.name} averages ${pct(best.averagePercentage!)} against ${worst.branch.name} at ${pct(worst.averagePercentage!)} — a ${gap.toFixed(1)} point gap.`,
      });
    }

    const withAttendance = perBranch.filter((b) => b.attendancePercent !== null);
    if (withAttendance.length >= 2) {
      const worst = withAttendance.reduce((a, b) => (b.attendancePercent! < a.attendancePercent! ? b : a));
      findings.push({
        kind: 'attendance',
        severity: worst.attendancePercent! < 70 ? 'concern' : 'info',
        detail: `Lowest branch attendance is ${worst.branch.name} at ${pct(worst.attendancePercent!)}.`,
      });
    }

    if (findings.length === 0) {
      findings.push({
        kind: 'coverage',
        severity: 'info',
        detail: 'Not enough recorded activity across branches to compare them yet.',
      });
    }

    return this.withNarrative('this organization’s branches', 'organization', { branches: perBranch, findings });
  }

  /** Attaches prose when narration is configured, and says so plainly when it is not. */
  private async withNarrative<T extends { findings: Finding[] }>(
    subject: string,
    audience: 'student' | 'batch' | 'organization',
    payload: T,
  ) {
    const narrated = await this.narration.narrate({ subject, audience, findings: payload.findings });
    return {
      ...payload,
      narrative: narrated?.text ?? null,
      narrativeModel: narrated?.model ?? null,
      // The UI needs to distinguish "nothing to say" from "not configured".
      narrationAvailable: this.narration.enabled,
      generatedAt: new Date().toISOString(),
    };
  }
}
