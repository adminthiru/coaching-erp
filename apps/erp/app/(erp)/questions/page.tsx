'use client';

import * as React from 'react';
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, DataTable, Dropdown, EmptyState,
  ErrorState, MetricCard, PageHeader, SearchInput, Segmented, Skeleton, useToast, type Column,
} from '@acadia/ui';
import {
  DIFFICULTY_LABEL, QUESTION_TYPE_LABEL, type Difficulty, type QuestionType,
} from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { CreateQuestionDrawer } from '@/components/create-question-drawer';

interface QuestionRow {
  id: string; body: string; type: QuestionType; difficulty: Difficulty;
  marks: number; negativeMarks: number;
  locked: boolean; usedInTests: number; scope: 'organization' | 'branch';
  subject: { id: string; name: string; code: string };
  chapter: { id: string; name: string } | null;
  branch: { id: string; name: string; code: string } | null;
  options: { id: string; label: string; body: string }[];
}

interface Stats {
  total: number; organizationWide: number; branchSpecific: number;
  bySubject: { id: string; name: string; code: string; count: number }[];
  byDifficulty: { difficulty: Difficulty; count: number }[];
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

const TONE: Record<Difficulty, 'success' | 'warning' | 'error'> = {
  EASY: 'success',
  MEDIUM: 'warning',
  HARD: 'error',
};

/** Spec §51 — the question bank. */
export default function QuestionsPage() {
  const { user } = useSession();
  const { toast } = useToast();
  const [scope, setScope] = React.useState('all');
  const [difficulty, setDifficulty] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<QuestionRow | null>(null);
  const debounced = useDebounced(search);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY'].includes(user?.role ?? '');

  React.useEffect(() => { setPage(1); }, [debounced, scope, difficulty]);

  const stats = useQuery<Stats>('/questions/stats');
  const { data, error, loading, reload } = useQuery<Page<QuestionRow>>('/questions', {
    query: {
      page, pageSize: 25,
      search: debounced || undefined,
      scope: scope === 'all' ? undefined : scope,
      difficulty: difficulty === 'all' ? undefined : difficulty,
    },
  });

  async function duplicate(row: QuestionRow) {
    try {
      await api(`/questions/${row.id}/duplicate`, { method: 'POST' });
      toast({ kind: 'success', title: 'Question duplicated', description: 'The copy is editable.' });
      reload();
      stats.reload();
    } catch (err) {
      toast({
        kind: 'error',
        title: 'Could not duplicate',
        description: err instanceof ApiError ? err.message : 'Something went wrong.',
      });
    }
  }

  const columns: Column<QuestionRow>[] = [
    {
      key: 'body',
      header: 'Question',
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-fg">{r.body}</span>
          <span className="truncate text-caption text-fg-muted">
            {r.subject.name}
            {r.chapter && ` · ${r.chapter.name}`}
          </span>
        </div>
      ),
    },
    {
      key: 'difficulty',
      header: 'Difficulty',
      sortable: true,
      mobile: 'secondary',
      cell: (r) => <Badge variant={TONE[r.difficulty]}>{DIFFICULTY_LABEL[r.difficulty]}</Badge>,
    },
    {
      key: 'type',
      header: 'Type',
      cell: (r) => <span className="text-fg-secondary">{QUESTION_TYPE_LABEL[r.type]}</span>,
    },
    {
      key: 'marks',
      header: 'Marks',
      align: 'right',
      cell: (r) => (
        <span className="font-mono tabular-nums text-fg-secondary">
          +{r.marks}
          {r.negativeMarks > 0 && <span className="text-error"> / −{r.negativeMarks}</span>}
        </span>
      ),
    },
    {
      key: 'scope',
      header: 'Library',
      mobile: 'secondary',
      cell: (r) =>
        r.scope === 'organization' ? (
          <Badge variant="primary">Shared</Badge>
        ) : (
          <Badge variant="neutral">{r.branch?.code ?? 'Branch'}</Badge>
        ),
    },
    {
      key: 'locked',
      header: 'Usage',
      mobile: 'meta',
      cell: (r) =>
        r.locked ? (
          <span className="flex items-center gap-1.5">
            <Badge variant="warning">Locked</Badge>
            <span className="font-mono text-caption text-fg-muted">{r.usedInTests}</span>
          </span>
        ) : (
          <span className="text-caption text-fg-muted">Unused</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Assessment' }, { label: 'Question Bank' }]}
        title="Question Bank"
        description="Shared questions are reusable by every branch; branch questions stay private to theirs."
        actions={canManage ? <Button onClick={() => setCreating(true)}>New question</Button> : undefined}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {stats.loading || !stats.data ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-lg" />)
          ) : (
            <>
              <MetricCard title="Total questions" value={String(stats.data.total)} description="available to you" />
              <MetricCard
                title="Shared library"
                value={String(stats.data.organizationWide)}
                description="usable by every branch"
              />
              <MetricCard
                title="Branch-specific"
                value={String(stats.data.branchSpecific)}
                description="private to one branch"
              />
              <MetricCard
                title="Subjects covered"
                value={String(stats.data.bySubject.length)}
                description={stats.data.bySubject.map((s) => `${s.code} ${s.count}`).join(' · ')}
              />
            </>
          )}
        </div>

        {error ? (
          <ErrorState title="Couldn't load the bank" description={error.message} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            getRowId={(r) => r.id}
            loading={loading}
            toolbar={
              <div className="flex w-full flex-wrap items-center gap-2.5">
                <div className="w-full max-w-[300px]">
                  <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search question text…" />
                </div>
                <Segmented
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'org', label: 'Shared' },
                    { value: 'branch', label: 'Branch' },
                  ]}
                  value={scope}
                  onChange={setScope}
                  size="sm"
                  aria-label="Filter by library"
                />
                <Segmented
                  options={[
                    { value: 'all', label: 'Any' },
                    { value: 'EASY', label: 'Easy' },
                    { value: 'MEDIUM', label: 'Medium' },
                    { value: 'HARD', label: 'Hard' },
                  ]}
                  value={difficulty}
                  onChange={setDifficulty}
                  size="sm"
                  aria-label="Filter by difficulty"
                />
              </div>
            }
            rowActions={
              canManage
                ? (row) => (
                    <Dropdown
                      heading="Question"
                      trigger={<Button size="sm" variant="ghost" iconOnly aria-label="Question actions">⋯</Button>}
                      items={[
                        ...(row.locked ? [] : [{ label: 'Edit', onSelect: () => setEditing(row) }]),
                        { label: 'Duplicate', onSelect: () => duplicate(row) },
                        ...(row.locked
                          ? []
                          : [{
                              label: 'Retire',
                              destructive: true,
                              onSelect: async () => {
                                await api(`/questions/${row.id}/retire`, { method: 'POST' });
                                reload(); stats.reload();
                              },
                            }]),
                      ]}
                    />
                  )
                : undefined
            }
            empty={
              <EmptyState
                title={debounced ? 'No matching questions' : 'The bank is empty'}
                description={
                  debounced
                    ? 'Try different wording, or clear the filters.'
                    : 'Add questions before building a paper.'
                }
                action={canManage && !debounced ? <Button onClick={() => setCreating(true)}>New question</Button> : undefined}
              />
            }
            pagination={
              data
                ? { page: data.meta.page, pageCount: data.meta.pageCount, onChange: setPage, summary: `${data.meta.total} question${data.meta.total === 1 ? '' : 's'}` }
                : undefined
            }
          />
        )}

        {stats.data && stats.data.total > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Locked questions</CardTitle>
              <span className="text-caption text-fg-muted">
                Once a question has been sat in a live test, its wording and answer are frozen — students have
                already been marked against them. Duplicate it to make a variant.
              </span>
            </CardHeader>
            <CardContent />
          </Card>
        )}
      </div>

      <CreateQuestionDrawer
        open={editing !== null}
        question={editing as any}
        onClose={() => setEditing(null)}
        onCreated={() => { setEditing(null); reload(); stats.reload(); }}
      />

      <CreateQuestionDrawer
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => { setCreating(false); reload(); stats.reload(); }}
      />
    </>
  );
}
