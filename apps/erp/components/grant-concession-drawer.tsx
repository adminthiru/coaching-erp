'use client';

import * as React from 'react';
import { Alert, Button, CurrencyInput, FormModal, FormSection, RadioGroup, Textarea, useToast } from '@acadia/ui';
import { CONCESSION_KIND_LABEL, ConcessionKind, type ConcessionKind as Kind } from '@acadia/types';
import { formatMinor, toMinor } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';

interface FeeAccount {
  id: string; grossMinor: number; discountMinor: number; netMinor: number;
  student: { id: string; name: string };
}

/** Spec §61 — scholarships and discounts, recorded with a reason that survives. */
export function GrantConcessionDrawer({
  open, fee, onClose, onGranted,
}: {
  open: boolean;
  fee: FeeAccount | null;
  onClose: () => void;
  onGranted: () => void;
}) {
  const { toast } = useToast();
  const [kind, setKind] = React.useState<Kind>(ConcessionKind.DISCOUNT);
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setKind(ConcessionKind.DISCOUNT); setAmount(''); setReason('');
    setErrors({}); setFormError(null);
  }, [open]);

  const amountMinor = amount ? toMinor(Number(amount)) : 0;
  const headroom = fee ? fee.grossMinor - fee.discountMinor : 0;
  const over = amountMinor > headroom;
  const complete = amountMinor > 0 && reason.trim().length >= 3 && !over;

  async function submit() {
    if (!fee) return;
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api(`/fees/${fee.id}/concessions`, {
        method: 'POST',
        body: { kind, amountMinor, reason: reason.trim() },
      });
      toast({
        kind: 'success',
        title: `${CONCESSION_KIND_LABEL[kind]} applied`,
        description: `${formatMinor(amountMinor)} off ${fee.student.name}'s fee.`,
      });
      onGranted();
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
      title="Apply a concession"
      description={fee ? `Reduces what ${fee.student.name} owes. The record of who and why is kept permanently.` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!complete}>Apply concession</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      {fee && (
        <div className="flex items-center justify-between rounded-md border border-border bg-surface-secondary px-3.5 py-2.5">
          <span className="text-body-sm text-fg-secondary">Currently payable</span>
          <span className="font-mono text-h3 tabular-nums text-fg">{formatMinor(fee.netMinor)}</span>
        </div>
      )}

      <FormSection title="Concession">
        <RadioGroup
          name="kind"
          variant="card"
          options={[
            { value: ConcessionKind.DISCOUNT, label: CONCESSION_KIND_LABEL.DISCOUNT, description: 'A negotiated reduction.' },
            { value: ConcessionKind.SCHOLARSHIP, label: CONCESSION_KIND_LABEL.SCHOLARSHIP, description: 'Awarded on merit or need.' },
            { value: ConcessionKind.WAIVER, label: CONCESSION_KIND_LABEL.WAIVER, description: 'Written off entirely.' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <CurrencyInput
          label="Amount"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amountMinor ?? (over ? `At most ${formatMinor(headroom)} can still be taken off.` : undefined)}
        />
        <Textarea
          label="Reason"
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
          placeholder="Merit scholarship — 96.4% in board exams"
        />
      </FormSection>
    </FormModal>
  );
}
