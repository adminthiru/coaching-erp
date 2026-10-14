'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge, Button, DataTable, EmptyState, ErrorState, PageHeader, SearchInput, Segmented,
  type Column,
} from '@acadia/ui';
import { TEST_SCOPE_LABEL, TEST_STATUS_LABEL, type TestScope, type TestStatus } from '@acadia/types';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { CreateTestDrawer } from '@/components/create-test-drawer';

interface TestRow {
  id: string; title: string; code: string; scope: TestScope; mode: string; status: TestStatus;
  totalMarks: number; durationMinutes: number; startAt: string; endAt: string;
  questionCount: number; attemptCount: number;
  branches: { id: string; name: string; code: string }[];
  batches: { id: string; name: string; code: string }[];
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

const STATUS_VARIANT: Record<TestStatus, 'neutral' | 'info' | 'warning' | 'success' | 'error' | 'primary'> = {
  DRAFT: 'neutral',
  SCHEDULED: 'info',
  LIVE: 'warning',
  CLOSED: 'primary',
  RESULTS_PUBLISHED: 'success',
  CANCELLED: 'error',
};

/** Spec §52 — test management. */
export default function TestsPage() {
  const router = useRouter();
  const { user } = useSession();
  const [status, setStatus] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);
  const debounced = useDebounced(search);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN'].includes(user?.role ?? '');

  React.useEffect(() => { setPage(1); }, [debounced, status]);

  const { data, error, loading, reload } = useQuery<Page<TestRow>>('/tests', {
    query: { page, pageSize: 25, search: debounced || undefined, status: status === 'all' ? undefined : status },
  });

  const columns: Column<TestRow>[] = [
    {
      key: 'title',
      header: 'Test',
      sortable: true,
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{r.title}</span>
          <span className="truncate text-caption text-fg-muted">
            <span className="font-mono">{r.code}</span> · {r.questionCount} questions · {r.totalMarks} marks
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      mobile: 'secondary',
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{TEST_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'scope',
      header: 'Reach',
      mobile: 'secondary',
      cell: (r) => (
        <span className="flex flex-col gap-0.5">
          <span className="text-fg-secondary">{TEST_SCOPE_LABEL[r.scope]}</span>
          {r.branches.length > 0 && (
            <span className="font-mono text-caption text-fg-muted">
              {r.branches.map((b) => b.code).join(', ')}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'startAt',
      header: 'Window',
      sortable: true,
      cell: (r) => (
        <span className="flex flex-col gap-0.5 text-fg-secondary">
          <span>{r.startAt.slice(0, 10)}</span>
          <span className="text-caption text-fg-muted">{r.durationMinutes} min</span>
        </span>
      ),
    },
    {
      key: 'attemptCount',
      header: 'Attempts',
      align: 'right',
      mobile: 'meta',
      cell: (r) => <span className="font-mono tabular-nums">{r.attemptCount}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Assessment' }, { label: 'Tests' }]}
        title="Tests"
        description="Papers, their reach across branches, and results."
        actions={canManage ? <Button onClick={() => setCreating(true)}>New test</Button> : undefined}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {error ? (
          <ErrorState title="Couldn't load tests" description={error.message} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            getRowId={(r) => r.id}
            loading={loading}
            onRowClick={(r) => router.push(`/tests/${r.id}`)}
            toolbar={
              <div className="flex w-full flex-wrap items-center gap-2.5">
                <div className="w-full max-w-[280px]">
                  <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or code…" />
                </div>
                <Segmented
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'LIVE', label: 'Live' },
                    { value: 'SCHEDULED', label: 'Scheduled' },
                    { value: 'RESULTS_PUBLISHED', label: 'Published' },
                    { value: 'DRAFT', label: 'Drafts' },
                  ]}
                  value={status}
                  onChange={setStatus}
                  size="sm"
                  aria-label="Filter by status"
                />
              </div>
            }
            empty={
              <EmptyState
                title={debounced ? 'No matching tests' : 'No tests yet'}
                description={
                  debounced
                    ? 'Try a different title or code.'
                    : 'Build a paper from the question bank, then schedule it.'
                }
                action={canManage && !debounced ? <Button onClick={() => setCreating(true)}>New test</Button> : undefined}
              />
            }
            pagination={
              data
                ? { page: data.meta.page, pageCount: data.meta.pageCount, onChange: setPage, summary: `${data.meta.total} test${data.meta.total === 1 ? '' : 's'}` }
                : undefined
            }
          />
        )}
      </div>

      <CreateTestDrawer open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.push(`/tests/${id}`); }} />
    </>
  );
}
