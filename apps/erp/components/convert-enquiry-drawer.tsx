'use client';

import * as React from 'react';
import { Alert, Button, Combobox, FormModal, FormRow, Input, Select, useToast } from '@acadia/ui';
import { GENDER_LABEL, type Gender } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface BatchOption {
  id: string; name: string; code: string; seatsLeft: number; full: boolean;
  branch: { id: string };
}

/**
 * Spec §38 — admission conversion. The student is created from the enquiry's own
 * details, so nothing has to be retyped; only what the enquiry could not know is
 * asked for here.
 */
export function ConvertEnquiryDrawer({
  open, enquiry, onClose, onDone,
}: {
  open: boolean;
  enquiry: { id: string; studentName: string; enquiryCode: string; branch: { id: string; name: string } } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { data: batchPage } = useQuery<{ data: BatchOption[] }>(open ? '/batches' : null, {
    query: { pageSize: 100, status: 'ACTIVE' },
  });

  const [batchId, setBatchId] = React.useState<string | null>(null);
  const [gender, setGender] = React.useState<Gender>('UNDISCLOSED');
  const [dateOfBirth, setDateOfBirth] = React.useState('');
  const [admissionDate, setAdmissionDate] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setBatchId(null); setGender('UNDISCLOSED'); setDateOfBirth('');
    setAdmissionDate(new Date().toISOString().slice(0, 10));
    setErrors({}); setFormError(null);
  }, [open]);

  // The student lands in the enquiry's branch, so only that branch's batches apply.
  const batches = (batchPage?.data ?? []).filter((b) => b.branch.id === enquiry?.branch.id);

  async function submit() {
    if (!enquiry) return;
    setBusy(true); setErrors({}); setFormError(null);
    try {
      const result = await api<{ student: { studentCode: string; name: string } }>(
        `/admissions/enquiries/${enquiry.id}/convert`,
        {
          method: 'POST',
          body: {
            batchId: batchId ?? undefined,
            gender,
            dateOfBirth: dateOfBirth || undefined,
            admissionDate: admissionDate || undefined,
          },
        },
      );
      toast({
        kind: 'success',
        title: 'Enquiry converted',
        description: `${result.student.name} admitted as ${result.student.studentCode}.`,
      });
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
      title="Convert to student"
      description={enquiry ? `Admitting ${enquiry.studentName} at ${enquiry.branch.name}.` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Admit student</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <Alert tone="info" title="What happens">
        The enquiry is marked admitted and linked to a new student record. Name, phone,
        parent contact, target exam and course carry over from the enquiry.
      </Alert>

      <FormRow>
        <Input
          label="Admission date"
          type="date"
          value={admissionDate}
          onChange={(e) => setAdmissionDate(e.target.value)}
          error={errors.admissionDate}
        />
        <Input
          label="Date of birth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          error={errors.dateOfBirth}
        />
      </FormRow>

      <FormRow>
        <Select
          label="Gender"
          options={(Object.keys(GENDER_LABEL) as Gender[]).map((g) => ({ value: g, label: GENDER_LABEL[g] }))}
          value={gender}
          onChange={(v) => setGender(v as Gender)}
        />
      </FormRow>

      <Combobox
        label="Batch"
        placeholder={batches.length ? 'Assign later' : 'No active batch at this branch'}
        options={batches.map((b) => ({
          value: b.id,
          label: b.name,
          meta: b.full ? 'Full' : `${b.seatsLeft} seats left`,
          disabled: b.full,
        }))}
        value={batchId}
        onChange={setBatchId}
        error={errors.batchId}
        helperText="Optional — the student can be batched later."
      />
    </FormModal>
  );
}
