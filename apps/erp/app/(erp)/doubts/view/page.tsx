'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Combobox, Dropdown,
  ErrorState, PageHeader, Skeleton, Textarea, useToast,
} from '@acadia/ui';
import { DOUBT_STATUS_LABEL, type DoubtStatus } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface FacultyOption { id: string; name: string }

interface DoubtDetail {
  id: string; question: string; status: DoubtStatus; createdAt: string;
  student: { id: string; name: string; studentCode: string };
  subject: { id: string; name: string; code: string };
  batch: { id: string; name: string; code: string } | null;
  branch: { id: string; name: string; code: string };
  assignedTo: { id: string; name: string } | null;
  raisedBy: { id: string; name: string };
  messages: { id: string; body: string; createdAt: string; author: { id: string; name: string } }[];
}

const STATUS_VARIANT: Record<DoubtStatus, 'warning' | 'info' | 'success'> = {
  OPEN: 'warning', ANSWERED: 'info', CLOSED: 'success',
};

const ALLOWED: Record<DoubtStatus, DoubtStatus[]> = {
  OPEN: ['ANSWERED', 'CLOSED'],
  ANSWERED: ['OPEN', 'CLOSED'],
  CLOSED: [],
};
const ACTION_LABEL: Record<DoubtStatus, string> = { OPEN: 'Reopen', ANSWERED: 'Mark answered', CLOSED: 'Close' };

export default function DoubtDetailPage() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const { toast } = useToast();

  const [reply, setReply] = React.useState('');
  const [resolve, setResolve] = React.useState(true);
  const [assigning, setAssigning] = React.useState(false);
  const [assignedToId, setAssignedToId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const { data: doubt, error, loading, reload } = useQuery<DoubtDetail>(`/doubts/${id}`);
  const { data: facultyPage } = useQuery<{ data: FacultyOption[] }>(assigning ? '/staff' : null, { query: { pageSize: 200, role: 'FACULTY' } });

  React.useEffect(() => {
    if (doubt) setAssignedToId(doubt.assignedTo?.id ?? null);
  }, [doubt]);

  async function sendReply() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api(`/doubts/${id}/reply`, { method: 'POST', body: { body: reply.trim(), resolve } });
      setReply('');
      toast({ kind: 'success', title: resolve ? 'Reply sent — marked answered' : 'Reply sent' });
      reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not send reply', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: DoubtStatus) {
    setBusy(true);
    try {
      await api(`/doubts/${id}/status`, { method: 'POST', body: { status } });
      toast({ kind: 'success', title: 'Status updated', description: `Now ${DOUBT_STATUS_LABEL[status].toLowerCase()}.` });
      reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not update', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment() {
    setBusy(true);
    try {
      await api(`/doubts/${id}/assign`, { method: 'POST', body: { assignedToId } });
      toast({ kind: 'success', title: 'Doubt reassigned' });
      setAssigning(false);
      reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not reassign', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
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
          action={<Button variant="outline" onClick={() => router.push('/doubts')}>Back to doubts</Button>}
        />
      </div>
    );
  }

  if (loading || !doubt) {
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
        onBack={() => router.push('/doubts')}
        breadcrumbs={[{ label: 'Learning' }, { label: 'Doubts', href: '/doubts' }, { label: doubt.student.name }]}
        title={doubt.subject.name}
        description={`${doubt.student.name} · ${doubt.student.studentCode}${doubt.batch ? ` · ${doubt.batch.name}` : ''}`}
        actions={
          <>
            <Badge variant={STATUS_VARIANT[doubt.status]}>{DOUBT_STATUS_LABEL[doubt.status]}</Badge>
            {ALLOWED[doubt.status].length > 0 && (
              <Dropdown
                heading="Doubt"
                trigger={<Button variant="outline">Actions</Button>}
                items={[
                  { label: 'Reassign', onSelect: () => setAssigning(true) },
                  'separator',
                  ...ALLOWED[doubt.status].map((s) => ({ label: ACTION_LABEL[s], onSelect: () => changeStatus(s) })),
                ]}
              />
            )}
          </>
        }
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        <div className="grid gap-3.5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Question</CardTitle></CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-body-sm text-fg">{doubt.question}</p>
              <p className="mt-2 text-caption text-fg-muted">Logged by {doubt.raisedBy.name} on {doubt.createdAt.slice(0, 10)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Routing</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Field label="Branch">{doubt.branch.name}</Field>
              <Field label="Assigned to">{doubt.assignedTo?.name ?? 'Branch pool (unassigned)'}</Field>
            </CardContent>
          </Card>
        </div>

        {assigning && (
          <Card>
            <CardHeader><CardTitle>Reassign</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Combobox
                label="Faculty"
                placeholder="Leave blank for the branch pool"
                options={(facultyPage?.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
                value={assignedToId}
                onChange={setAssignedToId}
              />
              <div className="flex gap-2.5">
                <Button size="sm" onClick={saveAssignment} loading={busy}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => setAssigning(false)} disabled={busy}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Replies</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3.5">
            {doubt.messages.length === 0 ? (
              <p className="text-body-sm text-fg-muted">No replies yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {doubt.messages.map((m) => (
                  <li key={m.id} className="rounded-md border border-border bg-surface-secondary px-3.5 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm font-medium text-fg">{m.author.name}</span>
                      <span className="text-caption text-fg-muted">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-body-sm text-fg-secondary">{m.body}</p>
                  </li>
                ))}
              </ul>
            )}

            {doubt.status === 'CLOSED' ? (
              <Alert tone="info">This doubt is closed. Reopen it to add another reply.</Alert>
            ) : (
              <div className="flex flex-col gap-2.5 border-t border-border pt-3.5">
                <Textarea label="Reply" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write the answer…" />
                <div className="flex items-center justify-between">
                  <Checkbox label="Mark as answered" checked={resolve} onChange={(e) => setResolve(e.target.checked)} />
                  <Button size="sm" onClick={sendReply} loading={busy} disabled={!reply.trim()}>Send reply</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
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
