'use client';

import * as React from 'react';
import {
  Badge, Button, DataTable, Dropdown, EmptyState, ErrorState, PageHeader, SearchInput,
  StatusBadge, type Column,
} from '@acadia/ui';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { TransferStaffDrawer } from '@/components/transfer-staff-drawer';

interface StaffRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  employeeId: string | null;
  role: string;
  status: string;
  branches: { id: string; name: string; code: string; isPrimary: boolean }[];
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

export default function StaffPage() {
  const { user, activeBranch } = useSession();
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [transferring, setTransferring] = React.useState<StaffRow | null>(null);
  const debounced = useDebounced(search);

  const canManage = user?.role === 'ORG_OWNER' || user?.role === 'ORG_ADMIN';

  React.useEffect(() => { setPage(1); }, [debounced]);

  const { data, error, loading, reload } = useQuery<Page<StaffRow>>('/staff', {
    query: { page, pageSize: 25, search: debounced || undefined },
  });

  const columns: Column<StaffRow>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{r.name}</span>
          <span className="truncate text-caption text-fg-muted">{r.email}</span>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      mobile: 'secondary',
      cell: (r) => <Badge variant="neutral">{r.role.replace(/_/g, ' ').toLowerCase()}</Badge>,
    },
    {
      key: 'branches',
      header: 'Branches',
      mobile: 'secondary',
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          {r.branches.map((b) => (
            <Badge key={b.id} variant={b.isPrimary ? 'primary' : 'neutral'}>{b.code}</Badge>
          ))}
        </span>
      ),
    },
    { key: 'status', header: 'Status', mobile: 'meta', cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'employeeId',
      header: 'Employee ID',
      cell: (r) => <span className="font-mono text-fg-secondary">{r.employeeId ?? '—'}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Organization' }, { label: 'Staff' }]}
        title="Staff"
        description={
          activeBranch
            ? `People assigned to ${activeBranch.name}.`
            : 'Everyone across the branches you can access.'
        }
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {error ? (
          <ErrorState title="Couldn't load staff" description={error.message} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            getRowId={(r) => r.id}
            loading={loading}
            toolbar={
              <div className="w-full max-w-[300px]">
                <SearchInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email or employee ID…"
                />
              </div>
            }
            rowActions={
              canManage
                ? (row) => (
                    <Dropdown
                      heading={row.name}
                      trigger={<Button size="sm" variant="ghost" iconOnly aria-label={`Actions for ${row.name}`}>⋯</Button>}
                      items={[{ label: 'Transfer to another branch', onSelect: () => setTransferring(row) }]}
                    />
                  )
                : undefined
            }
            empty={
              <EmptyState
                title={debounced ? 'No matching people' : 'No staff yet'}
                description={
                  debounced
                    ? 'Try a different name, email or employee ID.'
                    : 'Add a branch admin from the Branches page to get started.'
                }
              />
            }
            pagination={
              data
                ? {
                    page: data.meta.page,
                    pageCount: data.meta.pageCount,
                    onChange: setPage,
                    summary: `${data.meta.total} ${data.meta.total === 1 ? 'person' : 'people'}`,
                  }
                : undefined
            }
          />
        )}
      </div>

      <TransferStaffDrawer
        open={transferring !== null}
        person={transferring}
        onClose={() => setTransferring(null)}
        onDone={() => { setTransferring(null); reload(); }}
      />
    </>
  );
}
