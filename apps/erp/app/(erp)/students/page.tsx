'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge, Button, DataTable, Dropdown, EmptyState, ErrorState, PageHeader, SearchInput,
  Segmented, StatusBadge, type Column,
} from '@acadia/ui';
import { TARGET_EXAM_LABEL, type TargetExam } from '@acadia/types';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { AddStudentDrawer } from '@/components/add-student-drawer';
import { TransferStudentDrawer } from '@/components/transfer-student-drawer';

interface StudentRow {
  id: string;
  studentCode: string;
  name: string;
  phone: string | null;
  status: string;
  targetExam: TargetExam;
  admissionDate: string;
  parentName: string | null;
  parentPhone: string | null;
  branch: { id: string; name: string; code: string };
  course: { id: string; name: string } | null;
  batches: { id: string; name: string; code: string }[];
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'DROPPED', label: 'Dropped' },
];

export default function StudentsPage() {
  const router = useRouter();
  const { activeBranch } = useSession();
  const [status, setStatus] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [sort, setSort] = React.useState<{ key: string; dir: 'asc' | 'desc' } | null>({ key: 'name', dir: 'asc' });
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<any>(null);
  const [transferring, setTransferring] = React.useState<StudentRow | null>(null);
  const debounced = useDebounced(search);

  React.useEffect(() => { setPage(1); }, [debounced, status]);

  const { data, error, loading, reload } = useQuery<Page<StudentRow>>('/students', {
    query: {
      page, pageSize: 25,
      search: debounced || undefined,
      status: status === 'all' ? undefined : status,
      sortBy: sort?.key, sortDir: sort?.dir,
    },
  });

  const columns: Column<StudentRow>[] = [
    {
      key: 'name',
      header: 'Student',
      sortable: true,
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{r.name}</span>
          <span className="truncate text-caption text-fg-muted">
            <span className="font-mono">{r.studentCode}</span>
            {r.phone && ` · ${r.phone}`}
          </span>
        </div>
      ),
    },
    {
      key: 'batches',
      header: 'Batch',
      mobile: 'secondary',
      cell: (r) =>
        r.batches.length ? (
          <span className="flex flex-wrap gap-1">
            {r.batches.map((b) => <Badge key={b.id} variant="primary">{b.code}</Badge>)}
          </span>
        ) : (
          <Badge variant="warning">Unbatched</Badge>
        ),
    },
    {
      key: 'targetExam',
      header: 'Target',
      cell: (r) => <span className="text-fg-secondary">{TARGET_EXAM_LABEL[r.targetExam] ?? r.targetExam}</span>,
    },
    { key: 'status', header: 'Status', sortable: true, mobile: 'secondary', cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'branch',
      header: 'Branch',
      cell: (r) => <span className="font-mono text-fg-secondary">{r.branch.code}</span>,
    },
    {
      key: 'admissionDate',
      header: 'Admitted',
      sortable: true,
      mobile: 'meta',
      cell: (r) => <span className="text-fg-secondary">{r.admissionDate.slice(0, 10)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Academic' }, { label: 'Students' }]}
        title="Students"
        description={
          activeBranch
            ? `Students enrolled at ${activeBranch.name}.`
            : 'Students across every branch you can access.'
        }
        actions={<Button onClick={() => setAdding(true)}>Add student</Button>}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {error ? (
          <ErrorState title="Couldn't load students" description={error.message} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            getRowId={(r) => r.id}
            loading={loading}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(r) => router.push(`/students/view?id=${r.id}`)}
            toolbar={
              <div className="flex w-full flex-wrap items-center gap-2.5">
                <div className="w-full max-w-[280px]">
                  <SearchInput
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, code or phone…"
                  />
                </div>
                <Segmented options={FILTERS} value={status} onChange={setStatus} size="sm" aria-label="Filter by status" />
              </div>
            }
            rowActions={(row) => (
              <Dropdown
                heading={row.name}
                trigger={<Button size="sm" variant="ghost" iconOnly aria-label={`Actions for ${row.name}`}>⋯</Button>}
                items={[
                  { label: 'View student', onSelect: () => router.push(`/students/view?id=${row.id}`) },
                  { label: 'Edit student', onSelect: () => setEditing(row) },
                  { label: 'Transfer branch', onSelect: () => setTransferring(row) },
                ]}
              />
            )}
            empty={
              <EmptyState
                title={debounced ? 'No matching students' : 'No students yet'}
                description={
                  debounced
                    ? 'Try a different name, code or phone number.'
                    : 'Admit your first student, or convert an enquiry from Admissions.'
                }
                action={!debounced ? <Button onClick={() => setAdding(true)}>Add student</Button> : undefined}
              />
            }
            pagination={
              data
                ? {
                    page: data.meta.page,
                    pageCount: data.meta.pageCount,
                    onChange: setPage,
                    summary: `${data.meta.total.toLocaleString('en-IN')} student${data.meta.total === 1 ? '' : 's'}`,
                  }
                : undefined
            }
          />
        )}
      </div>

      <AddStudentDrawer open={adding} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); reload(); }} />

      <AddStudentDrawer
        open={editing !== null}
        student={editing}
        onClose={() => setEditing(null)}
        onCreated={() => { setEditing(null); reload(); }}
      />
      <TransferStudentDrawer
        open={transferring !== null}
        student={transferring}
        onClose={() => setTransferring(null)}
        onDone={() => { setTransferring(null); reload(); }}
      />
    </>
  );
}
