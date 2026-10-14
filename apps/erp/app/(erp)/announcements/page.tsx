'use client';

import * as React from 'react';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState,
  PageHeader, SearchInput, Segmented, Skeleton, useToast,
} from '@acadia/ui';
import { AUDIENCE_LABEL, type AnnouncementAudience } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { CreateAnnouncementDrawer } from '@/components/create-announcement-drawer';

interface Announcement {
  id: string; title: string; body: string; status: string; pinned: boolean;
  audience: AnnouncementAudience;
  publishedAt: string | null;
  createdAt: string;
  batch: { id: string; name: string; code: string } | null;
  course: { id: string; name: string } | null;
  publishedBy: { id: string; name: string } | null;
  targets: { id: string; name: string; code: string }[];
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

/** Spec §49 — targeted communication. */
export default function AnnouncementsPage() {
  const { user, activeBranch } = useSession();
  const { toast } = useToast();
  const [status, setStatus] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const debounced = useDebounced(search);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN'].includes(user?.role ?? '');

  const { data, error, loading, reload } = useQuery<Page<Announcement>>('/announcements', {
    query: { pageSize: 50, search: debounced || undefined, status: status === 'all' ? undefined : status },
  });

  async function setStatusOn(id: string, next: 'PUBLISHED' | 'ARCHIVED') {
    setBusyId(id);
    try {
      await api(`/announcements/${id}/status`, { method: 'POST', body: { status: next } });
      toast({
        kind: 'success',
        title: next === 'PUBLISHED' ? 'Announcement published' : 'Announcement archived',
      });
      reload();
    } catch (err) {
      toast({
        kind: 'error',
        title: 'Could not update',
        description: err instanceof ApiError ? err.message : 'Something went wrong.',
      });
    } finally {
      setBusyId(null);
    }
  }

  const items = data?.data ?? [];
  const pinned = items.filter((a) => a.pinned && a.status === 'PUBLISHED');
  const rest = items.filter((a) => !pinned.includes(a));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Operations' }, { label: 'Announcements' }]}
        title="Announcements"
        description={
          activeBranch ? `Notices for ${activeBranch.name}, plus organization-wide ones.` : 'Notices across your organization.'
        }
        actions={canManage ? <Button onClick={() => setCreating(true)}>New announcement</Button> : undefined}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-full max-w-[280px]">
            <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or message…" />
          </div>
          <Segmented
            options={[
              { value: 'all', label: 'All' },
              { value: 'PUBLISHED', label: 'Published' },
              { value: 'DRAFT', label: 'Drafts' },
              { value: 'ARCHIVED', label: 'Archived' },
            ]}
            value={status}
            onChange={setStatus}
            size="sm"
            aria-label="Filter by status"
          />
        </div>

        {error ? (
          <ErrorState title="Couldn't load announcements" description={error.message} onRetry={reload} />
        ) : loading ? (
          <div className="flex flex-col gap-3.5">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={debounced ? 'No matching announcements' : 'Nothing announced yet'}
            description={
              debounced ? 'Try a different search.' : 'Post a notice to a batch, a branch, or the whole organization.'
            }
            action={canManage && !debounced ? <Button onClick={() => setCreating(true)}>New announcement</Button> : undefined}
          />
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="flex flex-col gap-3.5">
                <span className="text-label text-fg-secondary">Pinned</span>
                {pinned.map((a) => (
                  <AnnouncementCard key={a.id} a={a} canManage={canManage} busy={busyId === a.id} onStatus={setStatusOn} />
                ))}
              </div>
            )}
            {rest.map((a) => (
              <AnnouncementCard key={a.id} a={a} canManage={canManage} busy={busyId === a.id} onStatus={setStatusOn} />
            ))}
          </>
        )}
      </div>

      <CreateAnnouncementDrawer open={creating} onClose={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />
    </>
  );
}

function AnnouncementCard({
  a, canManage, busy, onStatus,
}: {
  a: Announcement;
  canManage: boolean;
  busy: boolean;
  onStatus: (id: string, next: 'PUBLISHED' | 'ARCHIVED') => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>{a.title}</CardTitle>
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge variant={a.status === 'PUBLISHED' ? 'success' : a.status === 'DRAFT' ? 'warning' : 'neutral'}>
                {a.status.toLowerCase()}
              </Badge>
              <Badge variant="primary">{AUDIENCE_LABEL[a.audience] ?? a.audience}</Badge>
              {a.batch && <Badge variant="neutral">{a.batch.code}</Badge>}
              {a.targets.map((t) => <Badge key={t.id} variant="neutral">{t.code}</Badge>)}
              {a.pinned && <Badge variant="info">Pinned</Badge>}
            </span>
          </div>
          {canManage && (
            <span className="flex shrink-0 gap-2">
              {a.status === 'DRAFT' && (
                <Button size="sm" loading={busy} onClick={() => onStatus(a.id, 'PUBLISHED')}>Publish</Button>
              )}
              {a.status === 'PUBLISHED' && (
                <Button size="sm" variant="outline" loading={busy} onClick={() => onStatus(a.id, 'ARCHIVED')}>Archive</Button>
              )}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="whitespace-pre-wrap text-body-sm text-fg-secondary">{a.body}</p>
        <span className="text-caption text-fg-muted">
          {a.publishedAt
            ? `Published ${a.publishedAt.slice(0, 10)}${a.publishedBy ? ` by ${a.publishedBy.name}` : ''}`
            : `Drafted ${a.createdAt.slice(0, 10)}`}
        </span>
      </CardContent>
    </Card>
  );
}
