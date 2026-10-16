'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Dropdown,
  EmptyState, ErrorState, MetricCard, PageHeader, percent, Skeleton, StatusBadge, Tabs, useToast,
} from '@acadia/ui';
import { TARGET_EXAM_LABEL, GENDER_LABEL, type Gender, type TargetExam } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { TransferStudentDrawer } from '@/components/transfer-student-drawer';
import { InviteGuardianDrawer } from '@/components/invite-guardian-drawer';
import { AddStudentDrawer } from '@/components/add-student-drawer';
import { InsightsPanel } from '@/components/insights-panel';

interface StudentDetail {
  id: string; studentCode: string; name: string; status: string;
  photoUrl: string | null; dateOfBirth: string | null; gender: Gender;
  phone: string | null; email: string | null;
  parentName: string | null; parentPhone: string | null; parentEmail: string | null; parentRelation: string | null;
  previousSchool: string | null; previousClass: string | null; previousMarks: string | null;
  targetExam: TargetExam; admissionDate: string;
  addressLine: string | null; city: string | null; state: string | null; pincode: string | null;
  branch: { id: string; name: string; code: string; city: string };
  course: { id: string; name: string } | null;
  currentBatch: { id: string; name: string; code: string } | null;
  batches: { id: string; status: string; joinedAt: string; leftAt: string | null; batch: { id: string; name: string; code: string; branch: { name: string } } }[];
  branchHistory: { id: string; fromDate: string; toDate: string | null; reason: string | null; branch: { id: string; name: string; code: string } }[];
  enquiry: { id: string; enquiryCode: string; source: string; admittedAt: string | null } | null;
}

interface StudentPerformance {
  summary: { attemptsCount: number; averagePercentage: number; bestPercentage: number | null; latestPercentage: number | null; trend: number | null };
  timeline: {
    testId: string; title: string; code: string; date: string; score: number; maxScore: number; percentage: number;
    correctCount: number; wrongCount: number; unattemptedCount: number;
    batchRank: number | null; branchRank: number | null; organizationRank: number | null; percentile: number | null;
  }[];
  subjects: { subject: { id: string; name: string; code: string }; correct: number; wrong: number; accuracy: number | null }[];
}

/**
 * Spec §39 lists many tabs. Only those whose data exists today are shown —
 * Fees and the rest appear as their phases land, rather than as empty shells
 * that imply the feature is broken.
 */
interface GuardianRow {
  id: string; relation: string; isPrimary: boolean; status: 'active' | 'invited' | 'inactive';
  user: { id: string; name: string; email: string; phone: string | null; lastLoginAt: string | null };
}

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'academic', label: 'Academic' },
  { value: 'batches', label: 'Batches' },
  { value: 'performance', label: 'Performance' },
  { value: 'guardians', label: 'Guardians' },
  { value: 'branch', label: 'Branch history' },
];

export default function StudentDetailPage() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useSession();

  const [tab, setTab] = React.useState('overview');
  const [transferring, setTransferring] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [confirm, setConfirm] = React.useState<{ status: string; label: string; destructive: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const { data: student, error, loading, reload } = useQuery<StudentDetail>(`/students/${id}`);
  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN'].includes(user?.role ?? '');

  async function changeStatus(status: string, reason: string) {
    setBusy(true);
    try {
      await api(`/students/${id}/status`, { method: 'POST', body: { status, reason } });
      toast({ kind: 'success', title: 'Student updated', description: `${student?.name} is now ${status.toLowerCase().replace(/_/g, ' ')}.` });
      setConfirm(null);
      reload();
    } catch (err) {
      toast({
        kind: 'error',
        title: 'Could not update the student',
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
          action={<Button variant="outline" onClick={() => router.push('/students')}>Back to students</Button>}
        />
      </div>
    );
  }

  if (loading || !student) {
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
        onBack={() => router.push('/students')}
        breadcrumbs={[{ label: 'Academic' }, { label: 'Students', href: '/students' }, { label: student.name }]}
        title={student.name}
        description={`${student.studentCode} · ${student.branch.name}${student.currentBatch ? ` · ${student.currentBatch.name}` : ''}`}
        actions={
          <>
            <StatusBadge status={student.status} />
            {canManage && student.status !== 'ARCHIVED' && (
              <Dropdown
                heading={student.name}
                trigger={<Button variant="outline">Actions</Button>}
                items={[
                  { label: 'Edit details', onSelect: () => setEditing(true) },
                  { label: 'Transfer branch', onSelect: () => setTransferring(true) },
                  ...(student.status === 'ACTIVE'
                    ? [{ label: 'Mark inactive', onSelect: () => setConfirm({ status: 'INACTIVE', label: 'Mark inactive', destructive: false }) }]
                    : [{ label: 'Reactivate', onSelect: () => setConfirm({ status: 'ACTIVE', label: 'Reactivate', destructive: false }) }]),
                  'separator',
                  { label: 'Mark dropped', destructive: true, onSelect: () => setConfirm({ status: 'DROPPED', label: 'Mark dropped', destructive: true }) },
                ]}
              />
            )}
          </>
        }
        tabs={<Tabs value={tab} onChange={setTab} tabs={TABS} />}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {!student.currentBatch && student.status === 'ACTIVE' && (
          <Alert tone="warning" title="Not in a batch">
            This student is admitted but has not been placed in a batch yet.
          </Alert>
        )}

        {tab === 'overview' && (
          <div className="grid gap-3.5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Student</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Student code"><span className="font-mono">{student.studentCode}</span></Field>
                <Field label="Status"><StatusBadge status={student.status} /></Field>
                <Field label="Date of birth">{student.dateOfBirth?.slice(0, 10) ?? '—'}</Field>
                <Field label="Gender">{GENDER_LABEL[student.gender] ?? student.gender}</Field>
                <Field label="Phone"><span className="font-mono">{student.phone ?? '—'}</span></Field>
                <Field label="Email">{student.email ?? '—'}</Field>
                <Field label="Admitted">{student.admissionDate.slice(0, 10)}</Field>
                <Field label="Address">
                  {[student.addressLine, student.city, student.state, student.pincode].filter(Boolean).join(', ') || '—'}
                </Field>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3.5">
              <Card>
                <CardHeader><CardTitle>Parent / guardian</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Field label="Name">{student.parentName ?? '—'}</Field>
                  <Field label="Relation">{student.parentRelation ?? '—'}</Field>
                  <Field label="Phone"><span className="font-mono">{student.parentPhone ?? '—'}</span></Field>
                  <Field label="Email">{student.parentEmail ?? '—'}</Field>
                </CardContent>
              </Card>

              {student.enquiry && (
                <Card>
                  <CardHeader><CardTitle>Origin</CardTitle></CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <Field label="Enquiry">
                      <Link href={`/admissions?enquiry=${student.enquiry.id}`} className="font-mono text-primary hover:underline">
                        {student.enquiry.enquiryCode}
                      </Link>
                    </Field>
                    <Field label="Source">{student.enquiry.source.replace(/_/g, ' ').toLowerCase()}</Field>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {tab === 'academic' && (
          <div className="grid gap-3.5 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Programme</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Target exam">{TARGET_EXAM_LABEL[student.targetExam] ?? student.targetExam}</Field>
                <Field label="Course">{student.course?.name ?? '—'}</Field>
                <Field label="Current batch">
                  {student.currentBatch ? (
                    <Link href={`/batches/view?id=${student.currentBatch.id}`} className="text-primary hover:underline">
                      {student.currentBatch.name}
                    </Link>
                  ) : '—'}
                </Field>
                <Field label="Branch">{student.branch.name}</Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Previous schooling</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="School">{student.previousSchool ?? '—'}</Field>
                <Field label="Class">{student.previousClass ?? '—'}</Field>
                <Field label="Marks">{student.previousMarks ?? '—'}</Field>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'batches' && (
          <Card>
            <CardHeader>
              <CardTitle>Batch history</CardTitle>
              <span className="text-caption text-fg-muted">Enrolments are kept when a student moves, so past terms stay accurate.</span>
            </CardHeader>
            <CardContent>
              {student.batches.length === 0 ? (
                <p className="text-body-sm text-fg-muted">This student has never been in a batch.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {student.batches.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                      <span className="flex min-w-0 flex-col">
                        <Link href={`/batches/view?id=${b.batch.id}`} className="truncate text-body-sm text-fg hover:text-primary">
                          {b.batch.name}
                        </Link>
                        <span className="text-caption text-fg-muted">
                          <span className="font-mono">{b.batch.code}</span> · {b.batch.branch.name} · joined {b.joinedAt.slice(0, 10)}
                          {b.leftAt && ` · left ${b.leftAt.slice(0, 10)}`}
                        </span>
                      </span>
                      <StatusBadge status={b.status === 'ENROLLED' ? 'active' : b.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'performance' && <PerformanceTab studentId={student.id} />}

        {tab === 'guardians' && (
          <GuardiansTab studentId={student.id} studentName={student.name} canManage={canManage} />
        )}

        {tab === 'branch' && (
          <Card>
            <CardHeader>
              <CardTitle>Branch history</CardTitle>
              <span className="text-caption text-fg-muted">
                Historical records stay with the branch that held them at the time (spec §75).
              </span>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2.5">
                {student.branchHistory.map((h) => (
                  <li key={h.id} className="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-body-sm text-fg">{h.branch.name}</span>
                      {h.reason && <span className="truncate text-caption text-fg-muted">{h.reason}</span>}
                    </span>
                    <span className="shrink-0 text-caption text-fg-muted">
                      {h.fromDate.slice(0, 10)} → {h.toDate ? h.toDate.slice(0, 10) : 'current'}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <AddStudentDrawer
        open={editing}
        student={student}
        onClose={() => setEditing(false)}
        onCreated={() => { setEditing(false); reload(); }}
      />

      <TransferStudentDrawer
        open={transferring}
        student={student}
        onClose={() => setTransferring(false)}
        onDone={() => { setTransferring(false); reload(); }}
      />

      <ConfirmDialog
        open={confirm !== null}
        destructive={confirm?.destructive}
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && changeStatus(confirm.status, `${confirm.label} via ERP`)}
        title={`${confirm?.label} — ${student.name}?`}
        description={
          confirm?.status === 'ACTIVE'
            ? 'The student resumes as active. They will need to be placed in a batch again.'
            : 'Their batch enrolment ends and they stop counting toward your plan’s student limit. All history is retained.'
        }
        confirmLabel={confirm?.label ?? 'Confirm'}
      />
    </>
  );
}

/** Spec §65 — who can sign in to the portal and see this student. */
function GuardiansTab({ studentId, studentName, canManage }: { studentId: string; studentName: string; canManage: boolean }) {
  const { toast } = useToast();
  const [inviting, setInviting] = React.useState(false);
  const { data, loading, error, reload } = useQuery<GuardianRow[]>(`/students/${studentId}/guardians`);

  async function unlink(g: GuardianRow) {
    try {
      await api(`/students/${studentId}/guardians/${g.id}`, { method: 'DELETE' });
      toast({ kind: 'success', title: 'Guardian removed', description: `${g.user.name} can no longer see ${studentName}.` });
      reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not remove', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
  }

  if (error) return <ErrorState title="Couldn't load guardians" description={error.message} onRetry={reload} />;
  if (loading) return <Skeleton className="h-40 rounded-lg" />;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Portal access</CardTitle>
          <span className="text-caption text-fg-muted">
            A guardian sees this student&rsquo;s attendance, results, homework and fees — and no other student.
          </span>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!data?.length ? (
            <EmptyState
              title="No guardian linked"
              description="Invite a parent so they can follow this student's progress."
              action={canManage ? <Button onClick={() => setInviting(true)}>Invite a guardian</Button> : undefined}
            />
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {data.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-body-sm text-fg">
                        {g.user.name}
                        <span className="text-fg-muted"> · {g.relation}</span>
                      </span>
                      <span className="truncate text-caption text-fg-muted">
                        {g.user.email}
                        {g.user.lastLoginAt ? ` · last seen ${g.user.lastLoginAt.slice(0, 10)}` : ' · never signed in'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {g.isPrimary && <Badge variant="primary">Primary</Badge>}
                      <Badge variant={g.status === 'active' ? 'success' : g.status === 'invited' ? 'warning' : 'neutral'}>
                        {g.status}
                      </Badge>
                      {canManage && <Button size="xs" variant="ghost" onClick={() => unlink(g)}>Remove</Button>}
                    </span>
                  </li>
                ))}
              </ul>
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => setInviting(true)}>Invite another guardian</Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <InviteGuardianDrawer
        open={inviting}
        studentId={studentId}
        studentName={studentName}
        onClose={() => setInviting(false)}
        onInvited={() => { setInviting(false); reload(); }}
      />
    </>
  );
}

/** Spec §55 — one student's test performance: trend, subject accuracy, timeline. */
function PerformanceTab({ studentId }: { studentId: string }) {
  const { data, loading, error, reload } = useQuery<StudentPerformance>(`/analytics/students/${studentId}`);

  if (error) return <ErrorState title="Couldn't load performance" description={error.message} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-64 rounded-lg" />;

  if (data.summary.attemptsCount === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState title="No tests yet" description="Performance appears here once this student has sat at least one test." />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <InsightsPanel path={`/insights/students/${studentId}`} title="Student insights" />

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Tests taken" value={String(data.summary.attemptsCount)} description="submitted or auto-submitted" />
        <MetricCard title="Average score" value={percent(data.summary.averagePercentage)} description="across every attempt" />
        <MetricCard title="Best score" value={data.summary.bestPercentage === null ? '—' : percent(data.summary.bestPercentage)} description="personal best" />
        <MetricCard
          title="Trend"
          value={data.summary.trend === null ? '—' : `${data.summary.trend > 0 ? '+' : ''}${data.summary.trend.toFixed(1)} pts`}
          description={data.summary.trend === null ? 'need more attempts' : 'last 3 vs. earlier'}
        />
      </div>

      {data.subjects.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Accuracy by subject</CardTitle></CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Test history</CardTitle></CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2.5">
            {data.timeline.map((t) => (
              <li key={t.testId} className="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0">
                <Link href={`/tests/view?id=${t.testId}`} className="flex min-w-0 flex-col hover:text-primary">
                  <span className="truncate text-body-sm text-fg">{t.title}</span>
                  <span className="truncate text-caption text-fg-muted">
                    <span className="font-mono">{t.code}</span> · {t.date.slice(0, 10)} · {t.correctCount} correct / {t.wrongCount} wrong / {t.unattemptedCount} skipped
                  </span>
                </Link>
                <span className="shrink-0 text-right">
                  <span className="font-mono tabular-nums text-fg">{t.score} / {t.maxScore}</span>
                  <div className="font-mono text-caption text-fg-muted">
                    {t.organizationRank === null ? 'Rank pending' : `#${t.organizationRank} org · #${t.branchRank} branch`}
                  </div>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
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
