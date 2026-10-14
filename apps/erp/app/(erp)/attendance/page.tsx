'use client';

import * as React from 'react';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, DateRangeFilter, ErrorState,
  MetricCard, PageHeader, Progress, Segmented, Skeleton, resolvePreset, type DateRange,
} from '@acadia/ui';
import { formatClock12 } from '@acadia/utils';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { MarkAttendanceDrawer } from '@/components/mark-attendance-drawer';

interface SessionRow {
  id: string; date: string; startMinute: number; endMinute: number; status: string;
  marked: boolean; markedCount: number;
  batch: { id: string; name: string; code: string };
  subject: { id: string; name: string; code: string };
  faculty: { id: string; name: string };
  branch: { id: string; name: string; code: string };
}

/** `percent` is null when nothing countable remains — see the API's `rate()`. */
interface Rated {
  id: string; name: string; code: string;
  percent: number | null; records: number; countable: number;
}

interface Report {
  overall: { percent: number | null; records: number; countable: number; counts: Record<string, number> };
  byStudent: Rated[];
  byBatch: Rated[];
  byBranch: Rated[];
  trend: { date: string; percent: number | null }[];
}

/** Spec §47 — marking and the four report levels. */
export default function AttendancePage() {
  const { activeBranch, scope } = useSession();
  const [tab, setTab] = React.useState('mark');
  const [range, setRange] = React.useState<DateRange>(() => resolvePreset('7d'));
  const [marking, setMarking] = React.useState<SessionRow | null>(null);

  const sessions = useQuery<SessionRow[]>('/attendance/sessions', {
    query: { from: range.from, to: range.to },
  }, [range.from, range.to]);

  const report = useQuery<Report>('/attendance/report', {
    query: { from: range.from, to: range.to },
  }, [range.from, range.to]);

  const unmarked = (sessions.data ?? []).filter((s) => !s.marked && s.status !== 'CANCELLED');

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Academic' }, { label: 'Attendance' }]}
        title="Attendance"
        description={
          activeBranch ? `Classes and attendance at ${activeBranch.name}.` : 'Attendance across the branches you can access.'
        }
        actions={<DateRangeFilter value={range} onChange={setRange} />}
        tabs={
          <Segmented
            options={[{ value: 'mark', label: 'Mark' }, { value: 'reports', label: 'Reports' }]}
            value={tab}
            onChange={setTab}
            aria-label="Attendance view"
          />
        }
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {tab === 'mark' && (
          sessions.error ? (
            <ErrorState title="Couldn't load classes" description={sessions.error.message} onRetry={sessions.reload} />
          ) : sessions.loading ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : (sessions.data ?? []).length === 0 ? (
            <Alert tone="info" title="No classes in this period">
              Generate classes from the Timetable page, then mark attendance here.
            </Alert>
          ) : (
            <>
              {unmarked.length > 0 && (
                <Alert tone="warning" title={`${unmarked.length} ${unmarked.length === 1 ? 'class needs' : 'classes need'} a roll`}>
                  Attendance has not been taken for these yet.
                </Alert>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Classes</CardTitle>
                  <span className="text-caption text-fg-muted">
                    {range.from} to {range.to} · newest first
                  </span>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-2">
                    {(sessions.data ?? []).map((s) => (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2.5 last:border-0"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-body-sm text-fg">
                            {s.subject.name} · {s.batch.name}
                          </span>
                          <span className="truncate text-caption text-fg-muted">
                            {s.date} · {formatClock12(s.startMinute)}–{formatClock12(s.endMinute)} · {s.faculty.name}
                            {!activeBranch && ` · ${s.branch.code}`}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2.5">
                          {s.status === 'CANCELLED' ? (
                            <Badge variant="neutral">Cancelled</Badge>
                          ) : s.marked ? (
                            <Badge variant="success">{s.markedCount} marked</Badge>
                          ) : (
                            <Badge variant="warning">Not marked</Badge>
                          )}
                          {s.status !== 'CANCELLED' && (
                            <Button size="sm" variant={s.marked ? 'outline' : 'primary'} onClick={() => setMarking(s)}>
                              {s.marked ? 'Edit roll' : 'Take roll'}
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          )
        )}

        {tab === 'reports' && (
          report.error ? (
            <ErrorState title="Couldn't load the report" description={report.error.message} onRetry={report.reload} />
          ) : report.loading || !report.data ? (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-lg" />)}
            </div>
          ) : report.data.overall.records === 0 ? (
            <Alert tone="info" title="No attendance recorded in this period">
              Take a roll from the Mark tab to start building reports.
            </Alert>
          ) : (
            <>
              <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="Overall attendance"
                  value={report.data.overall.percent === null ? '—' : `${report.data.overall.percent.toFixed(1)}%`}
                  description={
                    report.data.overall.percent === null
                      ? 'no countable records'
                      : `${report.data.overall.countable} of ${report.data.overall.records} records counted`
                  }
                />
                <MetricCard
                  title="Present"
                  value={String(report.data.overall.counts.PRESENT ?? 0)}
                  description={`${report.data.overall.counts.LATE ?? 0} late`}
                />
                <MetricCard
                  title="Absent"
                  value={String(report.data.overall.counts.ABSENT ?? 0)}
                  description={`${report.data.overall.counts.HALF_DAY ?? 0} half days`}
                  invertDelta
                />
                <MetricCard
                  title="Excused"
                  value={String(report.data.overall.counts.EXCUSED ?? 0)}
                  description="approved leave, not counted"
                />
              </div>

              <div className="grid gap-3.5 lg:grid-cols-2">
                <RankCard
                  title="Students needing attention"
                  subtitle="Lowest attendance first"
                  rows={report.data.byStudent.slice(0, 10)}
                />
                <RankCard title="By batch" subtitle="Lowest attendance first" rows={report.data.byBatch} />
              </div>

              {scope?.canSelectAllBranches && report.data.byBranch.length > 1 && (
                <RankCard title="By branch" subtitle="Cross-branch comparison" rows={report.data.byBranch} />
              )}
            </>
          )
        )}
      </div>

      <MarkAttendanceDrawer
        open={marking !== null}
        session={marking}
        onClose={() => setMarking(null)}
        onDone={() => { setMarking(null); sessions.reload(); report.reload(); }}
      />
    </>
  );
}

function RankCard({
  title, subtitle, rows,
}: {
  title: string;
  subtitle: string;
  rows: Rated[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <span className="text-caption text-fg-muted">{subtitle}</span>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-body-sm text-fg-muted">Nothing recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-sm text-fg">{r.name}</span>
                  <span className="truncate text-caption text-fg-muted">
                    <span className="font-mono">{r.code}</span>
                    {r.percent === null ? ' · all excused' : ` · ${r.records} records`}
                  </span>
                </span>
                <span className="w-[110px] shrink-0">
                  {r.percent === null ? (
                    <span className="block h-1.5 rounded-full bg-surface-secondary" aria-hidden />
                  ) : (
                    <Progress
                      value={r.percent}
                      max={100}
                      size="sm"
                      tone={r.percent < 60 ? 'error' : r.percent < 75 ? 'warning' : 'success'}
                      aria-label={`${r.name} attendance`}
                    />
                  )}
                </span>
                <span
                  className={`w-[52px] shrink-0 text-right font-mono text-body-sm tabular-nums ${
                    r.percent === null
                      ? 'text-fg-muted'
                      : r.percent < 60 ? 'text-error' : r.percent < 75 ? 'text-warning' : 'text-fg'
                  }`}
                >
                  {r.percent === null ? '—' : `${r.percent.toFixed(0)}%`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
