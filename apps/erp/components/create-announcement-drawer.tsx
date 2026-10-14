'use client';

import * as React from 'react';
import {
  Alert, Button, Combobox, FormModal, Input, MultiCombobox, RadioGroup, Textarea, useToast,
} from '@acadia/ui';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

type Audience = 'ALL_BRANCHES' | 'BRANCH' | 'BATCH';

/** Spec §49 — pick who it reaches, then where. */
export function CreateAnnouncementDrawer({
  open, onClose, onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { branches, activeBranch, scope } = useSession();
  const { data: batches } = useQuery<{ data: { id: string; name: string; code: string }[] }>(
    open ? '/batches' : null, { query: { pageSize: 100, status: 'ACTIVE' } },
  );

  const [audience, setAudience] = React.useState<Audience>('BRANCH');
  const [branchIds, setBranchIds] = React.useState<string[]>([]);
  const [batchId, setBatchId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [pinnedUntil, setPinnedUntil] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const canBroadcast = scope?.canSelectAllBranches ?? false;

  React.useEffect(() => {
    if (!open) return;
    setAudience('BRANCH');
    setBranchIds(activeBranch ? [activeBranch.id] : []);
    setBatchId(null); setTitle(''); setBody(''); setPinnedUntil('');
    setErrors({}); setFormError(null);
  }, [open, activeBranch]);

  const complete =
    title.trim().length >= 3 &&
    body.trim().length >= 3 &&
    (audience === 'ALL_BRANCHES' ||
      (audience === 'BATCH' ? Boolean(batchId) : branchIds.length > 0));

  async function submit(publish: boolean) {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      const created = await api<{ id: string }>('/announcements', {
        method: 'POST',
        body: {
          title: title.trim(),
          body: body.trim(),
          audience,
          branchIds: audience === 'BRANCH' ? branchIds : [],
          batchId: audience === 'BATCH' ? batchId : undefined,
          pinnedUntil: pinnedUntil || undefined,
        },
      });
      if (publish) {
        await api(`/announcements/${created.id}/status`, { method: 'POST', body: { status: 'PUBLISHED' } });
      }
      toast({
        kind: 'success',
        title: publish ? 'Announcement published' : 'Draft saved',
        description: publish ? 'It is now visible to the audience you chose.' : 'Publish it when you are ready.',
      });
      onDone();
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
      title="New announcement"
      description="Save as a draft, or publish straight away."
      footer={
        <>
          <Button variant="outline" onClick={() => submit(false)} loading={busy} disabled={!complete}>
            Save draft
          </Button>
          <Button onClick={() => submit(true)} loading={busy} disabled={!complete}>Publish</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <RadioGroup
        name="audience"
        label="Who is this for?"
        required
        variant="card"
        value={audience}
        onChange={(v) => setAudience(v as Audience)}
        options={[
          ...(canBroadcast
            ? [{
                value: 'ALL_BRANCHES',
                label: 'Every branch',
                description: 'Reaches the whole organization.',
              }]
            : []),
          {
            value: 'BRANCH',
            label: 'Selected branches',
            description: 'Only the branches you pick.',
          },
          {
            value: 'BATCH',
            label: 'One batch',
            description: 'Targets a single batch and its branch.',
          },
        ]}
      />

      {!canBroadcast && (
        <Alert tone="info">
          Only organization-level roles can announce to every branch.
        </Alert>
      )}

      {audience === 'BRANCH' && (
        <MultiCombobox
          label="Branches"
          required
          placeholder="Pick branches"
          options={branches.map((b) => ({ value: b.id, label: b.name, meta: `${b.code} · ${b.city}` }))}
          value={branchIds}
          onChange={setBranchIds}
          error={errors.branchIds}
        />
      )}

      {audience === 'BATCH' && (
        <Combobox
          label="Batch"
          required
          placeholder="Pick a batch"
          options={(batches?.data ?? []).map((b) => ({ value: b.id, label: b.name, meta: b.code }))}
          value={batchId}
          onChange={setBatchId}
          error={errors.batchId}
        />
      )}

      <Input
        label="Title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={errors.title}
        placeholder="Mock test scheduled for Sunday"
      />

      <Textarea
        label="Message"
        required
        rows={6}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={errors.body}
        placeholder="All XII batches will sit the All India Mock Test #4 this Sunday at 9am. Report 30 minutes early."
      />

      <Input
        label="Pin until"
        type="date"
        value={pinnedUntil}
        onChange={(e) => setPinnedUntil(e.target.value)}
        error={errors.pinnedUntil}
        helperText="Optional. Pinned announcements sit at the top of the list."
      />
    </FormModal>
  );
}
