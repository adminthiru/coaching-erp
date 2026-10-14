import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { pctChange } from '@acadia/utils';

export interface RangeInput {
  from: Date;
  to: Date;
}

/** Live (revenue-bearing or trialling) subscription states. */
const LIVE = ['TRIAL', 'ACTIVE', 'RENEWAL', 'PAYMENT_DUE', 'PAST_DUE'] as const;
const PAYING = ['ACTIVE', 'RENEWAL', 'PAYMENT_DUE', 'PAST_DUE'] as const;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Spec §10. Every count is paired with the equivalent count from the preceding
   * window of the same length, so the UI can show a real delta rather than an
   * arbitrary one.
   */
  async summary(range: RangeInput) {
    const span = range.to.getTime() - range.from.getTime();
    const prev = { from: new Date(range.from.getTime() - span), to: range.from };

    const [
      totalOrgs, activeOrgs, trialOrgs, expiredTrials, paidOrgs, suspendedOrgs,
      newOrgs, prevNewOrgs,
      newSubs, prevNewSubs,
      revenue, prevRevenue,
      usageAgg, branchCount,
      openTickets, urgentTickets,
      churned, convertedTrials, endedTrials,
    ] = await this.prisma.$transaction([
      this.prisma.organization.count(),
      this.prisma.organization.count({ where: { status: 'ACTIVE' } }),
      this.prisma.organization.count({ where: { status: 'TRIAL' } }),
      this.prisma.organization.count({ where: { status: 'TRIAL', trialEndsAt: { lt: new Date() } } }),
      this.prisma.organization.count({ where: { subscriptions: { some: { status: { in: [...PAYING] } } } } }),
      this.prisma.organization.count({ where: { status: 'SUSPENDED' } }),

      this.prisma.organization.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
      this.prisma.organization.count({ where: { createdAt: { gte: prev.from, lt: prev.to } } }),

      this.prisma.subscription.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
      this.prisma.subscription.count({ where: { createdAt: { gte: prev.from, lt: prev.to } } }),

      this.prisma.payment.aggregate({
        _sum: { amountMinor: true, refundedMinor: true },
        where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] }, paidAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.payment.aggregate({
        _sum: { amountMinor: true, refundedMinor: true },
        where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] }, paidAt: { gte: prev.from, lt: prev.to } },
      }),

      this.prisma.organizationUsage.aggregate({ _sum: { students: true, faculty: true } }),
      this.prisma.branch.count({ where: { status: { not: 'ARCHIVED' } } }),

      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, priority: 'URGENT' } }),

      this.prisma.subscription.count({ where: { status: 'CANCELLED', cancelledAt: { gte: range.from, lte: range.to } } }),
      this.prisma.trialEvent.count({ where: { type: 'CONVERT', createdAt: { gte: range.from, lte: range.to } } }),
      this.prisma.trialEvent.count({ where: { type: { in: ['CONVERT', 'CANCEL'] }, createdAt: { gte: range.from, lte: range.to } } }),
    ]);

    const net = (a: typeof revenue) => (a._sum.amountMinor ?? 0) - (a._sum.refundedMinor ?? 0);
    const revenueMinor = net(revenue);
    const prevRevenueMinor = net(prevRevenue);

    const { mrrMinor, arrMinor } = await this.recurringRevenue();

    // Churn over the window, against the base that existed when it opened.
    const baseAtStart = paidOrgs + churned;
    const churnRate = baseAtStart === 0 ? 0 : (churned / baseAtStart) * 100;

    return {
      organizations: {
        total: totalOrgs,
        active: activeOrgs,
        trial: trialOrgs,
        expiredTrials,
        paid: paidOrgs,
        suspended: suspendedOrgs,
        new: newOrgs,
        newDelta: pctChange(newOrgs, prevNewOrgs),
      },
      subscriptions: {
        new: newSubs,
        newDelta: pctChange(newSubs, prevNewSubs),
        churned,
        churnRate,
        trialConversionRate: endedTrials === 0 ? 0 : (convertedTrials / endedTrials) * 100,
      },
      revenue: {
        currency: 'INR',
        collectedMinor: revenueMinor,
        collectedDelta: pctChange(revenueMinor, prevRevenueMinor),
        mrrMinor,
        arrMinor,
      },
      usage: {
        students: usageAgg._sum.students ?? 0,
        faculty: usageAgg._sum.faculty ?? 0,
        branches: branchCount,
      },
      support: { open: openTickets, urgent: urgentTickets },
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
    };
  }

  /**
   * MRR is the sum of every paying subscription normalised to a month; ARR is
   * that figure annualised. Trials contribute nothing until they convert.
   */
  private async recurringRevenue() {
    const subs = await this.prisma.subscription.findMany({
      where: { status: { in: [...PAYING] } },
      select: { billingCycle: true, plan: { select: { monthlyPriceMinor: true, annualPriceMinor: true } } },
    });

    const mrrMinor = subs.reduce((sum, s) => {
      const m = s.billingCycle === 'ANNUAL'
        ? Math.round(s.plan.annualPriceMinor / 12)
        : s.plan.monthlyPriceMinor;
      return sum + m;
    }, 0);

    return { mrrMinor, arrMinor: mrrMinor * 12 };
  }

  /** Organization signups per day, zero-filled so the chart has no gaps. */
  async organizationGrowth(range: RangeInput) {
    const rows = await this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM organizations
      WHERE "createdAt" >= ${range.from} AND "createdAt" <= ${range.to}
      GROUP BY 1 ORDER BY 1
    `;
    return zeroFill(rows.map((r) => ({ date: iso(r.day), value: Number(r.count) })), range);
  }

  /** Net collected revenue per day. */
  async revenueTrend(range: RangeInput) {
    const rows = await this.prisma.$queryRaw<{ day: Date; total: bigint }[]>`
      SELECT date_trunc('day', "paidAt") AS day,
             COALESCE(SUM("amountMinor" - "refundedMinor"), 0)::bigint AS total
      FROM payments
      WHERE "status" IN ('SUCCEEDED', 'PARTIALLY_REFUNDED')
        AND "paidAt" >= ${range.from} AND "paidAt" <= ${range.to}
      GROUP BY 1 ORDER BY 1
    `;
    return zeroFill(rows.map((r) => ({ date: iso(r.day), value: Number(r.total) })), range);
  }

  /** Spec §21 — plan distribution across live subscriptions. */
  async planDistribution() {
    const grouped = await this.prisma.subscription.groupBy({
      by: ['planId'],
      where: { status: { in: [...LIVE] } },
      _count: { _all: true },
    });
    if (!grouped.length) return [];

    const plans = await this.prisma.plan.findMany({
      where: { id: { in: grouped.map((g) => g.planId) } },
      select: { id: true, name: true },
    });
    const byId = new Map(plans.map((p) => [p.id, p.name]));

    return grouped
      .map((g) => ({ planId: g.planId, plan: byId.get(g.planId) ?? 'Unknown', count: g._count._all }))
      .sort((a, b) => b.count - a.count);
  }

  async statusBreakdown() {
    const grouped = await this.prisma.organization.groupBy({ by: ['status'], _count: { _all: true } });
    return grouped.map((g) => ({ status: g.status, count: g._count._all }));
  }

  /** Organizations approaching or past a plan ceiling — the console's alert list. */
  async atRiskOrganizations(limit = 8) {
    const [expiringTrials, pastDue] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where: { status: 'TRIAL', trialEndsAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 864e5) } },
        orderBy: { trialEndsAt: 'asc' },
        take: limit,
        select: { id: true, name: true, slug: true, trialEndsAt: true, status: true },
      }),
      this.prisma.organization.findMany({
        where: { status: { in: ['PAYMENT_DUE', 'SUSPENDED'] } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: { id: true, name: true, slug: true, status: true, updatedAt: true },
      }),
    ]);
    return { expiringTrials, pastDue };
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Databases return only days that had rows; a time series needs every day. */
function zeroFill(points: { date: string; value: number }[], range: RangeInput) {
  const found = new Map(points.map((p) => [p.date, p.value]));
  const out: { date: string; value: number }[] = [];
  const cursor = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate()));
  const end = new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), range.to.getUTCDate()));

  // Cap the series so a wide custom range cannot return thousands of points.
  let guard = 0;
  while (cursor <= end && guard++ < 400) {
    const key = iso(cursor);
    out.push({ date: key, value: found.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
