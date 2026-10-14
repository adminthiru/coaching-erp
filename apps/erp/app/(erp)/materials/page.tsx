'use client';

import * as React from 'react';
import {
  Badge, Button, DataTable, Dropdown, EmptyState, ErrorState, PageHeader, SearchInput, useToast, type Column,
} from '@acadia/ui';
import { MATERIAL_AUDIENCE_LABEL, type MaterialAudience } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { CreateMaterialDrawer } from '@/components/create-material-drawer';

interface MaterialRow {
  id: string; title: string; description: string | null; audience: MaterialAudience; fileUrl: string; isArchived: boolean;
  subject: { id: string; name: string; code: string } | null;
  batch: { id: string; name: string; code: string } | null;
  createdBy: { id: string; name: string };
  createdAt: string;
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

const AUDIENCE_VARIANT: Record<MaterialAudience, 'primary' | 'info' | 'neutral'> = {
  ORGANIZATION: 'primary', BRANCH: 'info', MULTI_BRANCH: 'info', BATCH: 'neutral', STUDENTS: 'neutral',
};

/** Spec §60 — study materials. */
export default function MaterialsPage() {
  const { user } = useSession();
  const { toast } = useToast();
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);
  const debounced = useDebounced(search);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY'].includes(user?.role ?? '');

  React.useEffect(() => { setPage(1); }, [debounced]);

  const { data, error, loading, reload } = useQuery<Page<MaterialRow>>('/materials', {
    query: { page, pageSize: 25, search: debounced || undefined },
  });

  async function archive(row: MaterialRow) {
    try {
      await api(`/materials/${row.id}/archive`, { method: 'POST' });
      toast({ kind: 'success', title: 'Material archived', description: `${row.title} is hidden from new views.` });
      reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not archive', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
  }

  const columns: Column<MaterialRow>[] = [
    {
      key: 'title',
      header: 'Material',
      mobile: 'primary',
      cell: (r) => (
        <a href={r.fileUrl} target="_blank" rel="noreferrer" className="flex min-w-0 flex-col hover:text-primary">
          <span className="truncate font-semibold text-fg">{r.title}</span>
          <span className="truncate text-caption text-fg-muted">{r.subject?.name ?? 'No subject'}{r.batch && ` · ${r.batch.name}`}</span>
        </a>
      ),
    },
    {
      key: 'audience',
      header: 'Reach',
      mobile: 'secondary',
      cell: (r) => <Badge variant={AUDIENCE_VARIANT[r.audience]}>{MATERIAL_AUDIENCE_LABEL[r.audience]}</Badge>,
    },
    {
      key: 'createdBy',
      header: 'Added by',
      mobile: 'meta',
      cell: (r) => <span className="text-fg-secondary">{r.createdBy.name}</span>,
    },
    {
      key: 'createdAt',
      header: 'Added',
      cell: (r) => <span className="text-fg-secondary">{r.createdAt.slice(0, 10)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Learning' }, { label: 'Study Materials' }]}
        title="Study Materials"
        description="Shared reading, notes and links — visible to whoever they're targeted at."
        actions={canManage ? <Button onClick={() => setCreating(true)}>New material</Button> : undefined}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {error ? (
          <ErrorState title="Couldn't load materials" description={error.message} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            getRowId={(r) => r.id}
            loading={loading}
            toolbar={
              <div className="w-full max-w-[300px]">
                <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title…" />
              </div>
            }
            rowActions={
              canManage
                ? (row) => (
                    <Dropdown
                      heading="Material"
                      trigger={<Button size="sm" variant="ghost" iconOnly aria-label="Material actions">⋯</Button>}
                      items={[{ label: 'Archive', destructive: true, onSelect: () => archive(row) }]}
                    />
                  )
                : undefined
            }
            empty={
              <EmptyState
                title={debounced ? 'No matching materials' : 'No materials yet'}
                description={debounced ? 'Try a different title.' : 'Add the first shared resource.'}
                action={canManage && !debounced ? <Button onClick={() => setCreating(true)}>New material</Button> : undefined}
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

      <CreateMaterialDrawer open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
