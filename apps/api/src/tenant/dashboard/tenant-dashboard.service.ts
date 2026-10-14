import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EntitlementsService } from '../../platform/entitlements/entitlements.service';
import { AttendanceService } from '../attendance/attendance.service';
import type { TenantContext } from '../scope/tenant-context';

const SCORED: ('SUBMITTED' | 'AUTO_SUBMITTED' | 'EVALUATED')[] = ['SUBMITTED', 'AUTO_SUBMITTED', 'EVALUATED'];

@Injectable()
export class TenantDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly attendance: AttendanceService,
  ) {}

  /**
   * Spec §§33, 34, 78, 79.
   *
   * One endpoint serves both the branch dashboard and the all-branch view — the
   * difference is entirely which branches the context permits, so a Branch Admin
   * physically cannot receive another branch's numbers.
   */
  async summary(ctx: TenantContext) {
    const branchWhere: Prisma.BranchWhereInput = {
      organizationId: ctx.organizationId,
      status: { not: 'ARCHIVED' },
      ...(ctx.activeBranchId
        ? { id: ctx.activeBranchId }
        : ctx.accessibleBranchIds
          ? { id: { in: ctx.accessibleBranchIds } }
          : {}),
    };

    const branches = await this.prisma.branch.findMany({
      where: branchWhere,
      select: { id: true, name: true, code: true, city: true, status: true },
      orderBy: { name: 'asc' },
    });
    const branchIds = branches.map((b) => b.id);

    const staffWhere: Prisma.OrgUserWhereInput = {
      organizationId: ctx.organizationId,
      deletedAt: null,
      role: { notIn: ['STUDENT', 'PARENT'] },
      ...(branchIds.length ? { branches: { some: { branchId: { in: branchIds }, endedAt: null } } } : {}),
    };

    const [staff, pendingInvites, faculty, orgUsage, entitlements] = await Promise.all([
      this.prisma.orgUser.count({ where: staffWhere }),
      this.prisma.orgUser.count({ where: { ...staffWhere, acceptedAt: null } }),
      this.prisma.orgUser.count({ where: { ...staffWhere, role: 'FACULTY' } }),
      this.entitlements.usage(ctx.organizationId),
      this.entitlements.resolve(ctx.organizationId),
    ]);

    const needsAdmin = await this.prisma.branch.findMany({
      where: { ...branchWhere, members: { none: { endedAt: null, user: { role: 'BRANCH_ADMIN' } } } },
      select: { id: true, name: true, status: true },
    });

    return {
      scope: ctx.activeBranchId ? 'branch' : ctx.accessibleBranchIds ? 'assigned' : 'organization',
      activeBranchId: ctx.activeBranchId,
      branches,
      metrics: {
        branches: branches.length,
        staff,
        faculty,
        pendingInvites,
        // Student and batch counters land with Phase 2; the organization-wide
        // figure is shown meanwhile so the tile is honest rather than fabricated.
        students: ctx.activeBranchId ? null : orgUsage.students,
      },
      plan: {
        name: entitlements.planName,
        branchLimit: entitlements.limits.branches ?? null,
        branchesUsed: orgUsage.branches,
      },
      alerts: {
        branchesNeedingAdmin: needsAdmin,
      },
    };
  }

  /**
   * Spec §56 — branch-by-branch comparison, org-level roles only.
   *
   * Faculty performance is the one item on the spec's list still missing: it
   * has no agreed definition and no data source, so it is absent rather than
   * approximated. Every figure returned here is real.
   */
  async branchComparison(ctx: TenantContext) {
    const branches = await this.prisma.branch.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { not: 'ARCHIVED' },
        ...(ctx.accessibleBranchIds ? { id: { in: ctx.accessibleBranchIds } } : {}),
      },
      select: {
        id: true, name: true, code: true, city: true, status: true, createdAt: true,
        _count: { select: { members: true } },
      },
      orderBy: { name: 'asc' },
    });
    const branchIds = branches.map((b) => b.id);
    if (!branchIds.length) return [];

    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const [activeStudents, enquiryStages, testStats, attendance, collections, outstanding] = await Promise.all([
      this.prisma.student.groupBy({
        by: ['branchId'],
        where: { organizationId: ctx.organizationId, branchId: { in: branchIds }, status: 'ACTIVE' },
        _count: true,
      }),
      this.prisma.enquiry.groupBy({
        by: ['branchId', 'stage'],
        where: { organizationId: ctx.organizationId, branchId: { in: branchIds } },
        _count: true,
      }),
      this.prisma.testAttempt.groupBy({
        by: ['branchId'],
        where: { organizationId: ctx.organizationId, branchId: { in: branchIds }, status: { in: SCORED } },
        _avg: { percentage: true },
        _count: true,
      }),
      // Last 30 days — long enough to smooth a single bad day, short enough to
      // stay "how is this branch doing lately" rather than an all-time figure.
      this.attendance.report(ctx, { from: iso(from), to: iso(to) }),
      // Spec §56 fee collection. Net of refunds, and over the same 30 days as
      // attendance so the two columns describe the same period.
      this.prisma.feePayment.findMany({
        where: { organizationId: ctx.organizationId, branchId: { in: branchIds }, paidAt: { gte: from, lte: to } },
        select: { branchId: true, amountMinor: true, refundedMinor: true },
      }),
      // Outstanding is deliberately *not* windowed — a debt does not belong to
      // the month it was raised in; the question is what is still owed now.
      this.prisma.studentFee.findMany({
        where: {
          organizationId: ctx.organizationId,
          branchId: { in: branchIds },
          status: { in: ['PENDING', 'PARTIALLY_PAID'] },
        },
        select: { branchId: true, netMinor: true, paidMinor: true },
      }),
    ]);

    const studentsByBranch = new Map(activeStudents.map((r) => [r.branchId, r._count]));
    const scoreByBranch = new Map(testStats.map((r) => [r.branchId, { average: r._avg.percentage ?? 0, count: r._count }]));
    const attendanceByBranch = new Map(attendance.byBranch.map((r) => [r.id, r.percent]));

    const collectedByBranch = new Map<string, number>();
    for (const p of collections) {
      collectedByBranch.set(p.branchId, (collectedByBranch.get(p.branchId) ?? 0) + (p.amountMinor - p.refundedMinor));
    }

    const outstandingByBranch = new Map<string, number>();
    for (const f of outstanding) {
      outstandingByBranch.set(f.branchId, (outstandingByBranch.get(f.branchId) ?? 0) + (f.netMinor - f.paidMinor));
    }

    const stagesByBranch = new Map<string, Record<string, number>>();
    for (const row of enquiryStages) {
      const stages = stagesByBranch.get(row.branchId) ?? {};
      stages[row.stage] = row._count;
      stagesByBranch.set(row.branchId, stages);
    }

    return branches.map((b) => {
      const { _count, ...rest } = b;
      const stages = stagesByBranch.get(b.id) ?? {};
      const admitted = stages.ADMITTED ?? 0;
      const closed = admitted + (stages.LOST ?? 0);
      const scores = scoreByBranch.get(b.id);

      return {
        ...rest,
        staffCount: _count.members,
        activeStudents: studentsByBranch.get(b.id) ?? 0,
        attendanceRate: attendanceByBranch.get(b.id) ?? null,
        admissionConversionRate: closed === 0 ? null : (admitted / closed) * 100,
        averageTestScore: scores ? scores.average : null,
        testsSat: scores ? scores.count : 0,
        collectedMinor: collectedByBranch.get(b.id) ?? 0,
        outstandingMinor: outstandingByBranch.get(b.id) ?? 0,
      };
    });
  }
}
