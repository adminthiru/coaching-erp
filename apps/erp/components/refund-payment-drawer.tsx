'use client';

import * as React from 'react';
import { Alert, Button, CurrencyInput, FormModal, FormSection, Textarea, useToast } from '@acadia/ui';
import { formatMinor, toMinor } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';

interface PaymentRow {
  id: string; receiptNumber: string; amountMinor: number; refundedMinor: number;
  student: { id: string; name: string };
}

/** Spec §62 — money received is never deleted; a mistake is corrected by a refund. */
export function RefundPaymentDrawer({
  open, payment, onClose, onRefunded,
}: {
  open: boolean;
  payment: PaymentRow | null;
  onClose: () => void;
  onRefunded: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const refundable = payment ? payment.amountMinor - payment.refundedMinor : 0;

  React.useEffect(() => {
    if (!open || !payment) return;
    setAmount(String(refundable / 100));
    setReason('');
    setErrors({}); setFormError(null);
  }, [open, payment, refundable]);

  const amountMinor = amount ? toMinor(Number(amount)) : 0;
  const over = amountMinor > refundable;
  const complete = amountMinor > 0 && reason.trim().length >= 3 && !over;

  async function submit() {
    if (!payment) return;
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api(`/fee-payments/${payment.id}/refund`, {
        method: 'POST',
        body: { amountMinor, reason: reason.trim() },
      });
      toast({
        kind: 'success',
        title: 'Refund recorded',
        description: `${formatMinor(amountMinor)} returned against ${payment.receiptNumber}.`,
      });
      onRefunded();
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
      title="Refund a payment"
      description={payment ? `${payment.receiptNumber} · ${payment.student.name}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={submit} loading={busy} disabled={!complete}>Record refund</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <Alert tone="warning" title="This does not delete the receipt">
        The original payment stays on the record; the refund is added alongside it, and the student&rsquo;s balance goes back up.
      </Alert>

      <FormSection title="Refund">
        <CurrencyInput
          label="Amount"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amountMinor ?? (over ? `At most ${formatMinor(refundable)} can still be refunded.` : undefined)}
        />
        <Textarea
          label="Reason"
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
          placeholder="Duplicate receipt — collected twice on 12 Aug"
        />
      </FormSection>
    </FormModal>
  );
}
