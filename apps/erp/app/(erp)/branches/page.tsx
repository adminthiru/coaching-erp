'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert, Badge, Button, DataTable, Dropdown, EmptyState, ErrorState, PageHeader,
  SearchInput, StatusBadge, type Column,
} from '@acadia/ui';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { CreateBranchDrawer } from '@/components/create-branch-drawer';
import { CreateBranchAdminDrawer } from '@/components/create-branch-admin-drawer';

interface BranchRow {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  status: string;
  needsAdmin: boolean;
  staffCount: number;
  admins: { id: string; name: string; email: string }[];
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

export default function BranchesPage() {
  const router = useRouter();
  const { user, reload } = useSession();
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<any>(null);
  const [addingAdminTo, setAddingAdminTo] = React.useState<BranchRow | null>(null);
  const debounced = useDebounced(search);

  const canManage = user?.role === 'ORG_OWNER' || user?.role === 'ORG_ADMIN';

  React.useEffect(() => { setPage(1); }, [debounced]);

  const { data, error, loading, reload: reloadList } = useQuery<Page<BranchRow>>('/branches', {
    query: { page, pageSize: 25, search: debounced || undefined },
  });

  const needingAdmin = (data?.data ?? []).filter((b) => b.needsAdmin && b.status !== 'ARCHIVED');

  const columns: Column<BranchRow>[] = [
    {
      key: 'name',
      header: 'Branch',
      sortable: true,
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{r.name}</span>
          <span className="truncate text-caption text-fg-muted">
            <span className="font-mono">{r.code}</span> · {r.city}, {r.state}
          </span>
        </div>
      ),
    },
    { key: 'status', header: 'Status', sortable: true, mobile: 'secondary', cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'admins',
      header: 'Branch admin',
      mobile: 'secondary',
      cell: (r) =>
        r.admins.length ? (
          <span className="text-fg-secondary">{r.admins.map((a) => a.name).join(', ')}</span>
        ) : (
          <Badge variant="warning">Needs an admin</Badge>
        ),
    },
    {
      key: 'staffCount',
      header: 'Staff',
      align: 'right',
      mobile: 'meta',
      cell: (r) => <span className="font-mono tabular-nums">{r.staffCount}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Organization' }, { label: 'Branches' }]}
        title="Branches"
        description="Every branch you can access, its admin and its operating status."
        actions={canManage ? <Button onClick={() => setCreating(true)}>New branch</Button> : undefined}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {needingAdmin.length > 0 && (
          <Alert
            tone="warning"
            title={`${needingAdmin.length} branch${needingAdmin.length === 1 ? '' : 'es'} cannot operate yet`}
          >
            A branch needs an admin before it becomes active.
          </Alert>
        )}

        {error ? (
          <ErrorState title="Couldn't load branches" description={error.message} onRetry={reloadList} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            getRowId={(r) => r.id}
            loading={loading}
            onRowClick={(r) => router.push(`/branches/${r.id}`)}
            toolbar={
              <div className="w-full max-w-[300px]">
                <SearchInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, code or city…"
                />
              </div>
            }
            rowActions={
              canManage
                ? (row) => (
                    <Dropdown
                      heading={row.name}
                      trigger={<Button size="sm" variant="ghost" iconOnly aria-label={`Actions for ${row.name}`}>⋯</Button>}
                      items={[
                        { label: 'View branch', onSelect: () => router.push(`/branches/${row.id}`) },
                        { label: 'Edit branch', onSelect: () => setEditing(row) },
                        ...(row.needsAdmin && row.status !== 'ARCHIVED'
                          ? [{ label: 'Add branch admin', onSelect: () => setAddingAdminTo(row) }]
                          : []),
                      ]}
                    />
                  )
                : undefined
            }
            empty={
              <EmptyState
                title={debounced ? 'No matching branches' : 'No branches yet'}
                description={
                  debounced
                    ? 'Try a different name, code or city.'
                    : 'Create your first branch to start running the organization.'
                }
                action={canManage && !debounced ? <Button onClick={() => setCreating(true)}>New branch</Button> : undefined}
              />
            }
            pagination={
              data
                ? {
                    page: data.meta.page,
                    pageCount: data.meta.pageCount,
                    onChange: setPage,
                    summary: `${data.meta.total} branch${data.meta.total === 1 ? '' : 'es'}`,
                  }
                : undefined
            }
          />
        )}
      </div>

      <CreateBranchDrawer
        open={editing !== null}
        branch={editing}
        onClose={() => setEditing(null)}
        onCreated={() => { setEditing(null); reload(); }}
      />

      <CreateBranchDrawer
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async (branch) => {
          setCreating(false);
          await reload();
          reloadList();
          setAddingAdminTo(branch);
        }}
      />

      <CreateBranchAdminDrawer
        open={addingAdminTo !== null}
        branch={addingAdminTo}
        onClose={() => setAddingAdminTo(null)}
        onCreated={() => { setAddingAdminTo(null); reloadList(); }}
      />
    </>
  );
}
