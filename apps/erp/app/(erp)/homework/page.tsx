'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge, Button, DataTable, EmptyState, ErrorState, PageHeader, Segmented, type Column,
} from '@acadia/ui';
import { HOMEWORK_STATUS_LABEL, type HomeworkStatus } from '@acadia/types';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { CreateHomeworkDrawer } from '@/components/create-homework-drawer';

interface HomeworkRow {
  id: string; title: string; status: HomeworkStatus; audience: string; dueAt: string;
  maxMarks: number | null; submissionCount: number;
  subject: { id: string; name: string; code: string } | null;
  batch: { id: string; name: string; code: string } | null;
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

const STATUS_VARIANT: Record<HomeworkStatus, 'neutral' | 'info' | 'warning' | 'success' | 'error'> = {
  DRAFT: 'neutral',
  PUBLISHED: 'info',
  CLOSED: 'success',
};

/** Spec §58 — homework assignment. */
export default function HomeworkPage() {
  const router = useRouter();
  const { user } = useSession();
  const [status, setStatus] = React.useState('all');
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY'].includes(user?.role ?? '');

  React.useEffect(() => { setPage(1); }, [status]);

  const { data, error, loading, reload } = useQuery<Page<HomeworkRow>>('/homework', {
    query: { page, pageSize: 25, status: status === 'all' ? undefined : status },
  });

  const columns: Column<HomeworkRow>[] = [
    {
      key: 'title',
      header: 'Homework',
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{r.title}</span>
          <span className="truncate text-caption text-fg-muted">
            {r.subject?.name ?? 'No subject'}{r.batch && ` · ${r.batch.name}`}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'secondary',
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{HOMEWORK_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'dueAt',
      header: 'Due',
      sortable: true,
      cell: (r) => <span className="text-fg-secondary">{r.dueAt.slice(0, 10)}</span>,
    },
    {
      key: 'maxMarks',
      header: 'Max marks',
      align: 'right',
      cell: (r) => <span className="font-mono tabular-nums text-fg-secondary">{r.maxMarks ?? '—'}</span>,
    },
    {
      key: 'submissionCount',
      header: 'Roster',
      align: 'right',
      mobile: 'meta',
      cell: (r) => <span className="font-mono tabular-nums">{r.submissionCount || '—'}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Learning' }, { label: 'Homework' }]}
        title="Homework"
        description="Assign work to a batch, one or more branches, or named students."
        actions={canManage ? <Button onClick={() => setCreating(true)}>New homework</Button> : undefined}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {error ? (
          <ErrorState title="Couldn't load homework" description={error.message} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            getRowId={(r) => r.id}
            loading={loading}
            onRowClick={(r) => router.push(`/homework/view?id=${r.id}`)}
            toolbar={
              <Segmented
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'PUBLISHED', label: 'Published' },
                  { value: 'DRAFT', label: 'Drafts' },
                  { value: 'CLOSED', label: 'Closed' },
                ]}
                value={status}
                onChange={setStatus}
                size="sm"
                aria-label="Filter by status"
              />
            }
            empty={
              <EmptyState
                title="No homework yet"
                description="Assign a batch's first piece of work."
                action={canManage ? <Button onClick={() => setCreating(true)}>New homework</Button> : undefined}
              />
            }
            pagination={
              data
                ? { page: data.meta.page, pageCount: data.meta.pageCount, onChange: setPage, summary: `${data.meta.total} item${data.meta.total === 1 ? '' : 's'}` }
                : undefined
            }
          />
        )}
      </div>

      <CreateHomeworkDrawer open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.push(`/homework/view?id=${id}`); }} />
    </>
  );
}
