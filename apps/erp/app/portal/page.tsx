'use client';

import * as React from 'react';
import {
  Alert, Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, MetricCard,
  Progress, Segmented, Skeleton, percent,
} from '@acadia/ui';
import {
  INSTALLMENT_STATUS_LABEL, STUDENT_FEE_STATUS_LABEL, SUBMISSION_STATUS_LABEL,
  type InstallmentStatus, type StudentFeeStatus, type SubmissionStatus,
} from '@acadia/types';
import { formatMinor } from '@acadia/utils';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Child {
  id: string; name: string; studentCode: string; status: string; targetExam: string;
  branch: { id: string; name: string; code: string; city: string };
  course: { id: string; name: string } | null;
  currentBatch: { id: string; name: string; code: string } | null;
}

interface Overview {
  student: Child;
  attendance: { percent: number | null; records: number; countable: number };
  tests: { published: number; averagePercentage: number | null };
  fees: { outstandingMinor: number };
  homework: { dueSoon: number };
}

interface ResultRow {
  id: string; score: number; maxScore: number; percentage: number; submittedAt: string | null;
  correctCount: number; wrongCount: number; unattemptedCount: number;
  batchRank: number | null; branchRank: number | null; organizationRank: number | null; percentile: number | null;
  test: { id: string; title: string; code: string; totalMarks: number };
}

interface FeeRow {
  id: string; status: StudentFeeStatus; netMinor: number; paidMinor: number; outstandingMinor: number; discountMinor: number;
  feeStructure: { id: string; name: string };
  installments: { id: string; label: string; amountMinor: number; paidMinor: number; dueDate: string; status: InstallmentStatus }[];
  payments: { id: string; receiptNumber: string; amountMinor: number; method: string; paidAt: string }[];
}

interface HomeworkRow {
  id: string; status: SubmissionStatus; marksAwarded: number | null; feedback: string | null;
  homework: {
    id: string; title: string; instructions: string; dueAt: string; maxMarks: number | null; attachmentUrl: string | null;
    subject: { id: string; name: string; code: string } | null;
  };
}

interface MaterialRow {
  id: string; title: string; description: string | null; fileUrl: string; createdAt: string;
  subject: { id: string; name: string; code: string } | null;
}

interface AnnouncementRow {
  id: string; title: string; body: string; publishedAt: string | null; pinnedUntil: string | null;
}

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'results', label: 'Results' },
  { value: 'homework', label: 'Homework' },
  { value: 'fees', label: 'Fees' },
  { value: 'materials', label: 'Materials' },
];

/** Spec §65 — one child at a time, chosen with the switcher. */
export default function PortalPage() {
  const { user } = useSession();
  const [childId, setChildId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState('overview');

  const children = useQuery<Child[]>('/portal/children');

  React.useEffect(() => {
    if (!childId && children.data?.length) setChildId(children.data[0].id);
  }, [children.data, childId]);

  if (children.error) {
    return <ErrorState title="Couldn't load your account" description={children.error.message} onRetry={children.reload} />;
  }
  if (children.loading || !children.data) {
    return <div className="flex flex-col gap-3.5"><Skeleton className="h-20 rounded-lg" /><Skeleton className="h-64 rounded-lg" /></div>;
  }
  if (children.data.length === 0) {
    return (
      <EmptyState
        title="No student linked yet"
        description="Your account is not linked to a student. Contact your branch office."
      />
    );
  }

  const child = children.data.find((c) => c.id === childId) ?? children.data[0];
  const isParent = user?.role === 'PARENT';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h1 className="text-h2 text-fg">{isParent ? `Hello, ${user?.name?.split(' ')[0]}` : 'Your progress'}</h1>

        {/* Spec §65 child switching — siblings may sit at different branches. */}
        {children.data.length > 1 && (
          <Segmented
            options={children.data.map((c) => ({ value: c.id, label: c.name.split(' ')[0] }))}
            value={child.id}
            onChange={(v) => { setChildId(v); setTab('overview'); }}
            aria-label="Choose a child"
          />
        )}

        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-h3 text-fg">{child.name}</span>
              <span className="truncate text-caption text-fg-muted">
                <span className="font-mono">{child.studentCode}</span> · {child.branch.name}
                {child.currentBatch && ` · ${child.currentBatch.name}`}
              </span>
            </div>
            <Badge variant="neutral">{child.targetExam.replace(/_/g, ' ')}</Badge>
          </CardContent>
        </Card>
      </div>

      <Segmented options={TABS} value={tab} onChange={setTab} aria-label="Section" />

      {tab === 'overview' && <OverviewTab studentId={child.id} />}
      {tab === 'attendance' && <AttendanceTab studentId={child.id} />}
      {tab === 'results' && <ResultsTab studentId={child.id} />}
      {tab === 'homework' && <HomeworkTab studentId={child.id} />}
      {tab === 'fees' && <FeesTab studentId={child.id} />}
      {tab === 'materials' && <MaterialsTab studentId={child.id} />}
    </div>
  );
}

function OverviewTab({ studentId }: { studentId: string }) {
  const { data, loading, error, reload } = useQuery<Overview>(`/portal/students/${studentId}`, {}, [studentId]);
  const news = useQuery<AnnouncementRow[]>(`/portal/students/${studentId}/announcements`, {}, [studentId]);

  if (error) return <ErrorState title="Couldn't load this" description={error.message} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-48 rounded-lg" />;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Attendance"
          value={data.attendance.percent === null ? '—' : percent(data.attendance.percent)}
          description={data.attendance.percent === null ? 'nothing counted yet' : 'last 30 days'}
        />
        <MetricCard
          title="Average score"
          value={data.tests.averagePercentage === null ? '—' : percent(data.tests.averagePercentage)}
          description={`${data.tests.published} published test${data.tests.published === 1 ? '' : 's'}`}
        />
        <MetricCard title="Homework due" value={String(data.homework.dueSoon)} description="not yet submitted" invertDelta />
        <MetricCard
          title="Fees outstanding"
          value={data.fees.outstandingMinor > 0 ? formatMinor(data.fees.outstandingMinor) : 'Settled'}
          description={data.fees.outstandingMinor > 0 ? 'still payable' : 'nothing owing'}
          invertDelta
        />
      </div>

      <Card>
        <CardHeader><CardTitle>Notices</CardTitle></CardHeader>
        <CardContent>
          {news.loading ? (
            <Skeleton className="h-20 rounded-lg" />
          ) : !news.data?.length ? (
            <p className="text-body-sm text-fg-muted">Nothing announced yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {news.data.slice(0, 8).map((a) => (
                <li key={a.id} className="border-b border-border pb-3 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-body-sm font-medium text-fg">{a.title}</span>
                    <span className="shrink-0 text-caption text-fg-muted">{a.publishedAt?.slice(0, 10) ?? ''}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-body-sm text-fg-secondary">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AttendanceTab({ studentId }: { studentId: string }) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const { data, loading, error, reload } = useQuery<{
    overall: { percent: number | null; records: number; countable: number; counts: Record<string, number> };
    records: { id: string; status: string; date: string; session: { subject: { name: string; code: string } } | null }[];
  }>(`/portal/students/${studentId}/attendance`, { query: { from, to } }, [studentId]);

  if (error) return <ErrorState title="Couldn't load attendance" description={error.message} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-48 rounded-lg" />;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Attendance"
          value={data.overall.percent === null ? '—' : percent(data.overall.percent)}
          description="last 90 days"
        />
        <MetricCard title="Present" value={String(data.overall.counts.PRESENT ?? 0)} description={`${data.overall.counts.LATE ?? 0} late`} />
        <MetricCard title="Absent" value={String(data.overall.counts.ABSENT ?? 0)} description="unexcused" invertDelta />
        <MetricCard title="Excused" value={String(data.overall.counts.EXCUSED ?? 0)} description="approved leave, not counted" />
      </div>

      <Card>
        <CardHeader><CardTitle>Recent classes</CardTitle></CardHeader>
        <CardContent>
          {data.records.length === 0 ? (
            <p className="text-body-sm text-fg-muted">No attendance recorded in this period.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.records.slice(0, 40).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body-sm text-fg">{r.session?.subject.name ?? 'Class'}</span>
                    <span className="text-caption text-fg-muted">{r.date.slice(0, 10)}</span>
                  </span>
                  <Badge variant={r.status === 'PRESENT' ? 'success' : r.status === 'ABSENT' ? 'error' : 'warning'}>
                    {r.status.replace(/_/g, ' ').toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResultsTab({ studentId }: { studentId: string }) {
  const { data, loading, error, reload } = useQuery<ResultRow[]>(`/portal/students/${studentId}/results`, {}, [studentId]);

  if (error) return <ErrorState title="Couldn't load results" description={error.message} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-48 rounded-lg" />;
  if (!data.length) {
    return (
      <Card><CardContent>
        <EmptyState title="No results yet" description="Results appear here once a test has been marked and published." />
      </CardContent></Card>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {data.map((r) => (
        <Card key={r.id}>
          <CardHeader>
            <CardTitle>{r.test.title}</CardTitle>
            <span className="text-caption text-fg-muted">
              <span className="font-mono">{r.test.code}</span>
              {r.submittedAt && ` · ${r.submittedAt.slice(0, 10)}`}
            </span>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-h1 tabular-nums text-fg">{r.score}<span className="text-h3 text-fg-muted"> / {r.maxScore}</span></span>
              <span className="font-mono text-h3 tabular-nums text-fg-secondary">{percent(r.percentage)}</span>
            </div>
            <Progress value={r.percentage} max={100} aria-label={`${r.test.title} score`} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Correct" value={String(r.correctCount)} />
              <Stat label="Wrong" value={String(r.wrongCount)} />
              <Stat label="Skipped" value={String(r.unattemptedCount)} />
              <Stat label="Percentile" value={r.percentile === null ? '—' : `${r.percentile.toFixed(1)}%`} />
            </div>
            <div className="flex flex-wrap gap-4 border-t border-border pt-3 text-caption text-fg-muted">
              <span>Batch rank <span className="font-mono text-fg-secondary">{r.batchRank ?? '—'}</span></span>
              <span>Branch rank <span className="font-mono text-fg-secondary">{r.branchRank ?? '—'}</span></span>
              <span>Overall rank <span className="font-mono text-fg-secondary">{r.organizationRank ?? '—'}</span></span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function HomeworkTab({ studentId }: { studentId: string }) {
  const { data, loading, error, reload } = useQuery<HomeworkRow[]>(`/portal/students/${studentId}/homework`, {}, [studentId]);

  if (error) return <ErrorState title="Couldn't load homework" description={error.message} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-48 rounded-lg" />;
  if (!data.length) {
    return <Card><CardContent><EmptyState title="No homework yet" description="Assignments appear here once they are published." /></CardContent></Card>;
  }

  return (
    <div className="flex flex-col gap-3.5">
      {data.map((h) => (
        <Card key={h.id}>
          <CardHeader>
            <CardTitle>{h.homework.title}</CardTitle>
            <span className="text-caption text-fg-muted">
              {h.homework.subject?.name ?? 'General'} · due {h.homework.dueAt.slice(0, 10)}
            </span>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="whitespace-pre-wrap text-body-sm text-fg-secondary">{h.homework.instructions}</p>
            {h.homework.attachmentUrl && (
              <a href={h.homework.attachmentUrl} target="_blank" rel="noreferrer" className="text-body-sm text-primary hover:underline">
                Open attachment ↗
              </a>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <Badge variant={h.status === 'SUBMITTED' ? 'success' : h.status === 'LATE' ? 'warning' : 'neutral'}>
                {SUBMISSION_STATUS_LABEL[h.status]}
              </Badge>
              {h.marksAwarded !== null && (
                <span className="font-mono text-body-sm tabular-nums text-fg">
                  {h.marksAwarded}{h.homework.maxMarks ? ` / ${h.homework.maxMarks}` : ''}
                </span>
              )}
            </div>
            {h.feedback && <Alert tone="info" title="Teacher's feedback">{h.feedback}</Alert>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FeesTab({ studentId }: { studentId: string }) {
  const { data, loading, error, reload } = useQuery<FeeRow[]>(`/portal/students/${studentId}/fees`, {}, [studentId]);

  if (error) return <ErrorState title="Couldn't load fees" description={error.message} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-48 rounded-lg" />;
  if (!data.length) {
    return <Card><CardContent><EmptyState title="No fees assigned" description="Nothing has been billed to this account." /></CardContent></Card>;
  }

  return (
    <div className="flex flex-col gap-3.5">
      {data.map((f) => (
        <Card key={f.id}>
          <CardHeader>
            <CardTitle>{f.feeStructure.name}</CardTitle>
            <span className="text-caption text-fg-muted">{STUDENT_FEE_STATUS_LABEL[f.status]}</span>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="text-body-sm text-fg-secondary">Outstanding</span>
              <span className={`font-mono text-h2 tabular-nums ${f.outstandingMinor > 0 ? 'text-warning' : 'text-success'}`}>
                {f.outstandingMinor > 0 ? formatMinor(f.outstandingMinor) : 'Settled'}
              </span>
            </div>
            <Progress value={f.paidMinor} max={Math.max(f.netMinor, 1)} tone={f.outstandingMinor > 0 ? 'primary' : 'success'} aria-label="Fee paid" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Payable" value={formatMinor(f.netMinor)} />
              <Stat label="Paid" value={formatMinor(f.paidMinor)} />
              {f.discountMinor > 0 && <Stat label="Concession" value={`−${formatMinor(f.discountMinor)}`} />}
            </div>

            {f.installments.length > 0 && (
              <div className="border-t border-border pt-3">
                <span className="text-caption text-fg-muted">Schedule</span>
                <ul className="mt-2 flex flex-col gap-2">
                  {f.installments.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-body-sm text-fg">{i.label}</span>
                        <span className="text-caption text-fg-muted">due {i.dueDate.slice(0, 10)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2.5">
                        <span className="font-mono text-body-sm tabular-nums text-fg-secondary">{formatMinor(i.amountMinor)}</span>
                        <Badge variant={i.status === 'PAID' ? 'success' : 'warning'}>{INSTALLMENT_STATUS_LABEL[i.status]}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {f.payments.length > 0 && (
              <div className="border-t border-border pt-3">
                <span className="text-caption text-fg-muted">Receipts</span>
                <ul className="mt-2 flex flex-col gap-2">
                  {f.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-mono text-body-sm text-fg">{p.receiptNumber}</span>
                        <span className="text-caption text-fg-muted">{p.paidAt.slice(0, 10)} · {p.method.replace(/_/g, ' ').toLowerCase()}</span>
                      </span>
                      <span className="font-mono text-body-sm tabular-nums text-fg">{formatMinor(p.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MaterialsTab({ studentId }: { studentId: string }) {
  const { data, loading, error, reload } = useQuery<MaterialRow[]>(`/portal/students/${studentId}/materials`, {}, [studentId]);

  if (error) return <ErrorState title="Couldn't load materials" description={error.message} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-48 rounded-lg" />;
  if (!data.length) {
    return <Card><CardContent><EmptyState title="No materials yet" description="Notes and resources shared with this student appear here." /></CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader><CardTitle>Study materials</CardTitle></CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2.5">
          {data.map((m) => (
            <li key={m.id} className="border-b border-border pb-2.5 last:border-0">
              <a href={m.fileUrl} target="_blank" rel="noreferrer" className="flex min-w-0 flex-col hover:text-primary">
                <span className="truncate text-body-sm font-medium text-fg">{m.title}</span>
                <span className="truncate text-caption text-fg-muted">
                  {m.subject?.name ?? 'General'} · {m.createdAt.slice(0, 10)}
                </span>
              </a>
              {m.description && <p className="mt-1 text-caption text-fg-secondary">{m.description}</p>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption text-fg-muted">{label}</span>
      <span className="font-mono text-body tabular-nums text-fg">{value}</span>
    </div>
  );
}
