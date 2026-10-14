'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, DataTable, Dropdown,
  EmptyState, ErrorState, PageHeader, Skeleton, useToast, type Column,
} from '@acadia/ui';
import { HOMEWORK_AUDIENCE_LABEL, HOMEWORK_STATUS_LABEL, SUBMISSION_STATUS_LABEL, type HomeworkStatus, type SubmissionStatus } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { GradeSubmissionDrawer } from '@/components/grade-submission-drawer';

interface HomeworkDetail {
  id: string; title: string; instructions: string; status: HomeworkStatus; audience: string;
  dueAt: string; maxMarks: number | null; attachmentUrl: string | null;
  subject: { id: string; name: string; code: string } | null;
  batch: { id: string; name: string; code: string } | null;
  targets: { id: string; name: string; code: string }[];
  students: { id: string; name: string; studentCode: string }[];
  createdBy: { id: string; name: string };
  submissionCount: number;
}

interface SubmissionRow {
  id: string; status: SubmissionStatus; submittedAt: string | null; note: string | null;
  marksAwarded: number | null; feedback: string | null;
  student: { id: string; name: string; studentCode: string };
  branch: { id: string; name: string; code: string };
}

const STATUS_VARIANT: Record<HomeworkStatus, 'neutral' | 'info' | 'warning' | 'success' | 'error'> = {
  DRAFT: 'neutral', PUBLISHED: 'info', CLOSED: 'success',
};

const SUBMISSION_VARIANT: Record<SubmissionStatus, 'neutral' | 'warning' | 'success'> = {
  PENDING: 'neutral', SUBMITTED: 'success', LATE: 'warning',
};

const ALLOWED: Record<HomeworkStatus, HomeworkStatus[]> = { DRAFT: ['PUBLISHED'], PUBLISHED: ['CLOSED'], CLOSED: [] };
const ACTION_LABEL: Record<HomeworkStatus, string> = { DRAFT: 'Move to draft', PUBLISHED: 'Publish', CLOSED: 'Close' };

export default function HomeworkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useSession();

  const [confirm, setConfirm] = React.useState<HomeworkStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [grading, setGrading] = React.useState<SubmissionRow | null>(null);

  const { data: homework, error, loading, reload } = useQuery<HomeworkDetail>(`/homework/${id}`);
  const roster = useQuery<SubmissionRow[]>(homework?.submissionCount ? `/homework/${id}/roster` : null, {}, [homework?.submissionCount]);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY'].includes(user?.role ?? '');

  async function changeStatus(status: HomeworkStatus) {
    setBusy(true);
    try {
      await api(`/homework/${id}/status`, { method: 'POST', body: { status } });
      toast({ kind: 'success', title: 'Homework updated', description: `Now ${HOMEWORK_STATUS_LABEL[status].toLowerCase()}.` });
      setConfirm(null);
      reload();
      roster.reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not update', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  async function mark(submissionId: string, status: SubmissionStatus) {
    try {
      await api(`/homework-submissions/${submissionId}/mark`, { method: 'POST', body: { status } });
      roster.reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not update', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
  }

  if (error) {
    return (
      <div className="px-5 py-5 lg:px-6">
        <ErrorState
          kind={error instanceof ApiError && error.status === 403 ? 'forbidden' : 'not-found'}
          description={error.message}
          action={<Button variant="outline" onClick={() => router.push('/homework')}>Back to homework</Button>}
        />
      </div>
    );
  }

  if (loading || !homework) {
    return (
      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const columns: Column<SubmissionRow>[] = [
    {
      key: 'student',
      header: 'Student',
      mobile: 'primary',
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-body-sm text-fg">{r.student.name}</span>
          <span className="truncate text-caption text-fg-muted"><span className="font-mono">{r.student.studentCode}</span> · {r.branch.code}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'secondary',
      cell: (r) => <Badge variant={SUBMISSION_VARIANT[r.status]}>{SUBMISSION_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'marksAwarded',
      header: 'Marks',
      align: 'right',
      cell: (r) => <span className="font-mono tabular-nums text-fg-secondary">{r.marksAwarded ?? '—'}{homework.maxMarks ? ` / ${homework.maxMarks}` : ''}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        onBack={() => router.push('/homework')}
        breadcrumbs={[{ label: 'Learning' }, { label: 'Homework', href: '/homework' }, { label: homework.title }]}
        title={homework.title}
        description={`${HOMEWORK_AUDIENCE_LABEL[homework.audience as keyof typeof HOMEWORK_AUDIENCE_LABEL] ?? homework.audience} · due ${homework.dueAt.slice(0, 10)}`}
        actions={
          <>
            <Badge variant={STATUS_VARIANT[homework.status]}>{HOMEWORK_STATUS_LABEL[homework.status]}</Badge>
            {canManage && ALLOWED[homework.status].length > 0 && (
              <Dropdown
                heading={homework.title}
                trigger={<Button variant="outline">Actions</Button>}
                items={ALLOWED[homework.status].map((s) => ({ label: ACTION_LABEL[s], onSelect: () => setConfirm(s) }))}
              />
            )}
          </>
        }
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        <div className="grid gap-3.5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Instructions</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="whitespace-pre-wrap text-body-sm text-fg">{homework.instructions}</p>
              {homework.attachmentUrl && (
                <a href={homework.attachmentUrl} target="_blank" rel="noreferrer" className="text-body-sm text-primary hover:underline">
                  View attachment ↗
                </a>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Field label="Subject">{homework.subject?.name ?? '—'}</Field>
              <Field label="Max marks">{homework.maxMarks ?? '—'}</Field>
              <Field label="Created by">{homework.createdBy.name}</Field>
              <Field label="Reach">
                {homework.batch?.name ?? (homework.targets.map((t) => t.code).join(', ') || (homework.students.length ? `${homework.students.length} named students` : '—'))}
              </Field>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Roster</CardTitle>
            <span className="text-caption text-fg-muted">{homework.submissionCount} student{homework.submissionCount === 1 ? '' : 's'} reached.</span>
          </CardHeader>
          <CardContent>
            {homework.status === 'DRAFT' ? (
              <EmptyState title="Not published yet" description="Publish this homework to create the roster and start marking." />
            ) : roster.loading ? (
              <Skeleton className="h-48 rounded-lg" />
            ) : (
              <DataTable
                columns={columns}
                data={roster.data ?? []}
                getRowId={(r) => r.id}
                rowActions={
                  canManage
                    ? (row) => (
                        <Dropdown
                          heading={row.student.name}
                          trigger={<Button size="sm" variant="ghost" iconOnly aria-label="Submission actions">⋯</Button>}
                          items={[
                            ...(['PENDING', 'SUBMITTED', 'LATE'] as SubmissionStatus[])
                              .filter((s) => s !== row.status)
                              .map((s) => ({ label: `Mark ${SUBMISSION_STATUS_LABEL[s].toLowerCase()}`, onSelect: () => mark(row.id, s) })),
                            'separator',
                            { label: 'Grade…', onSelect: () => setGrading(row) },
                          ]}
                        />
                      )
                    : undefined
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      <GradeSubmissionDrawer
        open={grading !== null}
        submission={grading}
        maxMarks={homework.maxMarks}
        onClose={() => setGrading(null)}
        onSaved={() => { setGrading(null); roster.reload(); }}
      />

      <ConfirmDialog
        open={confirm !== null}
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && changeStatus(confirm)}
        title={confirm ? `${ACTION_LABEL[confirm]} this homework?` : ''}
        description={
          confirm === 'PUBLISHED'
            ? 'This locks who it reaches and creates the roster every reached student appears on.'
            : 'Closing just marks this as done — the roster and grading stay exactly as they are and can still be edited.'
        }
        confirmLabel={confirm ? ACTION_LABEL[confirm] : 'Confirm'}
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
