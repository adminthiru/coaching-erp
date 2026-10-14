'use client';

import * as React from 'react';
import { Alert, Button, FormModal, Input, RadioGroup, Segmented, Switch, useToast } from '@acadia/ui';
import { formatMinor } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface Plan {
  id: string;
  name: string;
  description: string | null;
  monthlyPriceMinor: number;
  annualPriceMinor: number;
  status: string;
}

/** Spec §19 — upgrade/downgrade, applied now or deferred to the renewal date. */
export function ChangePlanDrawer({
  open, organizationId, currentPlanId, onClose, onDone,
}: {
  open: boolean;
  organizationId: string;
  currentPlanId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { data: plans } = useQuery<Plan[]>(open ? '/platform/plans' : null);

  const [planId, setPlanId] = React.useState<string | null>(null);
  const [cycle, setCycle] = React.useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [deferred, setDeferred] = React.useState(false);
  const [coupon, setCoupon] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPlanId(null); setCycle('MONTHLY'); setDeferred(false); setCoupon(''); setFormError(null);
  }, [open]);

  const available = (plans ?? []).filter((p) => p.status === 'ACTIVE');
  const selected = available.find((p) => p.id === planId);
  const price = selected ? (cycle === 'ANNUAL' ? selected.annualPriceMinor : selected.monthlyPriceMinor) : 0;

  async function submit() {
    if (!planId) return;
    setBusy(true); setFormError(null);
    try {
      await api(`/platform/organizations/${organizationId}/change-plan`, {
        method: 'POST',
        body: { planId, billingCycle: cycle, effectiveAtPeriodEnd: deferred },
      });

      // The coupon is a separate operation so a bad code cannot roll back the
      // plan change the admin actually wanted.
      if (coupon.trim()) {
        try {
          await api(`/platform/organizations/${organizationId}/apply-coupon`, {
            method: 'POST',
            body: { code: coupon.trim().toUpperCase() },
          });
        } catch (err) {
          toast({
            kind: 'warning',
            title: 'Plan changed, coupon not applied',
            description: err instanceof ApiError ? err.message : 'The coupon could not be applied.',
          });
          onDone();
          return;
        }
      }

      toast({
        kind: 'success',
        title: deferred ? 'Plan change scheduled' : 'Plan changed',
        description: deferred
          ? `${selected?.name} takes effect at the end of the current period.`
          : `Now on ${selected?.name}.`,
      });
      onDone();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="md"
      title="Change plan"
      description="Applies immediately, or at the end of the current billing period."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!planId}>
            {deferred ? 'Schedule change' : 'Change plan'}
          </Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <Segmented
        options={[{ value: 'MONTHLY', label: 'Monthly' }, { value: 'ANNUAL', label: 'Annual' }]}
        value={cycle}
        onChange={(v) => setCycle(v as 'MONTHLY' | 'ANNUAL')}
        fullWidth
        aria-label="Billing cycle"
      />

      <RadioGroup
        name="plan"
        label="Plan"
        required
        variant="card"
        value={planId}
        onChange={setPlanId}
        options={available.map((p) => ({
          value: p.id,
          label: p.id === currentPlanId ? `${p.name} (current)` : p.name,
          description: `${
            (cycle === 'ANNUAL' ? p.annualPriceMinor : p.monthlyPriceMinor) === 0
              ? 'Free'
              : `${formatMinor(cycle === 'ANNUAL' ? p.annualPriceMinor : p.monthlyPriceMinor)}/${cycle === 'ANNUAL' ? 'year' : 'month'}`
          }${p.description ? ` — ${p.description}` : ''}`,
          disabled: p.id === currentPlanId && cycle === 'MONTHLY',
        }))}
      />

      <Input
        label="Coupon code"
        value={coupon}
        onChange={(e) => setCoupon(e.target.value.toUpperCase())}
        helperText="Optional. Validated when applied."
        placeholder="LAUNCH25"
      />

      <Switch
        label="Apply at the end of the current period"
        description="Keeps the organization on its current plan until the period it has already paid for ends."
        checked={deferred}
        onChange={setDeferred}
      />

      {selected && (
        <Alert tone="info">
          {price === 0
            ? `${selected.name} is free.`
            : `${selected.name} bills at ${formatMinor(price)} per ${cycle === 'ANNUAL' ? 'year' : 'month'}.`}
        </Alert>
      )}
    </FormModal>
  );
}
