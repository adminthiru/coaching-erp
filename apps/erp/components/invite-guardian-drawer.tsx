'use client';

import * as React from 'react';
import { Alert, Button, FormModal, FormRow, FormSection, Input, Switch, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';

/** Spec §65 — inviting a parent to the portal for this student. */
export function InviteGuardianDrawer({
  open, studentId, studentName, onClose, onInvited,
}: {
  open: boolean;
  studentId: string;
  studentName: string;
  onClose: () => void;
  onInvited: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [relation, setRelation] = React.useState('Father');
  const [isPrimary, setIsPrimary] = React.useState(true);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(''); setEmail(''); setPhone(''); setRelation('Father'); setIsPrimary(true);
    setErrors({}); setFormError(null);
  }, [open]);

  const complete = name.trim().length >= 2 && email.trim() && relation.trim().length >= 2;

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api(`/students/${studentId}/guardians`, {
        method: 'POST',
        body: {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          relation: relation.trim(),
          isPrimary,
        },
      });
      toast({ kind: 'success', title: 'Guardian invited', description: `${name.trim()} can now sign in to see ${studentName}.` });
      onInvited();
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
      title="Invite a guardian"
      description={`They will be able to see ${studentName}'s attendance, results, homework and fees — and nothing else.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!complete}>Send invitation</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <Alert tone="info">
        If this email already belongs to a parent here, the existing login is reused — one parent with two children
        signs in once and switches between them.
      </Alert>

      <FormSection title="Guardian">
        <FormRow>
          <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <Input label="Relation" required value={relation} onChange={(e) => setRelation(e.target.value)} error={errors.relation} placeholder="Father" />
        </FormRow>
        <FormRow>
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} helperText="Their sign-in address." />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
        </FormRow>
        <Switch
          label="Primary contact"
          description="The first person the branch calls. Only one guardian per student can hold this."
          checked={isPrimary}
          onChange={setIsPrimary}
        />
      </FormSection>
    </FormModal>
  );
}
