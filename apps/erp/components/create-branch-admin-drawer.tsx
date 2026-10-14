'use client';

import * as React from 'react';
import { Alert, Button, FormModal, FormRow, FormSection, Input, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';

/**
 * Spec §29. The created user is a BRANCH_ADMIN bound to this branch — the API
 * creates the assignment in the same transaction, so an unassigned branch admin
 * is never a reachable state.
 */
export function CreateBranchAdminDrawer({
  open, branch, onClose, onCreated,
}: {
  open: boolean;
  branch: { id: string; name: string } | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = React.useState({ name: '', email: '', phone: '', employeeId: '' });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm({ name: '', email: '', phone: '', employeeId: '' });
    setErrors({});
    setFormError(null);
  }, [open]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!branch) return;
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      await api('/staff/branch-admins', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          employeeId: form.employeeId.trim() || undefined,
          branchId: branch.id,
        },
      });
      toast({
        kind: 'success',
        title: 'Branch admin invited',
        description: `${form.name} can set their password from the invitation email. ${branch.name} is now active.`,
      });
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

  const complete = form.name.trim() && form.email.trim();

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="md"
      title="Add branch admin"
      description={branch ? `They will run ${branch.name}.` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Skip for now</Button>
          <Button onClick={submit} loading={busy} disabled={!complete}>Send invitation</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <Alert tone="info">
        A branch admin manages admissions, students, staff, attendance, fees and reports —
        for this branch only.
      </Alert>

      <FormSection title="Branch admin">
        <FormRow>
          <Input label="Full name" required value={form.name} onChange={set('name')} error={errors.name} placeholder="Lakshmi Raman" />
          <Input label="Email" type="email" required value={form.email} onChange={set('email')} error={errors.email} placeholder="lakshmi@academy.in" />
        </FormRow>
        <FormRow>
          <Input label="Phone" value={form.phone} onChange={set('phone')} error={errors.phone} placeholder="+91 98765 43210" />
          <Input label="Employee ID" value={form.employeeId} onChange={set('employeeId')} error={errors.employeeId} placeholder="EMP-0001" />
        </FormRow>
      </FormSection>
    </FormModal>
  );
}
