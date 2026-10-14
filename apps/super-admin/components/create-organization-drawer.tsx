'use client';

import * as React from 'react';
import {
  Alert, Button, Combobox, FormModal, FormRow, FormSection, Input, useToast,
} from '@acadia/ui';
import { slugify } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface Plan { id: string; name: string; monthlyPriceMinor: number; trialDays: number; status: string }

/** Creation happens in a centred modal, never a full page. Three short steps. */
export function CreateOrganizationDrawer({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const { data: plans } = useQuery<Plan[]>(open ? '/platform/plans' : null);

  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [ownerName, setOwnerName] = React.useState('');
  const [ownerEmail, setOwnerEmail] = React.useState('');
  const [ownerPhone, setOwnerPhone] = React.useState('');
  const [planId, setPlanId] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Reset whenever the drawer reopens, so a previous attempt never leaks in.
  React.useEffect(() => {
    if (!open) return;
    setName(''); setSlug(''); setSlugTouched(false);
    setOwnerName(''); setOwnerEmail(''); setOwnerPhone('');
    setPlanId(null); setErrors({}); setFormError(null);
  }, [open]);

  // The slug follows the name until the user edits it themselves.
  React.useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const selectedPlan = plans?.find((p) => p.id === planId);

  async function submit() {
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const org = await api<{ id: string; name: string }>('/platform/organizations', {
        method: 'POST',
        body: {
          name: name.trim(),
          slug,
          ownerName: ownerName.trim(),
          ownerEmail: ownerEmail.trim(),
          ownerPhone: ownerPhone.trim(),
          ...(planId ? { planId } : {}),
        },
      });
      toast({
        kind: 'success',
        title: 'Organization created',
        description: `${org.name} is on trial and its owner has been invited.`,
      });
      onCreated(org.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) setFormError(err.message);
      } else {
        setFormError('Could not reach the server.');
      }
    } finally {
      setBusy(false);
    }
  }

  const complete = name.trim() && slug && ownerName.trim() && ownerEmail.trim() && ownerPhone.trim();

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="lg"
      title="New organization"
      description="Creates the tenant and invites its owner."
      onSubmit={submit}
      submitLabel="Create organization"
      canSubmit={Boolean(complete)}
      busy={busy}
      banner={formError ? <Alert tone="error">{formError}</Alert> : undefined}
      steps={[
        {
          label: "Organization",
          hint: "How the tenant appears across the platform.",
          canContinue: Boolean(name.trim() && slug),
          content: (
            <FormSection title="Organization" description="How the tenant appears across the platform.">
          <FormRow>
            <Input
              label="Organization name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              placeholder="ABC NEET & JEE Academy"
            />
            <Input
              label="Identifier"
              required
              value={slug}
              onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
              error={errors.slug}
              helperText="Used in URLs. Lowercase letters, numbers and hyphens."
              placeholder="abc-academy"
            />
          </FormRow>
            </FormSection>
          ),
        },
        {
          label: "Owner",
          hint: "Receives the invitation to set up the organization.",
          canContinue: Boolean(ownerName.trim() && ownerEmail.trim() && ownerPhone.trim()),
          content: (
            <FormSection title="Owner" description="Receives the invitation to set up the organization.">
          <FormRow>
            <Input
              label="Full name"
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              error={errors.ownerName}
              placeholder="Ramesh Iyer"
            />
            <Input
              label="Email"
              type="email"
              required
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              error={errors.ownerEmail}
              placeholder="ramesh@abcacademy.in"
            />
          </FormRow>
          <FormRow>
            <Input
              label="Phone"
              required
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(e.target.value)}
              error={errors.ownerPhone}
              placeholder="+91 98765 43210"
            />
          </FormRow>
            </FormSection>
          ),
        },
        {
          label: "Plan",
          hint: "Leave empty to start on the cheapest active plan.",
          content: (
            <FormSection title="Plan" description="Leave empty to start on the cheapest active plan.">
          <Combobox
            label="Plan"
            placeholder="Default plan"
            options={(plans ?? [])
              .filter((p) => p.status === 'ACTIVE')
              .map((p) => ({
                value: p.id,
                label: p.name,
                meta: p.monthlyPriceMinor === 0 ? 'Free' : `₹${(p.monthlyPriceMinor / 100).toLocaleString('en-IN')}/mo`,
              }))}
            value={planId}
            onChange={setPlanId}
            error={errors.planId}
          />
          {selectedPlan && (
            <Alert tone="info">
              {selectedPlan.trialDays > 0
                ? `Starts with a ${selectedPlan.trialDays}-day trial.`
                : 'This plan has no trial — the organization becomes active immediately.'}
            </Alert>
          )}
            </FormSection>
          ),
        },
      ]}
    />
  );
}
