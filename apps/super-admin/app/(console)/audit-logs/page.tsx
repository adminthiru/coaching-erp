'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  DataTable, EmptyState, ErrorState, PageHeader, SearchInput, type Column,
} from '@acadia/ui';
import { useDebounced, useQuery } from '@/lib/hooks';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorEmail: string | null;
  actorType: string;
  reason: string | null;
  createdAt: string;
  organization: { id: string; name: string } | null;
}

interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; pageCount: number };
}

export default function AuditLogsPage() {
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const debounced = useDebounced(search);

  React.useEffect(() => { setPage(1); }, [debounced]);

  const { data, error, loading, reload } = useQuery<Page<AuditRow>>('/platform/audit-logs', {
    query: { page, pageSize: 25, search: debounced || undefined },
  });

  const columns: Column<AuditRow>[] = [
    {
      key: 'action',
      header: 'Action',
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-mono text-body-sm text-fg">{r.action}</span>
          {r.reason && <span className="truncate text-caption text-fg-muted">{r.reason}</span>}
        </div>
      ),
    },
    {
      key: 'organization',
      header: 'Organization',
      mobile: 'secondary',
      cell: (r) =>
        r.organization ? (
          <Link href={`/organizations/view?id=${r.organization.id}`} className="text-fg-secondary hover:text-primary">
            {r.organization.name}
          </Link>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    {
      key: 'actorEmail',
      header: 'Actor',
      mobile: 'secondary',
      cell: (r) => <span className="text-fg-secondary">{r.actorEmail ?? r.actorType.toLowerCase()}</span>,
    },
    { key: 'entityType', header: 'Entity', cell: (r) => <span className="text-fg-secondary">{r.entityType}</span> },
    {
      key: 'createdAt',
      header: 'When',
      mobile: 'meta',
      align: 'right',
      cell: (r) => <span className="font-mono text-caption">{r.createdAt.slice(0, 16).replace('T', ' ')}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Platform' }, { label: 'Audit Logs' }]}
        title="Audit Logs"
        description="Append-only record of every privileged action taken on the platform."
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {error ? (
          <ErrorState title="Couldn't load audit logs" description={error.message} onRetry={reload} />
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
                  placeholder="Search action, actor or entity…"
                />
              </div>
            }
            empty={<EmptyState title="No audit entries" description="Privileged actions will appear here as they happen." />}
            pagination={
              data
                ? {
                    page: data.meta.page,
                    pageCount: data.meta.pageCount,
                    onChange: setPage,
                    summary: `${data.meta.total.toLocaleString('en-IN')} entries`,
                  }
                : undefined
            }
          />
        )}
      </div>
    </>
  );
}
