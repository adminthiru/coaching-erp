'use client';

import * as React from 'react';
import {
  Alert, Badge, Button, DataTable, Dropdown, EmptyState, ErrorState, MetricCard, PageHeader,
  SearchInput, Segmented, Skeleton, type Column,
} from '@acadia/ui';
import {
  ENQUIRY_PIPELINE, ENQUIRY_SOURCE_LABEL, ENQUIRY_STAGE_LABEL, TARGET_EXAM_LABEL,
  type EnquirySource, type EnquiryStage, type TargetExam,
} from '@acadia/types';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { CreateEnquiryDrawer } from '@/components/create-enquiry-drawer';
import { MoveStageDrawer } from '@/components/move-stage-drawer';
import { ConvertEnquiryDrawer } from '@/components/convert-enquiry-drawer';

interface EnquiryRow {
  id: string; enquiryCode: string; studentName: string; phone: string;
  stage: EnquiryStage; source: EnquirySource; targetExam: TargetExam;
  nextFollowUpAt: string | null; overdue: boolean; createdAt: string;
  branch: { id: string; name: string; code: string };
  assignedTo: { id: string; name: string } | null;
  convertedStudent: { id: string; studentCode: string } | null;
}

interface Pipeline {
  counts: Partial<Record<EnquiryStage, number>>;
  total: number;
  overdue: number;
  conversionRate: number;
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

/** Stage → badge colour. Terminal stages read success (won) and neutral (closed). */
const STAGE_VARIANT: Record<EnquiryStage, 'neutral' | 'info' | 'primary' | 'warning' | 'success' | 'error'> = {
  NEW: 'info',
  CONTACTED: 'info',
  COUNSELLING: 'primary',
  TRIAL: 'primary',
  FOLLOW_UP: 'warning',
  ADMITTED: 'success',
  LOST: 'neutral',
};

export default function AdmissionsPage() {
  const { activeBranch, user } = useSession();
  const [stage, setStage] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [onlyOverdue, setOnlyOverdue] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<any>(null);
  const [moving, setMoving] = React.useState<EnquiryRow | null>(null);
  const [converting, setConverting] = React.useState<EnquiryRow | null>(null);
  const debounced = useDebounced(search);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN', 'COUNSELLOR'].includes(user?.role ?? '');

  React.useEffect(() => { setPage(1); }, [debounced, stage, onlyOverdue]);

  const pipeline = useQuery<Pipeline>('/admissions/pipeline');
  const { data, error, loading, reload } = useQuery<Page<EnquiryRow>>('/admissions/enquiries', {
    query: {
      page, pageSize: 25,
      search: debounced || undefined,
      stage: stage === 'all' ? undefined : stage,
      overdue: onlyOverdue ? 'true' : undefined,
    },
  });

  function refreshAll() {
    reload();
    pipeline.reload();
  }

  const columns: Column<EnquiryRow>[] = [
    {
      key: 'studentName',
      header: 'Enquiry',
      sortable: true,
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{r.studentName}</span>
          <span className="truncate text-caption text-fg-muted">
            <span className="font-mono">{r.enquiryCode}</span> · {r.phone}
          </span>
        </div>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      sortable: true,
      mobile: 'secondary',
      cell: (r) => <Badge variant={STAGE_VARIANT[r.stage]}>{ENQUIRY_STAGE_LABEL[r.stage]}</Badge>,
    },
    {
      key: 'targetExam',
      header: 'Target',
      cell: (r) => <span className="text-fg-secondary">{TARGET_EXAM_LABEL[r.targetExam] ?? r.targetExam}</span>,
    },
    {
      key: 'source',
      header: 'Source',
      cell: (r) => <span className="text-fg-secondary">{ENQUIRY_SOURCE_LABEL[r.source] ?? r.source}</span>,
    },
    {
      key: 'nextFollowUpAt',
      header: 'Follow-up',
      sortable: true,
      mobile: 'secondary',
      cell: (r) =>
        r.nextFollowUpAt ? (
          <span className={r.overdue ? 'font-semibold text-error' : 'text-fg-secondary'}>
            {r.nextFollowUpAt.slice(0, 10)}{r.overdue && ' · overdue'}
          </span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    {
      key: 'assignedTo',
      header: 'Counsellor',
      mobile: 'meta',
      cell: (r) => <span className="text-fg-secondary">{r.assignedTo?.name ?? 'Unassigned'}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Academic' }, { label: 'Admissions' }]}
        title="Admissions"
        description={
          activeBranch ? `Enquiries for ${activeBranch.name}.` : 'Enquiries across every branch you can access.'
        }
        actions={canManage ? <Button onClick={() => setCreating(true)}>New enquiry</Button> : undefined}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {pipeline.data && pipeline.data.overdue > 0 && (
          <Alert
            tone="warning"
            title={`${pipeline.data.overdue} follow-up${pipeline.data.overdue === 1 ? '' : 's'} overdue`}
            action={
              <Button size="sm" variant="outline" onClick={() => { setOnlyOverdue(true); setStage('all'); }}>
                Show them
              </Button>
            }
          >
            These enquiries have a follow-up date in the past.
          </Alert>
        )}

        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {pipeline.loading || !pipeline.data ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-lg" />)
          ) : (
            <>
              <MetricCard title="Total enquiries" value={String(pipeline.data.total)} description="in your scope" />
              <MetricCard
                title="In pipeline"
                value={String(
                  ENQUIRY_PIPELINE.filter((s) => s !== 'ADMITTED' && s !== 'LOST')
                    .reduce((sum, s) => sum + (pipeline.data!.counts[s] ?? 0), 0),
                )}
                description="still being worked"
              />
              <MetricCard
                title="Admitted"
                value={String(pipeline.data.counts.ADMITTED ?? 0)}
                description="converted to students"
              />
              <MetricCard
                title="Conversion"
                value={`${pipeline.data.conversionRate.toFixed(0)}%`}
                description="of closed enquiries"
              />
            </>
          )}
        </div>

        {/* The pipeline as a row of stage counts — spec §38's stage list, in order. */}
        {pipeline.data && (
          <div className="flex flex-wrap gap-2">
            {ENQUIRY_PIPELINE.map((s) => {
              const count = pipeline.data!.counts[s] ?? 0;
              const active = stage === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setStage(active ? 'all' : s); setOnlyOverdue(false); }}
                  aria-pressed={active}
                  className={
                    active
                      ? 'flex items-center gap-2 rounded-md border border-primary bg-primary-soft px-3 py-2 text-[12.5px] font-semibold text-primary'
                      : 'flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] text-fg-secondary transition-colors hover:border-border-strong hover:text-fg'
                  }
                >
                  {ENQUIRY_STAGE_LABEL[s]}
                  <span className="font-mono tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {error ? (
          <ErrorState title="Couldn't load enquiries" description={error.message} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            getRowId={(r) => r.id}
            loading={loading}
            toolbar={
              <div className="flex w-full flex-wrap items-center gap-2.5">
                <div className="w-full max-w-[280px]">
                  <SearchInput
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, phone or code…"
                  />
                </div>
                <Segmented
                  options={[{ value: 'all', label: 'All' }, { value: 'overdue', label: 'Overdue only' }]}
                  value={onlyOverdue ? 'overdue' : 'all'}
                  onChange={(v) => setOnlyOverdue(v === 'overdue')}
                  size="sm"
                  aria-label="Filter follow-ups"
                />
              </div>
            }
            rowActions={
              canManage
                ? (row) => (
                    <Dropdown
                      heading={row.studentName}
                      trigger={<Button size="sm" variant="ghost" iconOnly aria-label={`Actions for ${row.studentName}`}>⋯</Button>}
                      items={
                        row.stage === 'ADMITTED'
                          ? [{ label: 'View student', onSelect: () => { window.location.href = `/students/${row.convertedStudent?.id}`; } }]
                          : [
                              { label: 'Edit enquiry', onSelect: () => setEditing(row) },
                        { label: 'Move stage', onSelect: () => setMoving(row) },
                              { label: 'Convert to student', onSelect: () => setConverting(row) },
                            ]
                      }
                    />
                  )
                : undefined
            }
            empty={
              <EmptyState
                title={debounced || stage !== 'all' || onlyOverdue ? 'No matching enquiries' : 'No enquiries yet'}
                description={
                  debounced || stage !== 'all' || onlyOverdue
                    ? 'Try a different search or clear the filters.'
                    : 'Log your first enquiry to start the admissions pipeline.'
                }
                action={canManage && !debounced && stage === 'all' ? <Button onClick={() => setCreating(true)}>New enquiry</Button> : undefined}
              />
            }
            pagination={
              data
                ? { page: data.meta.page, pageCount: data.meta.pageCount, onChange: setPage, summary: `${data.meta.total} enquir${data.meta.total === 1 ? 'y' : 'ies'}` }
                : undefined
            }
          />
        )}
      </div>

      <CreateEnquiryDrawer open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refreshAll(); }} />

      <CreateEnquiryDrawer
        open={editing !== null}
        enquiry={editing}
        onClose={() => setEditing(null)}
        onCreated={() => { setEditing(null); refreshAll(); }}
      />
      <MoveStageDrawer open={moving !== null} enquiry={moving} onClose={() => setMoving(null)} onDone={() => { setMoving(null); refreshAll(); }} />
      <ConvertEnquiryDrawer open={converting !== null} enquiry={converting} onClose={() => setConverting(null)} onDone={() => { setConverting(null); refreshAll(); }} />
    </>
  );
}
