'use client';

import * as React from 'react';
import { Alert, Button, FormModal, FormRow, FormSection, Input, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';

const WEEKDAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

/** Spec §28 — branch details, then the branch admin as the immediate next step. */
export interface EditableBranch {
  id: string; name: string; code: string;
  addressLine: string | null; city: string; state: string;
  pincode: string | null; phone: string | null; email: string | null;
  workingDays: number[];
}

export function CreateBranchDrawer({
  open, branch, onClose, onCreated,
}: {
  open: boolean;
  /** Present ⇒ edit that branch. Absent ⇒ create one. */
  branch?: EditableBranch | null;
  onClose: () => void;
  onCreated: (branch: any) => void;
}) {
  const editing = Boolean(branch);
  const { toast } = useToast();
  const [form, setForm] = React.useState({
    name: '', code: '', addressLine: '', city: '', state: '', pincode: '', phone: '', email: '',
  });
  const [codeTouched, setCodeTouched] = React.useState(false);
  const [workingDays, setWorkingDays] = React.useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [limitReached, setLimitReached] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm({
      name: branch?.name ?? '', code: branch?.code ?? '',
      addressLine: branch?.addressLine ?? '', city: branch?.city ?? '', state: branch?.state ?? '',
      pincode: branch?.pincode ?? '', phone: branch?.phone ?? '', email: branch?.email ?? '',
    });
    // An existing code must not be silently rewritten by the name-derives-code
    // effect, so editing counts as "the user already chose this code".
    setCodeTouched(Boolean(branch));
    setWorkingDays(branch?.workingDays ?? [1, 2, 3, 4, 5, 6]);
    setErrors({});
    setFormError(null);
    setLimitReached(null);
  }, [open, branch]);

  // The code follows the name until the user edits it directly.
  React.useEffect(() => {
    if (codeTouched) return;
    const derived = form.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    setForm((f) => ({ ...f, code: derived }));
  }, [form.name, codeTouched]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const complete = form.name.trim() && form.code.trim() && form.city.trim() && form.state.trim();

  async function submit() {
    setBusy(true);
    setErrors({});
    setFormError(null);
    setLimitReached(null);
    try {
      const saved = await api<any>(branch ? `/branches/${branch.id}` : '/branches', {
        method: branch ? 'PATCH' : 'POST',
        body: {
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          city: form.city.trim(),
          state: form.state.trim(),
          addressLine: form.addressLine.trim() || undefined,
          pincode: form.pincode.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          workingDays,
        },
      });
      toast({
        kind: 'success',
        title: branch ? 'Branch updated' : 'Branch created',
        description: branch
          ? `${saved.name} was saved.`
          : `${saved.name} needs an admin before it can operate.`,
      });
      onCreated(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        // Spec §15 — the plan ceiling gets its own, actionable message.
        if (err.code === 'LIMIT_REACHED') setLimitReached(err.message);
        else {
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
      size="md"
      title={editing ? 'Edit branch' : 'New branch'}
      description={editing ? 'Changes apply immediately.' : "You'll add a branch admin next — a branch cannot operate without one."}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!complete || Boolean(limitReached)}>
            {editing ? 'Save changes' : 'Create branch'}
          </Button>
        </>
      }
    >
      {!editing && limitReached && (
        <Alert tone="error" title="Branch limit reached">
          {limitReached} Contact your account manager to upgrade.
        </Alert>
      )}
      {formError && <Alert tone="error">{formError}</Alert>}

      <FormSection title="Branch details">
        <FormRow>
          <Input label="Branch name" required value={form.name} onChange={set('name')} error={errors.name} placeholder="Chennai (Main)" />
          <Input
            label="Branch code"
            required
            value={form.code}
            onChange={(e) => { setCodeTouched(true); setForm((f) => ({ ...f, code: e.target.value.toUpperCase() })); }}
            error={errors.code}
            helperText="Unique within your organization."
            placeholder="CHN1"
          />
        </FormRow>
        <FormRow>
          <Input label="Address" value={form.addressLine} onChange={set('addressLine')} error={errors.addressLine} placeholder="12 Anna Salai" />
        </FormRow>
        <FormRow>
          <Input label="City" required value={form.city} onChange={set('city')} error={errors.city} placeholder="Chennai" />
          <Input label="State" required value={form.state} onChange={set('state')} error={errors.state} placeholder="Tamil Nadu" />
          <Input label="Pincode" value={form.pincode} onChange={set('pincode')} error={errors.pincode} placeholder="600002" />
        </FormRow>
      </FormSection>

      <FormSection title="Contact & schedule">
        <FormRow>
          <Input label="Phone" value={form.phone} onChange={set('phone')} error={errors.phone} placeholder="+91 98765 43210" />
          <Input label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} placeholder="chennai@academy.in" />
        </FormRow>

        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-label text-fg">Working days</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = workingDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setWorkingDays((days) =>
                      on ? days.filter((x) => x !== d.value) : [...days, d.value].sort((a, b) => a - b),
                    )
                  }
                  className={
                    on
                      ? 'rounded-md border border-primary bg-primary-soft px-3 py-1.5 text-[12.5px] font-semibold text-primary'
                      : 'rounded-md border border-border-strong bg-surface px-3 py-1.5 text-[12.5px] text-fg-secondary hover:border-primary'
                  }
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          {errors.workingDays && <span className="text-caption text-error">{errors.workingDays}</span>}
        </div>
      </FormSection>
    </FormModal>
  );
}
