import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertBranchAccess, type TenantContext } from '../scope/tenant-context';

const SCORED: ('SUBMITTED' | 'AUTO_SUBMITTED' | 'EVALUATED')[] = ['SUBMITTED', 'AUTO_SUBMITTED', 'EVALUATED'];

interface SubjectTally { subject: { id: string; name: string; code: string }; correct: number; wrong: number }

/** Groups answered `TestAnswer` rows by subject and turns each into an accuracy figure. */
function subjectAccuracy(
  answers: { isCorrect: boolean | null; question: { subjectId: string; subject: { id: string; name: string; code: string } } }[],
) {
  const bySubject = new Map<string, SubjectTally>();
  for (const a of answers) {
    if (a.isCorrect === null) continue;
    const key = a.question.subjectId;
    const entry = bySubject.get(key) ?? { subject: a.question.subject, correct: 0, wrong: 0 };
    a.isCorrect ? (entry.correct += 1) : (entry.wrong += 1);
    bySubject.set(key, entry);
  }
  return [...bySubject.values()]
    .map((s) => ({
      subject: s.subject,
      correct: s.correct,
      wrong: s.wrong,
      accuracy: s.correct + s.wrong === 0 ? null : (s.correct / (s.correct + s.wrong)) * 100,
    }))
    .sort((a, b) => a.subject.name.localeCompare(b.subject.name));
}

const average = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

/** Spec §55 — performance analytics at student and batch scope. */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async studentPerformance(ctx: TenantContext, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true, branchId: true },
    });
    if (!student) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That student does not exist.' });
    assertBranchAccess(ctx, student.branchId);

    const attempts = await this.prisma.testAttempt.findMany({
      where: { studentId, status: { in: SCORED } },
      orderBy: [{ submittedAt: 'asc' }],
      include: { test: { select: { id: true, title: true, code: true, startAt: true } } },
    });

    const answers = attempts.length
      ? await this.prisma.testAnswer.findMany({
          where: { attemptId: { in: attempts.map((a) => a.id) }, isCorrect: { not: null } },
          select: { isCorrect: true, question: { select: { subjectId: true, subject: { select: { id: true, name: true, code: true } } } } },
        })
      : [];

    const percentages = attempts.map((a) => a.percentage);
    // A trend needs something to compare against — the last three attempts
    // against everything before them. Fewer than that and "improving" or
    // "slipping" isn't a claim the data can support yet.
    const recent = percentages.slice(-3);
    const earlier = percentages.slice(0, -3);
    const trend = earlier.length && recent.length ? average(recent) - average(earlier) : null;

    return {
      student: { id: student.id, name: student.name },
      summary: {
        attemptsCount: attempts.length,
        averagePercentage: average(percentages),
        bestPercentage: percentages.length ? Math.max(...percentages) : null,
        latestPercentage: percentages.length ? percentages[percentages.length - 1] : null,
        trend,
      },
      timeline: attempts.map((a) => ({
        testId: a.testId,
        title: a.test.title,
        code: a.test.code,
        date: a.submittedAt ?? a.test.startAt,
        score: a.score,
        maxScore: a.maxScore,
        percentage: a.percentage,
        correctCount: a.correctCount,
        wrongCount: a.wrongCount,
        unattemptedCount: a.unattemptedCount,
        // Null until the test's results are published (spec §54).
        batchRank: a.batchRank,
        branchRank: a.branchRank,
        organizationRank: a.organizationRank,
        percentile: a.percentile,
      })),
      subjects: subjectAccuracy(answers),
    };
  }

  async batchPerformance(ctx: TenantContext, batchId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, organizationId: ctx.organizationId },
      select: { id: true, name: true, code: true, branchId: true },
    });
    if (!batch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That batch does not exist.' });
    assertBranchAccess(ctx, batch.branchId);

    const enrolled = await this.prisma.batchStudent.findMany({
      where: { batchId, status: 'ENROLLED' },
      select: { studentId: true, student: { select: { id: true, name: true, studentCode: true } } },
    });
    const studentById = new Map(enrolled.map((e) => [e.studentId, e.student]));

    // Scoped to tests actually assigned to this batch — a student who has since
    // moved batches should not pull an unrelated paper's score in here.
    const attempts = enrolled.length
      ? await this.prisma.testAttempt.findMany({
          where: {
            studentId: { in: [...studentById.keys()] },
            status: { in: SCORED },
            test: { batches: { some: { batchId } } },
          },
        })
      : [];

    const answers = attempts.length
      ? await this.prisma.testAnswer.findMany({
          where: { attemptId: { in: attempts.map((a) => a.id) }, isCorrect: { not: null } },
          select: { isCorrect: true, question: { select: { subjectId: true, subject: { select: { id: true, name: true, code: true } } } } },
        })
      : [];

    const byStudent = new Map<string, { student: { id: string; name: string; studentCode: string }; percentages: number[] }>();
    for (const a of attempts) {
      const student = studentById.get(a.studentId);
      if (!student) continue;
      const entry = byStudent.get(a.studentId) ?? { student, percentages: [] };
      entry.percentages.push(a.percentage);
      byStudent.set(a.studentId, entry);
    }

    const topPerformers = [...byStudent.values()]
      .map((e) => ({ student: e.student, averagePercentage: average(e.percentages), attemptsCount: e.percentages.length }))
      .sort((a, b) => b.averagePercentage - a.averagePercentage)
      .slice(0, 10);

    const percentages = attempts.map((a) => a.percentage);

    return {
      batch: { id: batch.id, name: batch.name, code: batch.code },
      summary: {
        studentsEnrolled: enrolled.length,
        studentsWithAttempts: byStudent.size,
        testsRecorded: new Set(attempts.map((a) => a.testId)).size,
        averagePercentage: average(percentages),
      },
      topPerformers,
      subjects: subjectAccuracy(answers),
    };
  }

  /**
   * Spec §57 — a report with an explicit branch filter, not just implicit scope.
   * `branchId` lets an org-level user narrow to one branch without switching
   * their active branch (the same "Branch: All ▼ / Chennai / Salem" pattern the
   * spec shows); a branch-scoped caller can only ever narrow to their own.
   */
  async testPerformance(ctx: TenantContext, query: { branchId?: string; from?: string; to?: string }) {
    let branchIds: string[] | null;
    if (query.branchId) {
      assertBranchAccess(ctx, query.branchId);
      branchIds = [query.branchId];
    } else if (ctx.activeBranchId) {
      branchIds = [ctx.activeBranchId];
    } else {
      branchIds = ctx.accessibleBranchIds;
    }

    const where: Prisma.TestAttemptWhereInput = {
      organizationId: ctx.organizationId,
      status: { in: SCORED },
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
      ...(query.from || query.to
        ? {
            submittedAt: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const attempts = await this.prisma.testAttempt.findMany({
      where,
      select: {
        testId: true, branchId: true, percentage: true,
        test: { select: { id: true, title: true, code: true, startAt: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    const answers = attempts.length
      ? await this.prisma.testAnswer.findMany({
          where: { attempt: where, isCorrect: { not: null } },
          select: { isCorrect: true, question: { select: { subjectId: true, subject: { select: { id: true, name: true, code: true } } } } },
        })
      : [];

    const byTest = new Map<string, { test: { id: string; title: string; code: string; startAt: Date }; percentages: number[] }>();
    const byBranch = new Map<string, { branch: { id: string; name: string; code: string }; percentages: number[] }>();
    for (const a of attempts) {
      const t = byTest.get(a.testId) ?? { test: a.test, percentages: [] };
      t.percentages.push(a.percentage);
      byTest.set(a.testId, t);

      const b = byBranch.get(a.branchId) ?? { branch: a.branch, percentages: [] };
      b.percentages.push(a.percentage);
      byBranch.set(a.branchId, b);
    }

    const trend = [...byTest.values()]
      .map((e) => ({
        testId: e.test.id, title: e.test.title, code: e.test.code, date: e.test.startAt,
        averagePercentage: average(e.percentages), attemptsCount: e.percentages.length,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const branches = [...byBranch.values()]
      .map((e) => ({ branch: e.branch, averagePercentage: average(e.percentages), attemptsCount: e.percentages.length }))
      .sort((a, b) => b.averagePercentage - a.averagePercentage);

    const percentages = attempts.map((a) => a.percentage);

    return {
      summary: {
        attemptsCount: attempts.length,
        testsCount: byTest.size,
        averagePercentage: average(percentages),
        highest: percentages.length ? Math.max(...percentages) : null,
        lowest: percentages.length ? Math.min(...percentages) : null,
      },
      trend,
      branches,
      subjects: subjectAccuracy(answers),
    };
  }

  /**
   * Spec §64 — branch revenue, expenses, collections, outstanding and net
   * contribution.
   *
   * Two deliberate asymmetries, both of which would misreport a branch if
   * ignored:
   *
   * - **Collections are net of refunds.** Money refunded was never earned, so
   *   `amountMinor − refundedMinor` is the revenue figure, not the gross taken.
   * - **Outstanding is not date-filtered.** A debt does not belong to the month
   *   it was raised in — "what is still owed" is a question about now, and
   *   windowing it would quietly shrink the number every time someone narrowed
   *   the range.
   *
   * Central organization costs (`branchId: null`) are reported separately and
   * never divided across branches: any split would be invented, and netting
   * head-office spend against one branch would defame it.
   */
  async financeSummary(ctx: TenantContext, query: { branchId?: string; from?: string; to?: string }) {
    let branchIds: string[] | null;
    if (query.branchId) {
      assertBranchAccess(ctx, query.branchId);
      branchIds = [query.branchId];
    } else if (ctx.activeBranchId) {
      branchIds = [ctx.activeBranchId];
    } else {
      branchIds = ctx.accessibleBranchIds;
    }

    const paidAt = query.from || query.to
      ? {
          ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
          ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
        }
      : undefined;

    const incurredOn = query.from || query.to
      ? {
          ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
          ...(query.to ? { lte: new Date(`${query.to}T00:00:00.000Z`) } : {}),
        }
      : undefined;

    const [payments, fees, branchExpenses, centralExpenses, branchRows] = await Promise.all([
      this.prisma.feePayment.findMany({
        where: {
          organizationId: ctx.organizationId,
          ...(branchIds ? { branchId: { in: branchIds } } : {}),
          ...(paidAt ? { paidAt } : {}),
        },
        select: { branchId: true, amountMinor: true, refundedMinor: true, paidAt: true },
      }),
      this.prisma.studentFee.findMany({
        where: {
          organizationId: ctx.organizationId,
          ...(branchIds ? { branchId: { in: branchIds } } : {}),
          status: { in: ['PENDING', 'PARTIALLY_PAID'] },
        },
        select: { branchId: true, netMinor: true, paidMinor: true },
      }),
      this.prisma.expense.groupBy({
        by: ['branchId'],
        where: {
          organizationId: ctx.organizationId,
          branchId: branchIds ? { in: branchIds } : { not: null },
          status: { in: ['APPROVED', 'PAID'] },
          ...(incurredOn ? { incurredOn } : {}),
        },
        _sum: { amountMinor: true },
      }),
      // Central costs only make sense in the all-branch view; a branch-scoped
      // caller is not shown head-office spend at all.
      branchIds === null
        ? this.prisma.expense.aggregate({
            where: {
              organizationId: ctx.organizationId,
              branchId: null,
              status: { in: ['APPROVED', 'PAID'] },
              ...(incurredOn ? { incurredOn } : {}),
            },
            _sum: { amountMinor: true },
          })
        : Promise.resolve({ _sum: { amountMinor: 0 } }),
      this.prisma.branch.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: { not: 'ARCHIVED' },
          ...(branchIds ? { id: { in: branchIds } } : {}),
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const collectedByBranch = new Map<string, number>();
    for (const p of payments) {
      collectedByBranch.set(p.branchId, (collectedByBranch.get(p.branchId) ?? 0) + (p.amountMinor - p.refundedMinor));
    }

    const outstandingByBranch = new Map<string, number>();
    for (const f of fees) {
      outstandingByBranch.set(f.branchId, (outstandingByBranch.get(f.branchId) ?? 0) + (f.netMinor - f.paidMinor));
    }

    const expenseByBranch = new Map<string, number>();
    for (const e of branchExpenses) {
      if (e.branchId) expenseByBranch.set(e.branchId, e._sum.amountMinor ?? 0);
    }

    const branches = branchRows.map((b) => {
      const collectedMinor = collectedByBranch.get(b.id) ?? 0;
      const expensesMinor = expenseByBranch.get(b.id) ?? 0;
      return {
        branch: b,
        collectedMinor,
        outstandingMinor: outstandingByBranch.get(b.id) ?? 0,
        expensesMinor,
        netContributionMinor: collectedMinor - expensesMinor,
      };
    });

    const sum = (key: 'collectedMinor' | 'outstandingMinor' | 'expensesMinor' | 'netContributionMinor') =>
      branches.reduce((total, b) => total + b[key], 0);

    const centralExpensesMinor = centralExpenses._sum.amountMinor ?? 0;
    const collectedMinor = sum('collectedMinor');

    // Daily collection trend, for a chart that shows *when* money arrived.
    const byDay = new Map<string, number>();
    for (const p of payments) {
      const day = p.paidAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + (p.amountMinor - p.refundedMinor));
    }

    return {
      summary: {
        collectedMinor,
        outstandingMinor: sum('outstandingMinor'),
        branchExpensesMinor: sum('expensesMinor'),
        centralExpensesMinor,
        // Organization-level net does carry central costs; a branch's own does not.
        netMinor: collectedMinor - sum('expensesMinor') - centralExpensesMinor,
        receiptsCount: payments.length,
      },
      branches,
      trend: [...byDay.entries()]
        .map(([date, collectedMinor]) => ({ date, collectedMinor }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
}
