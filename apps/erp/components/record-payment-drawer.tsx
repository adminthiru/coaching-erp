'use client';

import * as React from 'react';
import { Alert, Button, CurrencyInput, FormModal, FormRow, FormSection, Input, Select, Textarea, useToast } from '@acadia/ui';
import { PaymentMethod } from '@acadia/types';
import { formatMinor, toMinor } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';

interface FeeAccount {
  id: string; netMinor: number; paidMinor: number; outstandingMinor: number;
  student: { id: string; name: string; studentCode: string };
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash', UPI: 'UPI', CARD: 'Card', NETBANKING: 'Net banking',
  BANK_TRANSFER: 'Bank transfer', CHEQUE: 'Cheque', MANUAL: 'Other',
};

/** Spec §62 — taking money against a fee account. */
export function RecordPaymentDrawer({
  open, fee, onClose, onRecorded,
}: {
  open: boolean;
  fee: FeeAccount | null;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = React.useState('');
  const [method, setMethod] = React.useState<string>(PaymentMethod.CASH);
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !fee) return;
    // Default to settling the account outright — the common case at a counter.
    setAmount(String(fee.outstandingMinor / 100));
    setMethod(PaymentMethod.CASH);
    setReference(''); setNote('');
    setErrors({}); setFormError(null);
  }, [open, fee]);

  const amountMinor = amount ? toMinor(Number(amount)) : 0;
  const over = fee !== null && amountMinor > fee.outstandingMinor;
  const complete = amountMinor > 0 && !over;

  async function submit() {
    if (!fee) return;
    setBusy(true); setErrors({}); setFormError(null);
    try {
      const payment = await api<{ receiptNumber: string }>('/fee-payments', {
        method: 'POST',
        body: {
          studentFeeId: fee.id,
          amountMinor,
          method,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
        },
      });
      toast({
        kind: 'success',
        title: `Receipt ${payment.receiptNumber}`,
        description: `${formatMinor(amountMinor)} received from ${fee.student.name}.`,
      });
      onRecorded();
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
      title="Record a payment"
      description={fee ? `${fee.student.name} · ${fee.student.studentCode}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!complete}>Record payment</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      {fee && (
        <div className="flex items-center justify-between rounded-md border border-border bg-surface-secondary px-3.5 py-2.5">
          <span className="text-body-sm text-fg-secondary">Outstanding</span>
          <span className="font-mono text-h3 tabular-nums text-fg">{formatMinor(fee.outstandingMinor)}</span>
        </div>
      )}

      <FormSection title="Payment">
        <FormRow>
          <CurrencyInput
            label="Amount"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={errors.amountMinor ?? (over ? 'More than is outstanding.' : undefined)}
          />
          <Select
            label="Method"
            options={Object.values(PaymentMethod).map((m) => ({ value: m, label: METHOD_LABEL[m] ?? m }))}
            value={method}
            onChange={setMethod}
          />
        </FormRow>
        <Input
          label="Reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          error={errors.reference}
          helperText="UPI ref, cheque number, transaction id."
        />
        <Textarea label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} />
      </FormSection>
    </FormModal>
  );
}
