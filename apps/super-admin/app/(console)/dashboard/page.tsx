'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Badge, BarChart, Card, CardContent, CardHeader, CardTitle, DateRangeFilter, DonutChart,
  ErrorState, LineChart, MetricCard, Skeleton, PageHeader, resolvePreset, type DateRange,
} from '@acadia/ui';
import { formatMinorCompact } from '@acadia/utils';
import { useQuery } from '@/lib/hooks';

interface Summary {
  organizations: { total: number; active: number; trial: number; expiredTrials: number; paid: number; suspended: number; new: number; newDelta: number };
  subscriptions: { new: number; newDelta: number; churned: number; churnRate: number; trialConversionRate: number };
  revenue: { currency: string; collectedMinor: number; collectedDelta: number; mrrMinor: number; arrMinor: number };
  usage: { students: number; faculty: number; branches: number };
  support: { open: number; urgent: number };
}

type Point = { date: string; value: number };

export default function DashboardPage() {
  const [range, setRange] = React.useState<DateRange>(() => resolvePreset('30d'));
  const query = { from: range.from, to: range.to };

  const summary = useQuery<Summary>('/platform/dashboard/summary', { query });
  const growth = useQuery<Point[]>('/platform/dashboard/organization-growth', { query });
  const revenue = useQuery<Point[]>('/platform/dashboard/revenue-trend', { query });
  const plans = useQuery<{ plan: string; count: number }[]>('/platform/dashboard/plan-distribution');
  const atRisk = useQuery<{
    expiringTrials: { id: string; name: string; trialEndsAt: string }[];
    pastDue: { id: string; name: string; status: string }[];
  }>('/platform/dashboard/at-risk');

  const s = summary.data;
  const label = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Platform' }, { label: 'Dashboard' }]}
        title="Dashboard"
        description="Health of the platform across every organization."
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {summary.error ? (
          <ErrorState
            title="Couldn't load the dashboard"
            description={summary.error.message}
            onRetry={summary.reload}
          />
        ) : (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              {summary.loading || !s ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-lg" />)
              ) : (
                <>
                  <MetricCard
                    title="Organizations"
                    value={s.organizations.total.toLocaleString('en-IN')}
                    delta={Number(s.organizations.newDelta.toFixed(1))}
                    deltaLabel={`${s.organizations.new} new`}
                    description={`${s.organizations.active} active · ${s.organizations.trial} on trial`}
                  />
                  <MetricCard
                    title="MRR"
                    value={formatMinorCompact(s.revenue.mrrMinor)}
                    delta={Number(s.revenue.collectedDelta.toFixed(1))}
                    description={`ARR ${formatMinorCompact(s.revenue.arrMinor)}`}
                  />
                  <MetricCard
                    title="Collected"
                    value={formatMinorCompact(s.revenue.collectedMinor)}
                    delta={Number(s.revenue.collectedDelta.toFixed(1))}
                    description="in the selected period"
                  />
                  <MetricCard
                    title="Churn"
                    value={`${s.subscriptions.churnRate.toFixed(1)}%`}
                    delta={s.subscriptions.churned}
                    deltaLabel={`${s.subscriptions.churned} cancelled`}
                    invertDelta
                    description={`Trial conversion ${s.subscriptions.trialConversionRate.toFixed(0)}%`}
                  />
                </>
              )}
            </div>

            <div className="grid gap-3.5 lg:grid-cols-2">
              {growth.loading ? (
                <Skeleton className="h-[280px] rounded-lg" />
              ) : (
                <LineChart
                  title="New organizations"
                  subtitle="Signups per day"
                  data={(growth.data ?? []).map((p) => ({ label: label(p.date), value: p.value }))}
                  formatValue={(n) => String(Math.round(n))}
                />
              )}

              {revenue.loading ? (
                <Skeleton className="h-[280px] rounded-lg" />
              ) : (
                <LineChart
                  title="Revenue collected"
                  subtitle="Net of refunds, per day"
                  data={(revenue.data ?? []).map((p) => ({ label: label(p.date), value: p.value }))}
                  formatValue={(n) => formatMinorCompact(n)}
                />
              )}
            </div>

            <div className="grid gap-3.5 lg:grid-cols-3">
              {plans.loading ? (
                <Skeleton className="h-[300px] rounded-lg" />
              ) : (plans.data ?? []).length > 0 ? (
                <DonutChart
                  title="Plan distribution"
                  subtitle="Live subscriptions"
                  centerLabel="subscriptions"
                  data={(plans.data ?? []).map((p) => ({ label: p.plan, value: p.count }))}
                />
              ) : null}

              {s && (
                <BarChart
                  title="Platform usage"
                  subtitle="Across all organizations"
                  horizontal
                  data={[
                    { label: 'Students', value: s.usage.students },
                    { label: 'Faculty', value: s.usage.faculty },
                    { label: 'Branches', value: s.usage.branches },
                  ]}
                  formatValue={(n) => Math.round(n).toLocaleString('en-IN')}
                />
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Needs attention</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Section
                    title="Trials ending soon"
                    empty="No trials ending in the next 7 days."
                    items={(atRisk.data?.expiringTrials ?? []).map((o) => ({
                      id: o.id,
                      name: o.name,
                      meta: `ends ${o.trialEndsAt.slice(0, 10)}`,
                      variant: 'warning' as const,
                    }))}
                  />
                  <Section
                    title="Payment due or suspended"
                    empty="Nothing overdue."
                    items={(atRisk.data?.pastDue ?? []).map((o) => ({
                      id: o.id,
                      name: o.name,
                      meta: o.status.replace('_', ' ').toLowerCase(),
                      variant: 'error' as const,
                    }))}
                  />
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Section({
  title, items, empty,
}: {
  title: string;
  empty: string;
  items: { id: string; name: string; meta: string; variant: 'warning' | 'error' }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label text-fg-secondary">{title}</span>
      {items.length === 0 ? (
        <span className="text-caption text-fg-muted">{empty}</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((i) => (
            <li key={i.id}>
              <Link
                href={`/organizations/${i.id}`}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-surface-secondary"
              >
                <span className="truncate text-body-sm text-fg">{i.name}</span>
                <Badge variant={i.variant}>{i.meta}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
