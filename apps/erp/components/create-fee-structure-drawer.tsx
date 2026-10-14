'use client';

import * as React from 'react';
import {
  Alert, Button, Combobox, CurrencyInput, FormModal, FormRow, FormSection, Input, Switch, Textarea, useToast,
} from '@acadia/ui';
import { formatMinor, toMinor } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Course { id: string; name: string }
interface Year { id: string; name: string; isCurrent: boolean }
interface Component { name: string; amount: string; isOptional: boolean }

const BLANK: Component[] = [{ name: 'Tuition', amount: '', isOptional: false }];

/** Spec §61 — a fee structure is a template, not a charge. */
export function CreateFeeStructureDrawer({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { activeBranch, branches, scope: sessionScope } = useSession();
  const canShare = sessionScope?.canSelectAllBranches ?? false;

  const { data: courses } = useQuery<Course[]>(open ? '/courses' : null);
  const { data: years } = useQuery<Year[]>(open ? '/academic-years' : null);

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [shared, setShared] = React.useState(false);
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [courseId, setCourseId] = React.useState<string | null>(null);
  const [yearId, setYearId] = React.useState<string | null>(null);
  const [components, setComponents] = React.useState<Component[]>(BLANK);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(''); setDescription('');
    setShared(canShare);
    setBranchId(activeBranch?.id ?? null);
    setCourseId(null);
    setComponents(BLANK.map((c) => ({ ...c })));
    setErrors({}); setFormError(null);
  }, [open, activeBranch, canShare]);

  React.useEffect(() => {
    if (open && years?.length && !yearId) setYearId((years.find((y) => y.isCurrent) ?? years[0]).id);
  }, [open, years, yearId]);

  const totalMinor = components.reduce((sum, c) => sum + (c.amount ? toMinor(Number(c.amount)) : 0), 0);
  const filled = components.filter((c) => c.name.trim() && Number(c.amount) > 0);
  const complete = name.trim().length >= 3 && filled.length > 0 && (shared || Boolean(branchId ?? activeBranch?.id));

  function update(i: number, patch: Partial<Component>) {
    setComponents((prev) => prev.map((c, ci) => (ci === i ? { ...c, ...patch } : c)));
  }

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api('/fee-structures', {
        method: 'POST',
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          branchId: shared ? null : (branchId ?? activeBranch?.id),
          courseId: courseId ?? undefined,
          academicYearId: yearId ?? undefined,
          components: filled.map((c) => ({
            name: c.name.trim(), amountMinor: toMinor(Number(c.amount)), isOptional: c.isOptional,
          })),
        },
      });
      toast({ kind: 'success', title: 'Fee structure created', description: `${name.trim()} — ${formatMinor(totalMinor)}.` });
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
      size="lg"
      title="New fee structure"
      description="Assigning this to a student copies these amounts onto their account — later edits here never restate an existing debt."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!complete}>Create structure</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <FormSection title="Structure">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="NEET Repeater 2026–27" />
        <Textarea label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
        <FormRow>
          <Combobox
            label="Course"
            placeholder="Optional"
            options={(courses ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={courseId}
            onChange={setCourseId}
          />
          <Combobox
            label="Academic year"
            placeholder="Optional"
            options={(years ?? []).map((y) => ({ value: y.id, label: y.name, meta: y.isCurrent ? 'Current' : undefined }))}
            value={yearId}
            onChange={setYearId}
          />
        </FormRow>
        {canShare && (
          <Switch
            label="Share across every branch"
            description="Shared structures can be assigned by any branch. Turn this off to keep it to one."
            checked={shared}
            onChange={setShared}
          />
        )}
        {!shared && branches.length > 1 && (
          <Combobox
            label="Branch"
            required
            placeholder="Select a branch"
            options={branches.map((b) => ({ value: b.id, label: b.name, meta: b.code }))}
            value={branchId ?? activeBranch?.id ?? null}
            onChange={setBranchId}
            error={errors.branchId}
          />
        )}
      </FormSection>

      <FormSection title="Components" description="Each line appears on the student's receipt.">
        <div className="flex flex-col gap-2">
          {components.map((c, i) => (
            <div key={i} className="flex items-end gap-2">
              <Input aria-label="Component name" className="flex-1" placeholder="Tuition" value={c.name} onChange={(e) => update(i, { name: e.target.value })} />
              <CurrencyInput aria-label="Amount" className="w-[140px]" value={c.amount} onChange={(e) => update(i, { amount: e.target.value })} />
              {components.length > 1 && (
                <Button size="sm" variant="ghost" onClick={() => setComponents((prev) => prev.filter((_, ci) => ci !== i))}>Remove</Button>
              )}
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => setComponents((prev) => [...prev, { name: '', amount: '', isOptional: false }])}>
          Add component
        </Button>
        {errors.components && <span className="text-caption text-error">{errors.components}</span>}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-body-sm text-fg-secondary">Total</span>
          <span className="font-mono text-h3 tabular-nums text-fg">{formatMinor(totalMinor)}</span>
        </div>
      </FormSection>
    </FormModal>
  );
}
