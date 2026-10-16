'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Dropdown,
  EmptyState, ErrorState, MetricCard, PageHeader, percent, Progress, Skeleton, StatusBadge, Tabs, useToast,
} from '@acadia/ui';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { EnrolStudentsDrawer } from '@/components/enrol-students-drawer';
import { AssignFacultyDrawer } from '@/components/assign-faculty-drawer';
import { CreateBatchDrawer } from '@/components/create-batch-drawer';
import { InsightsPanel } from '@/components/insights-panel';

interface BatchDetail {
  id: string; name: string; code: string; status: string; room: string | null;
  capacity: number; enrolled: number; seatsLeft: number; full: boolean; fillRate: number;
  startDate: string | null; endDate: string | null;
  branch: { id: string; name: string; code: string; city: string };
  course: { id: string; name: string; targetExam: string };
  academicYear: { id: string; name: string };
  faculty: {
    id: string; isClassTeacher: boolean;
    faculty: { id: string; name: string; email: string };
    subject: { id: string; name: string; code: string };
  }[];
}

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'students', label: 'Students' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'performance', label: 'Performance' },
];

interface BatchPerformance {
  summary: { studentsEnrolled: number; studentsWithAttempts: number; testsRecorded: number; averagePercentage: number };
  topPerformers: { student: { id: string; name: string; studentCode: string }; averagePercentage: number; attemptsCount: number }[];
  subjects: { subject: { id: string; name: string; code: string }; correct: number; wrong: number; accuracy: number | null }[];
}

export default function BatchDetailPage() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useSession();

  const [tab, setTab] = React.useState('overview');
  const [enrolling, setEnrolling] = React.useState(false);
  const [assigning, setAssigning] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [confirm, setConfirm] = React.useState<{ status: string; label: string; destructive: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const { data: batch, error, loading, reload } = useQuery<BatchDetail>(`/batches/${id}`);
  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN'].includes(user?.role ?? '');

  async function changeStatus(status: string) {
    setBusy(true);
    try {
      await api(`/batches/${id}/status`, { method: 'POST', body: { status } });
      toast({ kind: 'success', title: 'Batch updated', description: `${batch?.name} is now ${status.toLowerCase()}.` });
      setConfirm(null);
      reload();
    } catch (err) {
      toast({
        kind: 'error',
        title: 'Could not update the batch',
        description: err instanceof ApiError ? err.message : 'Something went wrong.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="px-5 py-5 lg:px-6">
        <ErrorState
          kind={error instanceof ApiError && error.status === 403 ? 'forbidden' : 'not-found'}
          description={error.message}
          action={<Button variant="outline" onClick={() => router.push('/batches')}>Back to batches</Button>}
        />
      </div>
    );
  }

  if (loading || !batch) {
    return (
      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        onBack={() => router.push('/batches')}
        breadcrumbs={[{ label: 'Academic' }, { label: 'Batches', href: '/batches' }, { label: batch.name }]}
        title={batch.name}
        description={`${batch.code} · ${batch.course.name} · ${batch.branch.name} · ${batch.academicYear.name}`}
        actions={
          <>
            <StatusBadge status={batch.status} />
            {canManage && batch.status !== 'ARCHIVED' && (
              <>
                <Button variant="outline" onClick={() => setEnrolling(true)} disabled={batch.full}>
                  {batch.full ? 'Batch full' : 'Enrol students'}
                </Button>
                <Dropdown
                  heading={batch.name}
                  trigger={<Button variant="outline">Actions</Button>}
                  items={[
                    { label: 'Edit batch', onSelect: () => setEditing(true) },
                    { label: 'Assign faculty', onSelect: () => setAssigning(true) },
                    ...(batch.status === 'PLANNED'
                      ? [{ label: 'Start batch', onSelect: () => setConfirm({ status: 'ACTIVE', label: 'Start', destructive: false }) }]
                      : batch.status === 'ACTIVE'
                        ? [{ label: 'Mark completed', onSelect: () => setConfirm({ status: 'COMPLETED', label: 'Complete', destructive: false }) }]
                        : []),
                    'separator',
                    { label: 'Cancel batch', destructive: true, onSelect: () => setConfirm({ status: 'CANCELLED', label: 'Cancel', destructive: true }) },
                  ]}
                />
              </>
            )}
          </>
        }
        tabs={<Tabs value={tab} onChange={setTab} tabs={TABS} />}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {batch.full && batch.status !== 'ARCHIVED' && (
          <Alert tone="warning" title="This batch is full">
            All {batch.capacity} seats are taken. Raise the capacity or open another batch.
          </Alert>
        )}
        {batch.faculty.length === 0 && batch.status === 'ACTIVE' && (
          <Alert
            tone="warning"
            title="No faculty assigned"
            action={canManage ? <Button size="sm" onClick={() => setAssigning(true)}>Assign faculty</Button> : undefined}
          >
            Nobody is teaching this batch yet.
          </Alert>
        )}

        {tab === 'overview' && (
          <div className="grid gap-3.5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Batch details</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Code"><span className="font-mono">{batch.code}</span></Field>
                <Field label="Status"><StatusBadge status={batch.status} /></Field>
                <Field label="Course">{batch.course.name}</Field>
                <Field label="Academic year">{batch.academicYear.name}</Field>
                <Field label="Branch">{batch.branch.name}</Field>
                <Field label="Room">{batch.room ?? '—'}</Field>
                <Field label="Starts">{batch.startDate?.slice(0, 10) ?? '—'}</Field>
                <Field label="Ends">{batch.endDate?.slice(0, 10) ?? '—'}</Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Seats</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-h1 tabular-nums text-fg">{batch.enrolled}</span>
                  <span className="text-body-sm text-fg-muted">of {batch.capacity}</span>
                </div>
                <Progress
                  value={batch.enrolled}
                  max={batch.capacity}
                  tone={batch.full ? 'error' : batch.fillRate >= 80 ? 'warning' : 'primary'}
                  aria-label="Batch capacity"
                />
                <span className="text-caption text-fg-muted">
                  {batch.full ? 'No seats left' : `${batch.seatsLeft} seat${batch.seatsLeft === 1 ? '' : 's'} available`}
                </span>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'students' && <StudentsTab batchId={batch.id} canManage={canManage} onChanged={reload} />}

        {tab === 'performance' && <PerformanceTab batchId={batch.id} />}

        {tab === 'faculty' && (
          <Card>
            <CardHeader>
              <CardTitle>Faculty</CardTitle>
              <span className="text-caption text-fg-muted">Who teaches which subject in this batch.</span>
            </CardHeader>
            <CardContent>
              {batch.faculty.length === 0 ? (
                <p className="text-body-sm text-fg-muted">No faculty assigned yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {batch.faculty.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-body-sm text-fg">{f.faculty.name}</span>
                        <span className="truncate text-caption text-fg-muted">{f.faculty.email}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {f.isClassTeacher && <Badge variant="primary">Class teacher</Badge>}
                        <Badge variant="neutral">{f.subject.name}</Badge>
                        {canManage && (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={async () => {
                              await api(`/batches/${batch.id}/faculty/${f.id}`, { method: 'DELETE' });
                              reload();
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <EnrolStudentsDrawer
        open={enrolling}
        batch={batch}
        onClose={() => setEnrolling(false)}
        onDone={() => { setEnrolling(false); reload(); }}
      />
      <CreateBatchDrawer
        open={editing}
        batch={batch}
        onClose={() => setEditing(false)}
        onCreated={() => { setEditing(false); reload(); }}
      />

      <AssignFacultyDrawer
        open={assigning}
        batch={batch}
        onClose={() => setAssigning(false)}
        onDone={() => { setAssigning(false); reload(); }}
      />

      <ConfirmDialog
        open={confirm !== null}
        destructive={confirm?.destructive}
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && changeStatus(confirm.status)}
        title={`${confirm?.label} ${batch.name}?`}
        description={
          confirm?.status === 'CANCELLED'
            ? `All ${batch.enrolled} enrolments end. The batch and its history are retained.`
            : confirm?.status === 'COMPLETED'
              ? `The ${batch.enrolled} current enrolments are marked completed.`
              : 'The batch becomes active and starts accepting day-to-day operations.'
        }
        confirmLabel={confirm?.label ?? 'Confirm'}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption text-fg-muted">{label}</span>
      <span className="text-body-sm text-fg">{children}</span>
    </div>
  );
}

/** Spec §55 — batch-level test performance: average, top performers, subject accuracy. */
function PerformanceTab({ batchId }: { batchId: string }) {
  const { data, loading, error, reload } = useQuery<BatchPerformance>(`/analytics/batches/${batchId}`);

  if (error) return <ErrorState title="Couldn't load performance" description={error.message} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-64 rounded-lg" />;

  if (data.summary.testsRecorded === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState title="No tests yet" description="Performance appears here once this batch has sat at least one test." />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <InsightsPanel path={`/insights/batches/${batchId}`} title="Batch insights" />

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Tests recorded" value={String(data.summary.testsRecorded)} description="sat by this batch" />
        <MetricCard title="Average score" value={percent(data.summary.averagePercentage)} description="across every attempt" />
        <MetricCard
          title="Students scored"
          value={String(data.summary.studentsWithAttempts)}
          description={`of ${data.summary.studentsEnrolled} enrolled`}
        />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Top performers</CardTitle></CardHeader>
          <CardContent>
            {data.topPerformers.length === 0 ? (
              <p className="text-body-sm text-fg-muted">Nobody has a scored attempt yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.topPerformers.map((p, i) => (
                  <li key={p.student.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                    <Link href={`/students/view?id=${p.student.id}`} className="flex min-w-0 items-center gap-2.5 hover:text-primary">
                      <span className="font-mono text-caption text-fg-muted">{i + 1}</span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-body-sm text-fg">{p.student.name}</span>
                        <span className="truncate text-caption text-fg-muted">
                          <span className="font-mono">{p.student.studentCode}</span> · {p.attemptsCount} test{p.attemptsCount === 1 ? '' : 's'}
                        </span>
                      </span>
                    </Link>
                    <span className="shrink-0 font-mono tabular-nums text-fg-secondary">{percent(p.averagePercentage)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Accuracy by subject</CardTitle></CardHeader>
          <CardContent>
            {data.subjects.length === 0 ? (
              <p className="text-body-sm text-fg-muted">No scored answers yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {data.subjects.map((s) => (
                  <li key={s.subject.id} className="flex items-center justify-between gap-3 border-b border-border pb-2.5 last:border-0">
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
      </div>
    </div>
  );
}

function StudentsTab({ batchId, canManage, onChanged }: { batchId: string; canManage: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const { data, loading, reload } = useQuery<{
    data: { id: string; studentCode: string; name: string; phone: string | null; status: string; joinedAt: string }[];
    meta: { total: number };
  }>(`/batches/${batchId}/students`, { query: { pageSize: 100 } });

  if (loading) return <Skeleton className="h-40 rounded-lg" />;

  async function release(studentId: string, name: string) {
    try {
      await api(`/batches/${batchId}/students/${studentId}`, { method: 'DELETE' });
      toast({ kind: 'success', title: 'Removed from batch', description: `${name} is no longer in this batch.` });
      reload();
      onChanged();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not remove', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enrolled students</CardTitle>
        <span className="text-caption text-fg-muted">{data?.meta.total ?? 0} currently enrolled.</span>
      </CardHeader>
      <CardContent>
        {(data?.data ?? []).length === 0 ? (
          <p className="text-body-sm text-fg-muted">Nobody is enrolled in this batch yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(data?.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                <Link href={`/students/view?id=${s.id}`} className="flex min-w-0 flex-col hover:text-primary">
                  <span className="truncate text-body-sm text-fg">{s.name}</span>
                  <span className="truncate text-caption text-fg-muted">
                    <span className="font-mono">{s.studentCode}</span>
                    {s.phone && ` · ${s.phone}`} · joined {s.joinedAt.slice(0, 10)}
                  </span>
                </Link>
                {canManage && (
                  <Button size="xs" variant="ghost" onClick={() => release(s.id, s.name)}>Remove</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
