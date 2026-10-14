'use client';

import * as React from 'react';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Combobox, ErrorState,
  PageHeader, Progress, Segmented, Skeleton, useToast,
} from '@acadia/ui';
import { SYLLABUS_STATUS_LABEL, type SyllabusStatus } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface ProgressRow {
  id: string;
  status: SyllabusStatus;
  completedDate: string | null;
  plannedDate: string | null;
  notes: string | null;
  faculty: { id: string; name: string } | null;
  topic: { id: string; name: string; sequence: number; estimatedHours: number };
}

interface ChapterGroup {
  id: string; name: string; sequence: number;
  topics: ProgressRow[];
  total: number; completed: number; inProgress: number; skipped: number; percent: number;
}

interface SubjectGroup {
  subject: { id: string; name: string; code: string };
  chapters: ChapterGroup[];
  total: number; completed: number; percent: number;
}

interface BatchSyllabus {
  batch: { id: string; name: string; code: string };
  subjects: SubjectGroup[];
  overall: { total: number; completed: number; inProgress: number; skipped: number; percent: number };
  tracked: number;
}

const NEXT_STATUS: Record<SyllabusStatus, SyllabusStatus> = {
  PLANNED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
  COMPLETED: 'PLANNED',
  SKIPPED: 'PLANNED',
};

const STATUS_VARIANT: Record<SyllabusStatus, 'neutral' | 'info' | 'warning' | 'success'> = {
  PLANNED: 'neutral',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  SKIPPED: 'info',
};

/** Spec §43 — syllabus completion, tracked per batch. */
export default function SyllabusPage() {
  const { user, activeBranch } = useSession();
  const { toast } = useToast();
  const [batchId, setBatchId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState('all');
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const canEdit = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY'].includes(user?.role ?? '');

  const { data: batches } = useQuery<{ data: { id: string; name: string; code: string }[] }>('/batches', {
    query: { pageSize: 100, status: 'ACTIVE' },
  });

  React.useEffect(() => {
    if (!batchId && batches?.data.length) setBatchId(batches.data[0].id);
  }, [batches, batchId]);

  const { data, error, loading, reload } = useQuery<BatchSyllabus>(
    batchId ? `/batches/${batchId}/syllabus` : null, {}, [batchId],
  );

  async function cycle(row: ProgressRow) {
    setSavingId(row.id);
    const next = NEXT_STATUS[row.status];
    try {
      await api(`/syllabus/progress/${row.id}`, { method: 'PATCH', body: { status: next } });
      reload();
    } catch (err) {
      toast({
        kind: 'error',
        title: 'Could not update',
        description: err instanceof ApiError ? err.message : 'Something went wrong.',
      });
    } finally {
      setSavingId(null);
    }
  }

  async function initialise() {
    if (!batchId) return;
    try {
      const r = await api<{ message: string }>(`/batches/${batchId}/syllabus/initialise`, { method: 'POST', body: {} });
      toast({ kind: 'success', title: 'Tracker ready', description: r.message });
      reload();
    } catch (err) {
      toast({
        kind: 'error',
        title: 'Could not set up the tracker',
        description: err instanceof ApiError ? err.message : 'Something went wrong.',
      });
    }
  }

  const visible = (topics: ProgressRow[]) =>
    filter === 'all' ? topics : topics.filter((t) => t.status === filter);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Academic' }, { label: 'Syllabus' }]}
        title="Syllabus"
        description={
          activeBranch
            ? `Completion tracking for batches at ${activeBranch.name}.`
            : 'Completion tracking across the batches you can access.'
        }
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="w-full max-w-[280px]">
            <Combobox
              label="Batch"
              placeholder="Select a batch"
              options={(batches?.data ?? []).map((b) => ({ value: b.id, label: b.name, meta: b.code }))}
              value={batchId}
              onChange={setBatchId}
            />
          </div>
          <Segmented
            options={[
              { value: 'all', label: 'All' },
              { value: 'PLANNED', label: 'Planned' },
              { value: 'IN_PROGRESS', label: 'In progress' },
              { value: 'COMPLETED', label: 'Done' },
            ]}
            value={filter}
            onChange={setFilter}
            size="sm"
            aria-label="Filter topics"
          />
        </div>

        {error ? (
          <ErrorState title="Couldn't load the syllabus" description={error.message} onRetry={reload} />
        ) : !batchId ? (
          <Alert tone="info" title="No batches yet">Create a batch before tracking syllabus progress.</Alert>
        ) : loading ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : !data || data.tracked === 0 ? (
          <Alert
            tone="info"
            title="Tracker not set up"
            action={canEdit ? <Button size="sm" onClick={initialise}>Set up tracker</Button> : undefined}
          >
            Seed this batch’s tracker from the chapters and topics of the subjects it is taught.
          </Alert>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{data.batch.name}</CardTitle>
                <span className="text-caption text-fg-muted">
                  {data.overall.completed} of {data.overall.total - data.overall.skipped} topics completed
                  {data.overall.skipped > 0 && ` · ${data.overall.skipped} skipped`}
                </span>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-h1 tabular-nums text-fg">{data.overall.percent.toFixed(0)}%</span>
                  <span className="text-body-sm text-fg-muted">{data.overall.inProgress} in progress</span>
                </div>
                <Progress
                  value={data.overall.completed}
                  max={Math.max(1, data.overall.total - data.overall.skipped)}
                  tone={data.overall.percent >= 80 ? 'success' : 'primary'}
                  aria-label="Overall syllabus completion"
                />
              </CardContent>
            </Card>

            {data.subjects.map((s) => (
              <Card key={s.subject.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>{s.subject.name}</CardTitle>
                    <span className="flex items-center gap-2.5">
                      <span className="font-mono text-body-sm tabular-nums text-fg-secondary">
                        {s.completed}/{s.total}
                      </span>
                      <span className="w-[120px]">
                        <Progress value={s.completed} max={Math.max(1, s.total)} size="sm" aria-label={`${s.subject.name} completion`} />
                      </span>
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {s.chapters.map((c) => {
                    const topics = visible(c.topics);
                    if (!topics.length) return null;
                    return (
                      <div key={c.id} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-h4 text-fg">{c.name}</span>
                          <Badge variant={c.percent === 100 ? 'success' : 'neutral'}>
                            {c.completed}/{c.total}
                          </Badge>
                        </div>
                        <ul className="flex flex-col gap-1">
                          {topics.map((t) => (
                            <li
                              key={t.id}
                              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                            >
                              <span className="flex min-w-0 flex-col">
                                <span className="truncate text-body-sm text-fg">{t.topic.name}</span>
                                <span className="text-caption text-fg-muted">
                                  {t.topic.estimatedHours}h
                                  {t.completedDate && ` · completed ${t.completedDate.slice(0, 10)}`}
                                  {t.faculty && ` · ${t.faculty.name}`}
                                </span>
                              </span>
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => cycle(t)}
                                  disabled={savingId === t.id}
                                  title={`Mark as ${SYLLABUS_STATUS_LABEL[NEXT_STATUS[t.status]]}`}
                                  className="shrink-0 disabled:opacity-50"
                                >
                                  <Badge variant={STATUS_VARIANT[t.status]}>
                                    {savingId === t.id ? '…' : SYLLABUS_STATUS_LABEL[t.status]}
                                  </Badge>
                                </button>
                              ) : (
                                <Badge variant={STATUS_VARIANT[t.status]}>{SYLLABUS_STATUS_LABEL[t.status]}</Badge>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </>
  );
}
