'use client';

import * as React from 'react';
import {
  Alert, Badge, Button, ConfirmDialog, DataTable, Dropdown, EmptyState, ErrorState, PageHeader,
  SearchInput, Segmented, Textarea, useToast, type Column,
} from '@acadia/ui';
import { LEAVE_STATUS_LABEL, type LeaveStatus } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { RequestLeaveDrawer } from '@/components/request-leave-drawer';

interface LeaveRow {
  id: string; subjectType: 'STUDENT' | 'FACULTY'; status: LeaveStatus;
  fromDate: string; toDate: string; reason: string; days: number;
  reviewNote: string | null;
  person: { id: string; name: string; studentCode?: string } | null;
  reviewedBy: { id: string; name: string } | null;
  branch: { id: string; name: string; code: string };
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

const VARIANT: Record<LeaveStatus, 'warning' | 'success' | 'error' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'neutral',
};

/** Spec §48 — leave requests and branch-level approval. */
export default function LeavePage() {
  const { user, activeBranch } = useSession();
  const { toast } = useToast();
  const [status, setStatus] = React.useState('PENDING');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [requesting, setRequesting] = React.useState(false);
  const [review, setReview] = React.useState<{ row: LeaveRow; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const debounced = useDebounced(search);

  const canApprove = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN'].includes(user?.role ?? '');

  React.useEffect(() => { setPage(1); }, [debounced, status]);
  React.useEffect(() => { setNote(''); }, [review]);

  const { data, error, loading, reload } = useQuery<Page<LeaveRow>>('/leave', {
    query: { page, pageSize: 25, search: debounced || undefined, status: status === 'all' ? undefined : status },
  });

  async function submitReview() {
    if (!review) return;
    setBusy(true);
    try {
      await api(`/leave/${review.row.id}/review`, {
        method: 'POST',
        body: { status: review.decision, reviewNote: note.trim() || undefined },
      });
      toast({
        kind: 'success',
        title: review.decision === 'APPROVED' ? 'Leave approved' : 'Leave rejected',
        description:
          review.decision === 'APPROVED'
            ? 'Absences already recorded across these dates were changed to excused.'
            : `${review.row.person?.name}'s request was rejected.`,
      });
      setReview(null);
      reload();
    } catch (err) {
      toast({
        kind: 'error',
        title: 'Could not record the decision',
        description: err instanceof ApiError ? err.message : 'Something went wrong.',
      });
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<LeaveRow>[] = [
    {
      key: 'person',
      header: 'Who',
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{r.person?.name ?? 'Unknown'}</span>
          <span className="truncate text-caption text-fg-muted">
            {r.subjectType === 'STUDENT' ? 'Student' : 'Faculty'}
            {r.person?.studentCode && ` · ${r.person.studentCode}`}
          </span>
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      mobile: 'secondary',
      cell: (r) => (
        <span className="text-fg-secondary">
          {r.fromDate.slice(0, 10)} → {r.toDate.slice(0, 10)}
          <span className="text-fg-muted"> · {r.days}d</span>
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      cell: (r) => <span className="line-clamp-1 text-fg-secondary">{r.reason}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'secondary',
      cell: (r) => <Badge variant={VARIANT[r.status]}>{LEAVE_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'branch',
      header: 'Branch',
      mobile: 'meta',
      cell: (r) => <span className="font-mono text-fg-secondary">{r.branch.code}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Operations' }, { label: 'Leave' }]}
        title="Leave"
        description={
          activeBranch ? `Student and faculty leave at ${activeBranch.name}.` : 'Leave across the branches you can access.'
        }
        actions={<Button onClick={() => setRequesting(true)}>New request</Button>}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {error ? (
          <ErrorState title="Couldn't load leave requests" description={error.message} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            getRowId={(r) => r.id}
            loading={loading}
            toolbar={
              <div className="flex w-full flex-wrap items-center gap-2.5">
                <div className="w-full max-w-[260px]">
                  <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or reason…" />
                </div>
                <Segmented
                  options={[
                    { value: 'PENDING', label: 'Pending' },
                    { value: 'APPROVED', label: 'Approved' },
                    { value: 'REJECTED', label: 'Rejected' },
                    { value: 'all', label: 'All' },
                  ]}
                  value={status}
                  onChange={setStatus}
                  size="sm"
                  aria-label="Filter by status"
                />
              </div>
            }
            rowActions={(row) =>
              row.status === 'PENDING' && canApprove ? (
                <Dropdown
                  heading={row.person?.name ?? 'Request'}
                  trigger={<Button size="sm" variant="ghost" iconOnly aria-label={`Review ${row.person?.name}`}>⋯</Button>}
                  items={[
                    { label: 'Approve', onSelect: () => setReview({ row, decision: 'APPROVED' }) },
                    { label: 'Reject', destructive: true, onSelect: () => setReview({ row, decision: 'REJECTED' }) },
                  ]}
                />
              ) : undefined
            }
            empty={
              <EmptyState
                title={status === 'PENDING' ? 'Nothing awaiting approval' : 'No leave requests'}
                description={
                  status === 'PENDING'
                    ? 'Requests needing a decision will appear here.'
                    : 'Log a request to get started.'
                }
              />
            }
            pagination={
              data
                ? { page: data.meta.page, pageCount: data.meta.pageCount, onChange: setPage, summary: `${data.meta.total} request${data.meta.total === 1 ? '' : 's'}` }
                : undefined
            }
          />
        )}
      </div>

      <RequestLeaveDrawer open={requesting} onClose={() => setRequesting(false)} onDone={() => { setRequesting(false); reload(); }} />

      <ConfirmDialog
        open={review !== null}
        destructive={review?.decision === 'REJECTED'}
        loading={busy}
        onClose={() => setReview(null)}
        onConfirm={submitReview}
        title={review?.decision === 'APPROVED' ? `Approve leave for ${review.row.person?.name}?` : `Reject ${review?.row.person?.name}'s request?`}
        confirmLabel={review?.decision === 'APPROVED' ? 'Approve' : 'Reject'}
        confirmDisabled={review?.decision === 'REJECTED' && note.trim().length < 4}
        description={
          review?.decision === 'APPROVED'
            ? `${review.row.fromDate.slice(0, 10)} to ${review.row.toDate.slice(0, 10)}. Absences already recorded in this range become excused, so they stop counting against attendance.`
            : 'A reason is required and is shown to the requester.'
        }
      >
        {review?.decision === 'REJECTED' && (
          <Textarea
            label="Reason"
            required
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Exam week — leave cannot be granted."
          />
        )}
      </ConfirmDialog>
    </>
  );
}
