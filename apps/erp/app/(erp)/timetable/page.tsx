'use client';

import * as React from 'react';
import {
  Alert, Badge, Button, Combobox, ErrorState, PageHeader, Skeleton, useToast,
} from '@acadia/ui';
import { WEEKDAYS } from '@acadia/types';
import { formatClock12 } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { AddSlotDrawer } from '@/components/add-slot-drawer';
import { GenerateSessionsDrawer } from '@/components/generate-sessions-drawer';

interface Slot {
  id: string; dayOfWeek: number; startMinute: number; endMinute: number;
  batch: { id: string; name: string; code: string };
  subject: { id: string; name: string; code: string };
  faculty: { id: string; name: string };
  room: { id: string; name: string; code: string } | null;
  branch: { id: string; name: string; code: string };
}

/** The grid spans the working day; anything outside it would be dead space. */
const DAY_START = 8 * 60;
const DAY_END = 20 * 60;
const PX_PER_MIN = 1.1;

export default function TimetablePage() {
  const { activeBranch, user } = useSession();
  const { toast } = useToast();
  const [batchId, setBatchId] = React.useState<string | null>(null);
  const [facultyId, setFacultyId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN'].includes(user?.role ?? '');

  const { data: batches } = useQuery<{ data: { id: string; name: string; code: string }[] }>('/batches', {
    query: { pageSize: 100, status: 'ACTIVE' },
  });
  const { data: staff } = useQuery<{ data: { id: string; name: string; role: string }[] }>('/staff', {
    query: { pageSize: 100 },
  });

  const { data, error, loading, reload } = useQuery<{ slots: Slot[]; days: { dayOfWeek: number; slots: Slot[] }[] }>(
    '/timetable/slots',
    { query: { batchId: batchId ?? undefined, facultyId: facultyId ?? undefined } },
    [batchId, facultyId],
  );

  async function endSlot(slot: Slot) {
    try {
      await api(`/timetable/slots/${slot.id}`, { method: 'DELETE' });
      toast({ kind: 'success', title: 'Removed from the timetable', description: `${slot.subject.name} on ${WEEKDAYS[slot.dayOfWeek - 1].label}.` });
      reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not remove', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
  }

  const hours = React.useMemo(() => {
    const out: number[] = [];
    for (let m = DAY_START; m <= DAY_END; m += 60) out.push(m);
    return out;
  }, []);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Academic' }, { label: 'Timetable' }]}
        title="Timetable"
        description={
          activeBranch
            ? `Weekly schedule for ${activeBranch.name}.`
            : 'Weekly schedule across every branch you can access.'
        }
        actions={
          canManage ? (
            <>
              <Button variant="outline" onClick={() => setGenerating(true)}>Generate classes</Button>
              <Button onClick={() => setAdding(true)}>Add to timetable</Button>
            </>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="w-full max-w-[240px]">
            <Combobox
              label="Batch"
              placeholder="All batches"
              options={(batches?.data ?? []).map((b) => ({ value: b.id, label: b.name, meta: b.code }))}
              value={batchId}
              onChange={setBatchId}
            />
          </div>
          <div className="w-full max-w-[240px]">
            <Combobox
              label="Faculty"
              placeholder="All faculty"
              options={(staff?.data ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.role.replace(/_/g, ' ').toLowerCase() }))}
              value={facultyId}
              onChange={setFacultyId}
            />
          </div>
          {(batchId || facultyId) && (
            <Button variant="ghost" size="sm" onClick={() => { setBatchId(null); setFacultyId(null); }}>
              Clear filters
            </Button>
          )}
        </div>

        {error ? (
          <ErrorState title="Couldn't load the timetable" description={error.message} onRetry={reload} />
        ) : loading ? (
          <Skeleton className="h-[520px] rounded-lg" />
        ) : (data?.slots ?? []).length === 0 ? (
          <Alert tone="info" title="Nothing scheduled yet">
            {canManage
              ? 'Add a class to build the weekly grid. Conflicts with existing classes, rooms and teachers are checked as you go.'
              : 'No classes have been scheduled for this view.'}
          </Alert>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <div className="min-w-[900px]">
              {/* Day headers */}
              <div className="grid border-b border-border" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
                <div className="border-r border-border bg-surface-secondary" />
                {WEEKDAYS.map((d) => (
                  <div key={d.value} className="border-r border-border bg-surface-secondary px-2 py-2.5 text-center last:border-r-0">
                    <span className="text-th uppercase text-fg-secondary">{d.short}</span>
                  </div>
                ))}
              </div>

              {/* Grid body — absolute positioning by minute keeps overlaps visible
                  rather than collapsing them into a list. */}
              <div className="grid" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
                <div className="relative border-r border-border" style={{ height: (DAY_END - DAY_START) * PX_PER_MIN }}>
                  {hours.map((m) => (
                    <div
                      key={m}
                      className="absolute left-0 right-0 pr-2 text-right text-caption text-fg-muted"
                      style={{ top: (m - DAY_START) * PX_PER_MIN - 7 }}
                    >
                      {formatClock12(m)}
                    </div>
                  ))}
                </div>

                {WEEKDAYS.map((d) => {
                  const slots = data?.days.find((x) => x.dayOfWeek === d.value)?.slots ?? [];
                  return (
                    <div
                      key={d.value}
                      className="relative border-r border-border last:border-r-0"
                      style={{ height: (DAY_END - DAY_START) * PX_PER_MIN }}
                    >
                      {hours.map((m) => (
                        <div
                          key={m}
                          className="absolute left-0 right-0 border-t border-border"
                          style={{ top: (m - DAY_START) * PX_PER_MIN }}
                        />
                      ))}

                      {slots.map((s) => (
                        <div
                          key={s.id}
                          className="absolute left-1 right-1 overflow-hidden rounded-md border border-primary/30 bg-primary-soft px-2 py-1.5"
                          style={{
                            top: (s.startMinute - DAY_START) * PX_PER_MIN,
                            height: Math.max(30, (s.endMinute - s.startMinute) * PX_PER_MIN - 3),
                          }}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="truncate text-[12px] font-semibold text-primary">{s.subject.code}</span>
                            {canManage && (
                              <button
                                type="button"
                                aria-label={`Remove ${s.subject.name} on ${d.label}`}
                                onClick={() => endSlot(s)}
                                className="shrink-0 text-[11px] text-primary/60 hover:text-error"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          <span className="block truncate text-[10.5px] text-fg-secondary">{s.batch.code}</span>
                          <span className="block truncate text-[10.5px] text-fg-muted">
                            {formatClock12(s.startMinute)} · {s.faculty.name.split(' ')[0]}
                            {s.room && ` · ${s.room.name}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {(data?.slots ?? []).length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-fg-muted">
            <span>{data!.slots.length} weekly {data!.slots.length === 1 ? 'class' : 'classes'}</span>
            {!activeBranch && <Badge variant="neutral">All branches</Badge>}
          </div>
        )}
      </div>

      <AddSlotDrawer open={adding} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); reload(); }} />
      <GenerateSessionsDrawer open={generating} onClose={() => setGenerating(false)} />
    </>
  );
}
