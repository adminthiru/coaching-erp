'use client';

import * as React from 'react';
import { Alert, Button, Combobox, FormModal, FormRow, Input, Segmented, Textarea, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

/** Spec §48 — one form for both student and faculty leave. */
export function RequestLeaveDrawer({
  open, onClose, onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [subjectType, setSubjectType] = React.useState<'STUDENT' | 'FACULTY'>('STUDENT');
  const [personId, setPersonId] = React.useState<string | null>(null);
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const students = useQuery<{ data: { id: string; name: string; studentCode: string }[] }>(
    open && subjectType === 'STUDENT' ? '/students' : null,
    { query: { pageSize: 100, status: 'ACTIVE' } },
    [subjectType],
  );
  const staff = useQuery<{ data: { id: string; name: string; role: string }[] }>(
    open && subjectType === 'FACULTY' ? '/staff' : null,
    { query: { pageSize: 100 } },
    [subjectType],
  );

  React.useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10);
    setSubjectType('STUDENT'); setPersonId(null);
    setFromDate(today); setToDate(today); setReason('');
    setErrors({}); setFormError(null);
  }, [open]);

  // Switching between student and faculty invalidates the person already picked.
  React.useEffect(() => { setPersonId(null); }, [subjectType]);

  const options =
    subjectType === 'STUDENT'
      ? (students.data?.data ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.studentCode }))
      : (staff.data?.data ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.role.replace(/_/g, ' ').toLowerCase() }));

  const valid = Boolean(personId && fromDate && toDate && reason.trim().length >= 4 && fromDate <= toDate);

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api('/leave', {
        method: 'POST',
        body: {
          subjectType,
          ...(subjectType === 'STUDENT' ? { studentId: personId } : { facultyId: personId }),
          fromDate,
          toDate,
          reason: reason.trim(),
        },
      });
      toast({ kind: 'success', title: 'Leave requested', description: 'It is now awaiting approval.' });
      onDone();
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
      title="Request leave"
      description="Approved leave marks the covered classes as excused."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!valid}>Submit request</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <div className="flex flex-col gap-1.5">
        <span className="text-label text-fg">Leave for</span>
        <Segmented
          options={[{ value: 'STUDENT', label: 'Student' }, { value: 'FACULTY', label: 'Faculty' }]}
          value={subjectType}
          onChange={(v) => setSubjectType(v as 'STUDENT' | 'FACULTY')}
          fullWidth
          aria-label="Leave subject"
        />
      </div>

      <Combobox
        label={subjectType === 'STUDENT' ? 'Student' : 'Staff member'}
        required
        placeholder={`Select a ${subjectType === 'STUDENT' ? 'student' : 'staff member'}`}
        options={options}
        value={personId}
        onChange={setPersonId}
        error={errors.studentId ?? errors.facultyId}
      />

      <FormRow>
        <Input label="From" type="date" required value={fromDate} onChange={(e) => setFromDate(e.target.value)} error={errors.fromDate} />
        <Input label="To" type="date" required min={fromDate} value={toDate} onChange={(e) => setToDate(e.target.value)} error={errors.toDate} />
      </FormRow>

      <Textarea
        label="Reason"
        required
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={errors.reason}
        placeholder="Family wedding out of town."
      />

      {fromDate && toDate && fromDate <= toDate && (
        <Alert tone="info">
          {Math.round((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 864e5) + 1} day
          {fromDate === toDate ? '' : 's'} of leave.
        </Alert>
      )}
    </FormModal>
  );
}
