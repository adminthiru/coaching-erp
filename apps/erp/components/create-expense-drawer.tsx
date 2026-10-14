'use client';

import * as React from 'react';
import {
  Alert, Button, Combobox, CurrencyInput, FormModal, FormRow, FormSection, Input, Select, Switch, Textarea, useToast,
} from '@acadia/ui';
import { EXPENSE_CATEGORY_LABEL, ExpenseCategory, type ExpenseCategory as Category } from '@acadia/types';
import { toMinor } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';

/** Spec §63 — a branch cost or a central organization one. */
export function CreateExpenseDrawer({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { activeBranch, branches, scope: sessionScope } = useSession();
  const canRecordCentral = sessionScope?.canSelectAllBranches ?? false;

  const [central, setCentral] = React.useState(false);
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState<Category>(ExpenseCategory.OTHER);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [incurredOn, setIncurredOn] = React.useState('');
  const [vendor, setVendor] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCentral(false);
    setBranchId(activeBranch?.id ?? null);
    setCategory(ExpenseCategory.OTHER);
    setTitle(''); setDescription(''); setAmount('');
    setIncurredOn(new Date().toISOString().slice(0, 10));
    setVendor(''); setReference('');
    setErrors({}); setFormError(null);
  }, [open, activeBranch]);

  const effectiveBranch = branchId ?? activeBranch?.id ?? null;
  const complete =
    title.trim().length >= 3 &&
    Number(amount) > 0 &&
    incurredOn &&
    (central || Boolean(effectiveBranch));

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api('/expenses', {
        method: 'POST',
        body: {
          branchId: central ? null : effectiveBranch,
          category,
          title: title.trim(),
          description: description.trim() || undefined,
          amountMinor: toMinor(Number(amount)),
          incurredOn,
          vendor: vendor.trim() || undefined,
          reference: reference.trim() || undefined,
        },
      });
      toast({ kind: 'success', title: 'Expense recorded', description: 'It is awaiting approval.' });
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
      title="Record an expense"
      description="Expenses start awaiting approval; only approved and paid ones count toward branch contribution."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!complete}>Record expense</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <FormSection title="Expense">
        <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="Chennai branch rent — August" />
        <FormRow>
          <Select
            label="Category"
            options={(Object.keys(EXPENSE_CATEGORY_LABEL) as Category[]).map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABEL[c] }))}
            value={category}
            onChange={(v) => setCategory(v as Category)}
          />
          <CurrencyInput label="Amount" required value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amountMinor} />
        </FormRow>
        <FormRow>
          <Input label="Incurred on" type="date" required value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} error={errors.incurredOn} />
          <Input label="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} error={errors.vendor} />
        </FormRow>
        <Input label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} error={errors.reference} helperText="Invoice or bill number." />
        <Textarea label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
      </FormSection>

      <FormSection title="Whose cost this is">
        {canRecordCentral && (
          <Switch
            label="Central organization cost"
            description="Head-office spend that belongs to no single branch — never netted against one."
            checked={central}
            onChange={setCentral}
          />
        )}
        {!central && branches.length > 1 && (
          <Combobox
            label="Branch"
            required
            placeholder="Select a branch"
            options={branches.map((b) => ({ value: b.id, label: b.name, meta: b.code }))}
            value={effectiveBranch}
            onChange={setBranchId}
            error={errors.branchId}
          />
        )}
      </FormSection>
    </FormModal>
  );
}
