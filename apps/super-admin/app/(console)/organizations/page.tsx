'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button, DataTable, Dropdown, EmptyState, ErrorState, PageHeader, SearchInput,
  Segmented, StatusBadge, type Column,
} from '@acadia/ui';
import { OrganizationStatus } from '@acadia/types';
import { useDebounced, useQuery } from '@/lib/hooks';
import { CreateOrganizationDrawer } from '@/components/create-organization-drawer';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  ownerName: string;
  ownerEmail: string;
  createdAt: string;
  lastActiveAt: string | null;
  trialEndsAt: string | null;
  plan: { id: string; name: string } | null;
  branchCount: number;
  studentCount: number;
}

interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; pageCount: number };
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: OrganizationStatus.TRIAL, label: 'Trial' },
  { value: OrganizationStatus.ACTIVE, label: 'Active' },
  { value: OrganizationStatus.PAYMENT_DUE, label: 'Payment due' },
  { value: OrganizationStatus.SUSPENDED, label: 'Suspended' },
];

export default function OrganizationsPage() {
  const router = useRouter();
  const [status, setStatus] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [sort, setSort] = React.useState<{ key: string; dir: 'asc' | 'desc' } | null>({
    key: 'createdAt',
    dir: 'desc',
  });
  const [creating, setCreating] = React.useState(false);

  const debouncedSearch = useDebounced(search);

  // A new filter or query invalidates the current page number.
  React.useEffect(() => { setPage(1); }, [status, debouncedSearch]);

  const { data, error, loading, reload } = useQuery<Page<OrgRow>>('/platform/organizations', {
    query: {
      page,
      pageSize: 25,
      search: debouncedSearch || undefined,
      status: status === 'all' ? undefined : status,
      sortBy: sort?.key,
      sortDir: sort?.dir,
    },
  });

  const columns: Column<OrgRow>[] = [
    {
      key: 'name',
      header: 'Organization',
      sortable: true,
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <Link href={`/organizations/view?id=${r.id}`} className="truncate font-semibold text-fg hover:text-primary">
            {r.name}
          </Link>
          <span className="truncate text-caption text-fg-muted">{r.ownerEmail}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      mobile: 'secondary',
      cell: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'plan',
      header: 'Plan',
      mobile: 'secondary',
      cell: (r) => <span className="text-fg-secondary">{r.plan?.name ?? '—'}</span>,
    },
    {
      key: 'branchCount',
      header: 'Branches',
      align: 'right',
      cell: (r) => <span className="font-mono tabular-nums">{r.branchCount}</span>,
    },
    {
      key: 'studentCount',
      header: 'Students',
      align: 'right',
      mobile: 'meta',
      cell: (r) => <span className="font-mono tabular-nums">{r.studentCount.toLocaleString('en-IN')}</span>,
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      cell: (r) => <span className="text-fg-secondary">{r.createdAt.slice(0, 10)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Customers' }, { label: 'Organizations' }]}
        title="Organizations"
        description="Every tenant on the platform, with its plan, branches and status."
        actions={<Button onClick={() => setCreating(true)}>New organization</Button>}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {error ? (
          <ErrorState title="Couldn't load organizations" description={error.message} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            getRowId={(r) => r.id}
            loading={loading}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(r) => router.push(`/organizations/view?id=${r.id}`)}
            toolbar={
              <div className="flex w-full flex-wrap items-center gap-2.5">
                <div className="w-full max-w-[280px]">
                  <SearchInput
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, slug or owner…"
                  />
                </div>
                <Segmented
                  options={FILTERS}
                  value={status}
                  onChange={setStatus}
                  size="sm"
                  aria-label="Filter by status"
                />
              </div>
            }
            rowActions={(row) => (
              <Dropdown
                heading={row.name}
                trigger={
                  <Button size="sm" variant="ghost" iconOnly aria-label={`Actions for ${row.name}`}>
                    ⋯
                  </Button>
                }
                items={[
                  { label: 'View details', onSelect: () => router.push(`/organizations/view?id=${row.id}`) },
                  { label: 'Usage & limits', onSelect: () => router.push(`/organizations/view?id=${row.id}&tab=usage`) },
                  { label: 'Billing', onSelect: () => router.push(`/organizations/view?id=${row.id}&tab=billing`) },
                ]}
              />
            )}
            empty={
              <EmptyState
                title={debouncedSearch ? 'No matching organizations' : 'No organizations yet'}
                description={
                  debouncedSearch
                    ? 'Try a different name, slug or owner email.'
                    : 'Create the first organization to get the platform started.'
                }
                action={!debouncedSearch ? <Button onClick={() => setCreating(true)}>New organization</Button> : undefined}
              />
            }
            pagination={
              data
                ? {
                    page: data.meta.page,
                    pageCount: data.meta.pageCount,
                    onChange: setPage,
                    summary: `${data.meta.total.toLocaleString('en-IN')} organization${data.meta.total === 1 ? '' : 's'}`,
                  }
                : undefined
            }
          />
        )}
      </div>

      <CreateOrganizationDrawer
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => { setCreating(false); router.push(`/organizations/view?id=${id}`); }}
      />
    </>
  );
}
