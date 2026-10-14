'use client';

import * as React from 'react';
import { Alert, Button, Combobox, FormModal, FormRow, FormSection, Input, Segmented, useToast } from '@acadia/ui';
import { WEEKDAYS, type ScheduleConflict } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useDebounced, useQuery } from '@/lib/hooks';

const CONFLICT_COPY: Record<string, string> = {
  FACULTY: 'Teacher already booked',
  FACULTY_CROSS_BRANCH: 'Teacher booked at another branch',
  ROOM: 'Room already occupied',
  BATCH: 'Batch already has a class',
};

/**
 * Spec §46. Conflicts are checked live as the form is filled, so the clash is
 * visible before the user commits — the API re-checks on save regardless.
 */
export function AddSlotDrawer({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { data: batches } = useQuery<{ data: { id: string; name: string; code: string; branch: { id: string } }[] }>(
    open ? '/batches' : null, { query: { pageSize: 100, status: 'ACTIVE' } },
  );
  const { data: subjects } = useQuery<{ id: string; name: string; code: string }[]>(open ? '/subjects' : null);
  const { data: staff } = useQuery<{ data: { id: string; name: string; role: string }[] }>(
    open ? '/staff' : null, { query: { pageSize: 100 } },
  );
  const { data: rooms } = useQuery<{ id: string; name: string; code: string; capacity: number; branch: { id: string } }[]>(
    open ? '/rooms' : null,
  );

  const [batchId, setBatchId] = React.useState<string | null>(null);
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [facultyId, setFacultyId] = React.useState<string | null>(null);
  const [roomId, setRoomId] = React.useState<string | null>(null);
  const [dayOfWeek, setDayOfWeek] = React.useState('1');
  const [startTime, setStartTime] = React.useState('09:00');
  const [endTime, setEndTime] = React.useState('10:30');
  const [effectiveFrom, setEffectiveFrom] = React.useState('');
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[]>([]);
  const [checking, setChecking] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setBatchId(null); setSubjectId(null); setFacultyId(null); setRoomId(null);
    setDayOfWeek('1'); setStartTime('09:00'); setEndTime('10:30');
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
    setConflicts([]); setErrors({}); setFormError(null);
  }, [open]);

  const batch = batches?.data.find((b) => b.id === batchId);
  const branchRooms = (rooms ?? []).filter((r) => r.branch.id === batch?.branch.id);

  // A room at another branch is invalid the moment the batch changes.
  React.useEffect(() => { setRoomId(null); }, [batchId]);

  const complete = Boolean(batchId && subjectId && facultyId && startTime && endTime && effectiveFrom);
  const payload = React.useMemo(
    () => ({ batchId, subjectId, facultyId, roomId, dayOfWeek: Number(dayOfWeek), startTime, endTime, effectiveFrom }),
    [batchId, subjectId, facultyId, roomId, dayOfWeek, startTime, endTime, effectiveFrom],
  );
  const debouncedPayload = useDebounced(JSON.stringify(payload), 500);

  React.useEffect(() => {
    if (!open || !complete) { setConflicts([]); return; }
    let live = true;
    setChecking(true);
    api<{ ok: boolean; conflicts: ScheduleConflict[] }>('/timetable/slots/check', {
      method: 'POST',
      body: JSON.parse(debouncedPayload),
    })
      .then((r) => { if (live) setConflicts(r.conflicts); })
      // A failed pre-check must not block the form; save re-validates anyway.
      .catch(() => { if (live) setConflicts([]); })
      .finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, [open, complete, debouncedPayload]);

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api('/timetable/slots', { method: 'POST', body: payload });
      toast({ kind: 'success', title: 'Added to the timetable', description: `${WEEKDAYS[Number(dayOfWeek) - 1].label} ${startTime}–${endTime}.` });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'SCHEDULE_CONFLICT') {
          setConflicts((err.details as any)?.conflicts ?? []);
          setFormError('This clashes with the schedule below.');
        } else {
          setErrors(err.fieldErrors);
          if (!Object.keys(err.fieldErrors).length) setFormError(err.message);
        }
      } else setFormError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="lg"
      title="Add to timetable"
      description="Recurs weekly from the start date."
      onSubmit={submit}
      submitLabel={conflicts.length > 0 ? 'Resolve the clash' : 'Add class'}
      canSubmit={complete && conflicts.length === 0}
      busy={busy}
      banner={formError ? <Alert tone="error">{formError}</Alert> : undefined}
      steps={[
        {
          label: 'Class',
          hint: 'Which batch, subject and teacher.',
          canContinue: Boolean(batchId && subjectId && facultyId),
          content: (
            <FormSection title="Class">
        <FormRow>
          <Combobox
            label="Batch"
            required
            placeholder="Select a batch"
            options={(batches?.data ?? []).map((b) => ({ value: b.id, label: b.name, meta: b.code }))}
            value={batchId}
            onChange={setBatchId}
            error={errors.batchId}
          />
          <Combobox
            label="Subject"
            required
            placeholder="Select a subject"
            options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.code }))}
            value={subjectId}
            onChange={setSubjectId}
            error={errors.subjectId}
          />
        </FormRow>
        <FormRow>
          <Combobox
            label="Faculty"
            required
            placeholder="Select a teacher"
            options={(staff?.data ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.role.replace(/_/g, ' ').toLowerCase() }))}
            value={facultyId}
            onChange={setFacultyId}
            error={errors.facultyId}
          />
          <Combobox
            label="Room"
            placeholder={batch ? (branchRooms.length ? 'No room' : 'No rooms at this branch') : 'Pick a batch first'}
            options={branchRooms.map((r) => ({ value: r.id, label: r.name, meta: `${r.code} · seats ${r.capacity}` }))}
            value={roomId}
            onChange={setRoomId}
            error={errors.roomId}
          />
        </FormRow>
            </FormSection>
          ),
        },
        {
          label: 'When',
          hint: 'The weekly slot, and when it starts running.',
          content: (
            <>
            <FormSection title="When">
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-fg">Day</span>
          <Segmented
            options={WEEKDAYS.map((d) => ({ value: String(d.value), label: d.short }))}
            value={dayOfWeek}
            onChange={setDayOfWeek}
            size="sm"
            aria-label="Day of week"
          />
        </div>
        <FormRow className="mt-4">
          <Input label="Starts" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} error={errors.startTime} />
          <Input label="Ends" type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} error={errors.endTime} />
          <Input label="From date" type="date" required value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} error={errors.effectiveFrom} />
        </FormRow>
            </FormSection>

      {checking && <span className="text-caption text-fg-muted">Checking for clashes…</span>}

      {conflicts.length > 0 && (
        <Alert tone="error" title={`${conflicts.length} scheduling ${conflicts.length === 1 ? 'clash' : 'clashes'}`}>
          <ul className="flex flex-col gap-2">
            {conflicts.map((c, i) => (
              <li key={i} className="flex flex-col gap-0.5">
                <span className="text-body-sm font-semibold text-fg">{CONFLICT_COPY[c.kind] ?? c.kind}</span>
                <span className="text-caption">{c.message}</span>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {complete && !checking && conflicts.length === 0 && (
        <Alert tone="success">No clashes — this slot is free for the batch, the teacher and the room.</Alert>
      )}
            </>
          ),
        },
      ]}
    />
  );
}
