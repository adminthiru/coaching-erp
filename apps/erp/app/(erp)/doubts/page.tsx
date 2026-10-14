'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, DataTable, EmptyState, ErrorState, PageHeader, Segmented, type Column } from '@acadia/ui';
import { DOUBT_STATUS_LABEL, type DoubtStatus } from '@acadia/types';
import { useQuery } from '@/lib/hooks';
import { CreateDoubtDrawer } from '@/components/create-doubt-drawer';

interface DoubtRow {
  id: string; question: string; status: DoubtStatus; createdAt: string;
  student: { id: string; name: string; studentCode: string };
  subject: { id: string; name: string; code: string };
  branch: { id: string; name: string; code: string };
  assignedTo: { id: string; name: string } | null;
  _count: { messages: number };
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

const STATUS_VARIANT: Record<DoubtStatus, 'warning' | 'info' | 'success'> = {
  OPEN: 'warning', ANSWERED: 'info', CLOSED: 'success',
};

/** Spec §59 — the doubt queue. */
export default function DoubtsPage() {
  const router = useRouter();
  const [status, setStatus] = React.useState('OPEN');
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => { setPage(1); }, [status]);

  const { data, error, loading, reload } = useQuery<Page<DoubtRow>>('/doubts', {
    query: { page, pageSize: 25, status: status === 'all' ? undefined : status },
  });

  const columns: Column<DoubtRow>[] = [
    {
      key: 'question',
      header: 'Doubt',
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{r.question}</span>
          <span className="truncate text-caption text-fg-muted">
            {r.student.name} <span className="font-mono">{r.student.studentCode}</span> · {r.subject.name}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'secondary',
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{DOUBT_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'assignedTo',
      header: 'Assigned to',
      mobile: 'secondary',
      cell: (r) => r.assignedTo ? <span className="text-fg-secondary">{r.assignedTo.name}</span> : <span className="text-fg-muted">Branch pool</span>,
    },
    {
      key: 'createdAt',
      header: 'Logged',
      sortable: true,
      cell: (r) => <span className="text-fg-secondary">{r.createdAt.slice(0, 10)}</span>,
    },
    {
      key: '_count',
      header: 'Replies',
      align: 'right',
      mobile: 'meta',
      cell: (r) => <span className="font-mono tabular-nums">{r._count.messages || '—'}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Learning' }, { label: 'Doubts' }]}
        title="Doubts"
        description="Routed to branch faculty, one assigned teacher, or the organization pool."
        actions={<Button onClick={() => setCreating(true)}>Log a doubt</Button>}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {error ? (
          <ErrorState title="Couldn't load doubts" description={error.message} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            getRowId={(r) => r.id}
            loading={loading}
            onRowClick={(r) => router.push(`/doubts/${r.id}`)}
            toolbar={
              <Segmented
                options={[
                  { value: 'OPEN', label: 'Open' },
                  { value: 'ANSWERED', label: 'Answered' },
                  { value: 'CLOSED', label: 'Closed' },
                  { value: 'all', label: 'All' },
                ]}
                value={status}
                onChange={setStatus}
                size="sm"
                aria-label="Filter by status"
              />
            }
            empty={
              <EmptyState
                title="No doubts here"
                description="Log one on a student's behalf when they call in or ask in person."
                action={<Button onClick={() => setCreating(true)}>Log a doubt</Button>}
              />
            }
            pagination={
              data
                ? { page: data.meta.page, pageCount: data.meta.pageCount, onChange: setPage, summary: `${data.meta.total} doubt${data.meta.total === 1 ? '' : 's'}` }
                : undefined
            }
          />
        )}
      </div>

      <CreateDoubtDrawer open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.push(`/doubts/${id}`); }} />
    </>
  );
}
