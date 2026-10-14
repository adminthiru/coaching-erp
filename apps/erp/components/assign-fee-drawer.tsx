'use client';

import * as React from 'react';
import {
  Alert, Button, Combobox, CurrencyInput, FormModal, FormSection, Input, Switch, Textarea, useToast,
} from '@acadia/ui';
import { formatMinor, toMinor } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface StudentOption { id: string; name: string; studentCode: string }
interface StructureOption { id: string; name: string; totalMinor: number; scope: string }
interface Row { label: string; amount: string; dueDate: string }

/** Spec §61 — assigning a structure to a student, optionally in installments. */
export function AssignFeeDrawer({
  open, studentId, onClose, onAssigned,
}: {
  open: boolean;
  /** Pre-selects the student when opened from their fee page. */
  studentId?: string;
  onClose: () => void;
  onAssigned: (id: string) => void;
}) {
  const { toast } = useToast();
  const { data: studentPage } = useQuery<{ data: StudentOption[] }>(open && !studentId ? '/students' : null, { query: { pageSize: 200, status: 'ACTIVE' } });
  const { data: structurePage } = useQuery<{ data: StructureOption[] }>(open ? '/fee-structures' : null, { query: { pageSize: 200 } });

  const [selectedStudent, setSelectedStudent] = React.useState<string | null>(null);
  const [structureId, setStructureId] = React.useState<string | null>(null);
  const [note, setNote] = React.useState('');
  const [scheduled, setScheduled] = React.useState(false);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSelectedStudent(studentId ?? null);
    setStructureId(null); setNote(''); setScheduled(false); setRows([]);
    setErrors({}); setFormError(null);
  }, [open, studentId]);

  const structure = (structurePage?.data ?? []).find((s) => s.id === structureId) ?? null;
  const scheduledMinor = rows.reduce((sum, r) => sum + (r.amount ? toMinor(Number(r.amount)) : 0), 0);
  const balanced = !scheduled || (structure !== null && scheduledMinor === structure.totalMinor);

  // Two equal installments is the shape most centres actually use, so offering
  // it saves the common case rather than starting from an empty table.
  React.useEffect(() => {
    if (!scheduled || !structure || rows.length) return;
    const half = Math.floor(structure.totalMinor / 2);
    const today = new Date();
    const later = new Date(today.getTime() + 90 * 864e5);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    setRows([
      { label: 'Installment 1', amount: String(half / 100), dueDate: iso(today) },
      { label: 'Installment 2', amount: String((structure.totalMinor - half) / 100), dueDate: iso(later) },
    ]);
  }, [scheduled, structure, rows.length]);

  const complete = Boolean(selectedStudent) && Boolean(structureId) && balanced;

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      const fee = await api<{ id: string }>('/fees/assign', {
        method: 'POST',
        body: {
          studentId: selectedStudent,
          feeStructureId: structureId,
          note: note.trim() || undefined,
          installments: scheduled
            ? rows.filter((r) => r.label.trim() && Number(r.amount) > 0).map((r) => ({
                label: r.label.trim(), amountMinor: toMinor(Number(r.amount)), dueDate: r.dueDate,
              }))
            : [],
        },
      });
      toast({ kind: 'success', title: 'Fee assigned', description: structure ? formatMinor(structure.totalMinor) : undefined });
      onAssigned(fee.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) setFormError(err.message);
      } else setFormError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="lg"
      title="Assign a fee"
      description="The structure's amounts are copied onto this student now."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!complete}>Assign fee</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <FormSection title="Account">
        {!studentId && (
          <Combobox
            label="Student"
            required
            placeholder="Search by name or code"
            options={(studentPage?.data ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.studentCode }))}
            value={selectedStudent}
            onChange={setSelectedStudent}
            error={errors.studentId}
          />
        )}
        <Combobox
          label="Fee structure"
          required
          placeholder="Pick a structure"
          options={(structurePage?.data ?? []).map((s) => ({ value: s.id, label: s.name, meta: formatMinor(s.totalMinor) }))}
          value={structureId}
          onChange={setStructureId}
          error={errors.feeStructureId}
        />
        {structure && (
          <div className="flex items-center justify-between rounded-md border border-border bg-surface-secondary px-3.5 py-2.5">
            <span className="text-body-sm text-fg-secondary">Total payable</span>
            <span className="font-mono text-h3 tabular-nums text-fg">{formatMinor(structure.totalMinor)}</span>
          </div>
        )}
        <Textarea label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} />
      </FormSection>

      <FormSection title="Schedule">
        <Switch
          label="Pay in installments"
          description="Payments clear the most overdue installment first. Off means the whole amount is due at once."
          checked={scheduled}
          onChange={setScheduled}
        />

        {scheduled && (
          <>
            <div className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Input aria-label="Label" className="flex-1" placeholder="Installment 1" value={r.label} onChange={(e) => update(i, { label: e.target.value })} />
                  <CurrencyInput aria-label="Amount" className="w-[130px]" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} />
                  <Input aria-label="Due date" type="date" className="w-[150px]" value={r.dueDate} onChange={(e) => update(i, { dueDate: e.target.value })} />
                  <Button size="sm" variant="ghost" onClick={() => setRows((prev) => prev.filter((_, ri) => ri !== i))}>Remove</Button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => setRows((prev) => [...prev, { label: `Installment ${prev.length + 1}`, amount: '', dueDate: '' }])}>
              Add installment
            </Button>

            {structure && (
              <Alert tone={balanced ? 'info' : 'warning'}>
                Scheduled {formatMinor(scheduledMinor)} of {formatMinor(structure.totalMinor)}.
                {!balanced && ' The schedule must add up to the full fee.'}
              </Alert>
            )}
          </>
        )}
      </FormSection>
    </FormModal>
  );
}
