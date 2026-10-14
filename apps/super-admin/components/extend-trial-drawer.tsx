'use client';

import * as React from 'react';
import { Alert, Button, FormModal, Input, RadioGroup, Textarea, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';

const PRESETS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: 'custom', label: 'Custom' },
];

/** Spec §17 — extensions always carry a reason, and land in the trial history. */
export function ExtendTrialDrawer({
  open, organizationId, currentEndsAt, onClose, onDone,
}: {
  open: boolean;
  organizationId: string;
  currentEndsAt: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [preset, setPreset] = React.useState('14');
  const [custom, setCustom] = React.useState('21');
  const [reason, setReason] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPreset('14'); setCustom('21'); setReason(''); setErrors({}); setFormError(null);
  }, [open]);

  const days = preset === 'custom' ? Number(custom) : Number(preset);
  const valid = Number.isFinite(days) && days >= 1 && days <= 180 && reason.trim().length >= 4;

  // Extensions run from today when the trial has already lapsed, matching the API.
  const base = currentEndsAt && new Date(currentEndsAt) > new Date() ? new Date(currentEndsAt) : new Date();
  const newEnd = Number.isFinite(days) ? new Date(base.getTime() + days * 864e5) : null;

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api(`/platform/organizations/${organizationId}/extend-trial`, {
        method: 'POST',
        body: { days, reason: reason.trim() },
      });
      toast({ kind: 'success', title: 'Trial extended', description: `Now ends ${newEnd?.toISOString().slice(0, 10)}.` });
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
      title="Extend trial"
      description="Recorded in the trial history and the audit log."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!valid}>Extend trial</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <Alert tone="info">
        {currentEndsAt
          ? `Currently ends ${currentEndsAt.slice(0, 10)}.`
          : 'This organization is not on a trial — extending will start one.'}
      </Alert>

      <RadioGroup
        name="extend-days"
        label="Extend by"
        options={PRESETS}
        value={preset}
        onChange={setPreset}
      />

      {preset === 'custom' && (
        <Input
          label="Days"
          type="number"
          min={1}
          max={180}
          required
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          error={errors.days}
          helperText="Between 1 and 180 days."
        />
      )}

      <Textarea
        label="Reason"
        required
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={errors.reason}
        helperText="Why is this trial being extended? Stored in the audit log."
        placeholder="Customer is still evaluating with their Chennai branch."
      />

      {newEnd && valid && (
        <Alert tone="success">The trial will end on {newEnd.toISOString().slice(0, 10)}.</Alert>
      )}
    </FormModal>
  );
}
