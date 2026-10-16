'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Alert, Card, CardContent, CardHeader, CardTitle, DateRangeFilter, ErrorState, MetricCard,
  PageHeader, percent, Progress, resolvePreset, Segmented, Select, Skeleton, type DateRange,
} from '@acadia/ui';
import { formatMinor } from '@acadia/utils';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { InsightsPanel } from '@/components/insights-panel';

interface TestPerformanceReport {
  summary: { attemptsCount: number; testsCount: number; averagePercentage: number; highest: number | null; lowest: number | null };
  trend: { testId: string; title: string; code: string; date: string; averagePercentage: number; attemptsCount: number }[];
  branches: { branch: { id: string; name: string; code: string }; averagePercentage: number; attemptsCount: number }[];
  subjects: { subject: { id: string; name: string; code: string }; correct: number; wrong: number; accuracy: number | null }[];
}

interface FinanceReport {
  summary: {
    collectedMinor: number; outstandingMinor: number; branchExpensesMinor: number;
    centralExpensesMinor: number; netMinor: number; receiptsCount: number;
  };
  branches: {
    branch: { id: string; name: string; code: string };
    collectedMinor: number; outstandingMinor: number; expensesMinor: number; netContributionMinor: number;
  }[];
  trend: { date: string; collectedMinor: number }[];
}

/**
 * Spec §57 — reports carry an explicit branch filter, distinct from whatever
 * branch the switcher happens to be on. An org-level user can audit one
 * branch's performance without leaving the all-branch view.
 */
export default function ReportsPage() {
  const { branches, scope, user } = useSession();
  const [view, setView] = React.useState('tests');
  const [branchId, setBranchId] = React.useState('all');
  const [range, setRange] = React.useState<DateRange>(() => resolvePreset('30d'));

  const canFilterBranch = scope?.canSelectAllBranches ?? false;
  const canSeeFinance = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'].includes(user?.role ?? '');
  const branchParam = canFilterBranch && branchId !== 'all' ? branchId : undefined;

  const { data, error, loading, reload } = useQuery<TestPerformanceReport>(view === 'tests' ? '/analytics/tests' : null, {
    query: { branchId: branchParam, from: range.from, to: range.to },
  }, [branchId, range.from, range.to, view]);

  const finance = useQuery<FinanceReport>(view === 'finance' ? '/analytics/finance' : null, {
    query: { branchId: branchParam, from: range.from, to: range.to },
  }, [branchId, range.from, range.to, view]);

  const showBranchColumn = Boolean(data) && (!canFilterBranch || branchId === 'all') && data!.branches.length > 1;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Reports' }, { label: view === 'finance' ? 'Finance' : 'Test performance' }]}
        title={view === 'finance' ? 'Finance' : 'Test performance'}
        description={
          view === 'finance'
            ? 'Collections, outstanding fees, expenses and net contribution per branch.'
            : 'Score trend, branch comparison and subject accuracy for the period below.'
        }
        actions={
          <>
            {canFilterBranch && (
              <Select
                options={[{ value: 'all', label: 'All branches' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
                value={branchId}
                onChange={setBranchId}
                className="w-[180px]"
              />
            )}
            <DateRangeFilter value={range} onChange={setRange} />
          </>
        }
        tabs={
          canSeeFinance ? (
            <Segmented
              options={[{ value: 'tests', label: 'Test performance' }, { value: 'finance', label: 'Finance' }]}
              value={view}
              onChange={setView}
              aria-label="Report"
            />
          ) : undefined
        }
      />

      {view === 'finance' ? (
        <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
          {canFilterBranch && (
            <InsightsPanel
              path="/insights/organization"
              title="Branch insights"
              description="How your branches compare on attendance and test performance, with an advisory summary."
            />
          )}
          <FinanceView data={finance.data} loading={finance.loading} error={finance.error} onRetry={finance.reload} />
        </div>
      ) : (
      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {error ? (
          <ErrorState title="Couldn't load the report" description={error.message} onRetry={reload} />
        ) : loading || !data ? (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-lg" />)}
          </div>
        ) : data.summary.attemptsCount === 0 ? (
          <Alert tone="info" title="No scored tests in this period">
            Once a test is submitted and evaluated in this window, its performance appears here.
          </Alert>
        ) : (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Tests" value={String(data.summary.testsCount)} description={`${data.summary.attemptsCount} attempts scored`} />
              <MetricCard title="Average score" value={percent(data.summary.averagePercentage)} description="across every attempt" />
              <MetricCard title="Highest" value={data.summary.highest === null ? '—' : percent(data.summary.highest)} description="best single attempt" />
              <MetricCard title="Lowest" value={data.summary.lowest === null ? '—' : percent(data.summary.lowest)} description="weakest single attempt" />
            </div>

            <div className="grid gap-3.5 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>By test</CardTitle>
                  <span className="text-caption text-fg-muted">Oldest to newest</span>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-2.5">
                    {data.trend.map((t) => (
                      <li key={t.testId} className="flex items-center gap-3">
                        <Link href={`/tests/view?id=${t.testId}`} className="flex min-w-0 flex-1 flex-col hover:text-primary">
                          <span className="truncate text-body-sm text-fg">{t.title}</span>
                          <span className="truncate text-caption text-fg-muted">
                            <span className="font-mono">{t.code}</span> · {t.date.slice(0, 10)} · {t.attemptsCount} attempt{t.attemptsCount === 1 ? '' : 's'}
                          </span>
                        </Link>
                        <span className="w-[90px] shrink-0"><Progress value={t.averagePercentage} max={100} size="sm" aria-label={`${t.title} average score`} /></span>
                        <span className="w-[52px] shrink-0 text-right font-mono text-body-sm tabular-nums text-fg">{percent(t.averagePercentage)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {showBranchColumn ? (
                <Card>
                  <CardHeader>
                    <CardTitle>By branch</CardTitle>
                    <span className="text-caption text-fg-muted">Highest average first</span>
                  </CardHeader>
                  <CardContent>
                    <ul className="flex flex-col gap-2.5">
                      {data.branches.map((b) => (
                        <li key={b.branch.id} className="flex items-center gap-3">
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-body-sm text-fg">{b.branch.name}</span>
                            <span className="truncate text-caption text-fg-muted">
                              <span className="font-mono">{b.branch.code}</span> · {b.attemptsCount} attempt{b.attemptsCount === 1 ? '' : 's'}
                            </span>
                          </span>
                          <span className="w-[90px] shrink-0"><Progress value={b.averagePercentage} max={100} size="sm" aria-label={`${b.branch.name} average score`} /></span>
                          <span className="w-[52px] shrink-0 text-right font-mono text-body-sm tabular-nums text-fg">{percent(b.averagePercentage)}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : (
                <SubjectAccuracyCard subjects={data.subjects} />
              )}
            </div>

            {showBranchColumn && <SubjectAccuracyCard subjects={data.subjects} />}
          </>
        )}
      </div>
      )}
    </>
  );
}

/** Spec §64 — collections, outstanding, expenses and net contribution. */
function FinanceView({
  data, loading, error, onRetry,
}: {
  data: FinanceReport | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (error) return <ErrorState title="Couldn't load the finance report" description={error.message} onRetry={onRetry} />;
  if (loading || !data) {
    return (
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-lg" />)}
      </div>
    );
  }

  const peak = Math.max(1, ...data.branches.map((b) => b.collectedMinor));

  return (
    <>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Collected" value={formatMinor(data.summary.collectedMinor)} description={`${data.summary.receiptsCount} receipts`} />
        <MetricCard title="Outstanding" value={formatMinor(data.summary.outstandingMinor)} description="still owed, all time" invertDelta />
        <MetricCard title="Expenses" value={formatMinor(data.summary.branchExpensesMinor)} description={data.summary.centralExpensesMinor > 0 ? `+ ${formatMinor(data.summary.centralExpensesMinor)} central` : 'approved and paid'} invertDelta />
        <MetricCard title="Net" value={formatMinor(data.summary.netMinor)} description="collections less all expenses" />
      </div>

      <Alert tone="info" title="How these are counted">
        Collections are net of refunds. Outstanding is <em>not</em> limited to the date range — a debt does not belong to
        the month it was raised in. Central organization costs are never divided across branches.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>By branch</CardTitle>
          <span className="text-caption text-fg-muted">Net contribution is that branch&rsquo;s collections less its own expenses.</span>
        </CardHeader>
        <CardContent>
          {data.branches.length === 0 ? (
            <p className="text-body-sm text-fg-muted">Nothing recorded in this period.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.branches.map((b) => (
                <li key={b.branch.id} className="flex flex-col gap-1.5 border-b border-border pb-3 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-body-sm text-fg">{b.branch.name}</span>
                    <span className={`font-mono text-body-sm tabular-nums ${b.netContributionMinor >= 0 ? 'text-fg' : 'text-error'}`}>
                      {formatMinor(b.netContributionMinor)}
                    </span>
                  </div>
                  <Progress value={b.collectedMinor} max={peak} size="sm" aria-label={`${b.branch.name} collections`} />
                  <div className="flex gap-4 text-caption text-fg-muted">
                    <span>Collected <span className="font-mono text-fg-secondary">{formatMinor(b.collectedMinor)}</span></span>
                    <span>Expenses <span className="font-mono text-fg-secondary">{formatMinor(b.expensesMinor)}</span></span>
                    <span>Outstanding <span className="font-mono text-warning">{formatMinor(b.outstandingMinor)}</span></span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {data.trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Collections by day</CardTitle>
            <span className="text-caption text-fg-muted">When the money actually arrived.</span>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {data.trend.map((t) => (
                <li key={t.date} className="flex items-center gap-3">
                  <span className="w-[90px] shrink-0 font-mono text-caption text-fg-muted">{t.date}</span>
                  <span className="flex-1">
                    <Progress
                      value={t.collectedMinor}
                      max={Math.max(...data.trend.map((x) => x.collectedMinor), 1)}
                      size="sm"
                      aria-label={`Collected on ${t.date}`}
                    />
                  </span>
                  <span className="w-[100px] shrink-0 text-right font-mono text-body-sm tabular-nums text-fg">
                    {formatMinor(t.collectedMinor)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function SubjectAccuracyCard({
  subjects,
}: {
  subjects: { subject: { id: string; name: string; code: string }; correct: number; wrong: number; accuracy: number | null }[];
}) {
  return (
    <Card>
      <CardHeader><CardTitle>Accuracy by subject</CardTitle></CardHeader>
      <CardContent>
        {subjects.length === 0 ? (
          <p className="text-body-sm text-fg-muted">No scored answers in this period.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {subjects.map((s) => (
              <li key={s.subject.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-body-sm text-fg">{s.subject.name}</span>
                  <span className="text-caption text-fg-muted">{s.correct} correct · {s.wrong} wrong</span>
                </span>
                <span className="font-mono tabular-nums text-fg-secondary">{s.accuracy === null ? '—' : percent(s.accuracy)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
