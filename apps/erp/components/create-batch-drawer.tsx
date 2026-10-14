'use client';

import * as React from 'react';
import { Alert, Button, Combobox, FormModal, FormRow, FormSection, Input, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Course { id: string; name: string; targetExam: string }
interface Year { id: string; name: string; isCurrent: boolean }

export interface EditableBatch {
  id: string; name: string; code: string; capacity: number; room: string | null;
  startDate: string | null; endDate: string | null;
  course: { id: string }; academicYear: { id: string };
}

/** Branch is omitted when editing — `updateBatchSchema` rejects it, because a
 *  batch belongs to the branch that runs it and moving one is not an edit. */
export function CreateBatchDrawer({
  open, batch, onClose, onCreated,
}: {
  open: boolean;
  batch?: EditableBatch | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const editing = Boolean(batch);
  const { toast } = useToast();
  const { activeBranch, branches } = useSession();
  const { data: courses } = useQuery<Course[]>(open ? '/courses' : null);
  const { data: years } = useQuery<Year[]>(open ? '/academic-years' : null);

  const [form, setForm] = React.useState({ name: '', code: '', room: '', capacity: '60', startDate: '', endDate: '' });
  const [codeTouched, setCodeTouched] = React.useState(false);
  const [courseId, setCourseId] = React.useState<string | null>(null);
  const [yearId, setYearId] = React.useState<string | null>(null);
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm({
      name: batch?.name ?? '', code: batch?.code ?? '', room: batch?.room ?? '',
      capacity: String(batch?.capacity ?? 60),
      startDate: batch?.startDate?.slice(0, 10) ?? '',
      endDate: batch?.endDate?.slice(0, 10) ?? '',
    });
    setCodeTouched(Boolean(batch));
    setCourseId(batch?.course.id ?? null);
    setYearId(batch?.academicYear.id ?? null);
    setErrors({}); setFormError(null);
    setBranchId(activeBranch?.id ?? null);
  }, [open, activeBranch, batch]);

  // Default to the current academic year — the one new batches almost always want.
  React.useEffect(() => {
    if (open && years?.length && !yearId) setYearId((years.find((y) => y.isCurrent) ?? years[0]).id);
  }, [open, years, yearId]);

  React.useEffect(() => {
    if (codeTouched) return;
    setForm((f) => ({ ...f, code: f.name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) }));
  }, [form.name, codeTouched]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const effectiveBranch = branchId ?? activeBranch?.id ?? null;
  const complete = form.name.trim() && form.code.trim() && courseId && yearId && effectiveBranch;

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      const saved = await api<{ name: string }>(batch ? `/batches/${batch.id}` : '/batches', {
        method: batch ? 'PATCH' : 'POST',
        body: {
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          courseId,
          academicYearId: yearId,
          ...(batch ? {} : { branchId: effectiveBranch }),
          capacity: Number(form.capacity) || 60,
          room: form.room.trim() || undefined,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
        },
      });
      toast({
        kind: 'success',
        title: batch ? 'Batch updated' : 'Batch created',
        description: batch ? `${saved.name} was saved.` : `${saved.name} is ready for students.`,
      });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) setFormError(err.message);
      } else setFormError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="md"
      title={editing ? 'Edit batch' : 'New batch'}
      description="A batch runs one course, at one branch, for one academic year."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!complete}>{editing ? 'Save changes' : 'Create batch'}</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}
      {!courses?.length && (
        <Alert tone="warning" title="No courses yet">
          Create a course under Settings before adding a batch.
        </Alert>
      )}

      <FormSection title="Batch">
        <FormRow>
          <Input label="Batch name" required value={form.name} onChange={set('name')} error={errors.name} placeholder="XII-A · NEET" />
          <Input
            label="Batch code"
            required
            value={form.code}
            onChange={(e) => { setCodeTouched(true); setForm((f) => ({ ...f, code: e.target.value.toUpperCase() })); }}
            error={errors.code}
            helperText="Unique within your organization."
            placeholder="XII-A-NEET"
          />
        </FormRow>
        <FormRow>
          <Combobox
            label="Course"
            required
            placeholder="Select a course"
            options={(courses ?? []).map((c) => ({ value: c.id, label: c.name, meta: c.targetExam.replace(/_/g, ' ') }))}
            value={courseId}
            onChange={setCourseId}
            error={errors.courseId}
          />
          <Combobox
            label="Academic year"
            required
            placeholder="Select a year"
            options={(years ?? []).map((y) => ({ value: y.id, label: y.name, meta: y.isCurrent ? 'Current' : undefined }))}
            value={yearId}
            onChange={setYearId}
            error={errors.academicYearId}
          />
        </FormRow>
        {branches.length > 1 && (
          <FormRow>
            <Combobox
              label="Branch"
              required
              placeholder="Select a branch"
              options={branches.map((b) => ({ value: b.id, label: b.name, meta: `${b.code} · ${b.city}` }))}
              value={effectiveBranch}
              onChange={setBranchId}
              error={errors.branchId}
            />
          </FormRow>
        )}
      </FormSection>

      <FormSection title="Capacity & schedule">
        <FormRow>
          <Input
            label="Capacity"
            type="number"
            min={1}
            max={500}
            required
            value={form.capacity}
            onChange={set('capacity')}
            error={errors.capacity}
            helperText="Enrolment is blocked once this is reached."
          />
          <Input label="Room" value={form.room} onChange={set('room')} error={errors.room} placeholder="Room 204" />
        </FormRow>
        <FormRow>
          <Input label="Start date" type="date" value={form.startDate} onChange={set('startDate')} error={errors.startDate} />
          <Input label="End date" type="date" value={form.endDate} onChange={set('endDate')} error={errors.endDate} />
        </FormRow>
      </FormSection>
    </FormModal>
  );
}
