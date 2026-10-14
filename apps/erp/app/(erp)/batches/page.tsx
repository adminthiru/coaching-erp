'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge, Button, DataTable, EmptyState, ErrorState, PageHeader, Progress, SearchInput,
  Segmented, StatusBadge, type Column,
} from '@acadia/ui';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { CreateBatchDrawer } from '@/components/create-batch-drawer';

interface BatchRow {
  id: string; name: string; code: string; status: string; room: string | null;
  capacity: number; enrolled: number; seatsLeft: number; full: boolean; fillRate: number;
  facultyCount: number;
  branch: { id: string; name: string; code: string };
  course: { id: string; name: string };
  academicYear: { id: string; name: string };
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PLANNED', label: 'Planned' },
  { value: 'COMPLETED', label: 'Completed' },
];

export default function BatchesPage() {
  const router = useRouter();
  const { user, activeBranch } = useSession();
  const [status, setStatus] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);
  const debounced = useDebounced(search);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN'].includes(user?.role ?? '');

  React.useEffect(() => { setPage(1); }, [debounced, status]);

  const { data, error, loading, reload } = useQuery<Page<BatchRow>>('/batches', {
    query: { page, pageSize: 25, search: debounced || undefined, status: status === 'all' ? undefined : status },
  });

  const columns: Column<BatchRow>[] = [
    {
      key: 'name',
      header: 'Batch',
      sortable: true,
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{r.name}</span>
          <span className="truncate text-caption text-fg-muted">
            <span className="font-mono">{r.code}</span> · {r.course.name}
          </span>
        </div>
      ),
    },
    {
      key: 'enrolled',
      header: 'Seats',
      mobile: 'secondary',
      width: '190px',
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <span className="flex items-baseline justify-between gap-2 font-mono text-body-sm tabular-nums">
            <span className={r.full ? 'text-error' : 'text-fg'}>{r.enrolled}</span>
            <span className="text-fg-muted">/ {r.capacity}</span>
          </span>
          <Progress
            value={r.enrolled}
            max={r.capacity}
            size="sm"
            tone={r.full ? 'error' : r.fillRate >= 80 ? 'warning' : 'primary'}
            aria-label={`${r.name} capacity`}
          />
        </div>
      ),
    },
    { key: 'status', header: 'Status', sortable: true, mobile: 'secondary', cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'facultyCount',
      header: 'Faculty',
      align: 'right',
      cell: (r) => r.facultyCount ? <span className="font-mono tabular-nums">{r.facultyCount}</span> : <Badge variant="warning">None</Badge>,
    },
    { key: 'branch', header: 'Branch', cell: (r) => <span className="font-mono text-fg-secondary">{r.branch.code}</span> },
    { key: 'room', header: 'Room', mobile: 'meta', cell: (r) => <span className="text-fg-secondary">{r.room ?? '—'}</span> },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Academic' }, { label: 'Batches' }]}
        title="Batches"
        description={activeBranch ? `Batches running at ${activeBranch.name}.` : 'Batches across every branch you can access.'}
        actions={canManage ? <Button onClick={() => setCreating(true)}>New batch</Button> : undefined}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {error ? (
          <ErrorState title="Couldn't load batches" description={error.message} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            getRowId={(r) => r.id}
            loading={loading}
            onRowClick={(r) => router.push(`/batches/${r.id}`)}
            toolbar={
              <div className="flex w-full flex-wrap items-center gap-2.5">
                <div className="w-full max-w-[260px]">
                  <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code or room…" />
                </div>
                <Segmented options={FILTERS} value={status} onChange={setStatus} size="sm" aria-label="Filter by status" />
              </div>
            }
            empty={
              <EmptyState
                title={debounced ? 'No matching batches' : 'No batches yet'}
                description={debounced ? 'Try a different name or code.' : 'Create a batch before admitting students into one.'}
                action={canManage && !debounced ? <Button onClick={() => setCreating(true)}>New batch</Button> : undefined}
              />
            }
            pagination={
              data
                ? { page: data.meta.page, pageCount: data.meta.pageCount, onChange: setPage, summary: `${data.meta.total} batch${data.meta.total === 1 ? '' : 'es'}` }
                : undefined
            }
          />
        )}
      </div>

      <CreateBatchDrawer open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
