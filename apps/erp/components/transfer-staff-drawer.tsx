'use client';

import * as React from 'react';
import { Alert, Button, FormModal, RadioGroup, Textarea, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Person {
  id: string;
  name: string;
  branches: { id: string; name: string; code: string; isPrimary: boolean }[];
}

/**
 * Spec §35. The impact is shown before confirming: which branch they leave, which
 * they join, and what happens to their existing records.
 */
export function TransferStaffDrawer({
  open, person, onClose, onDone,
}: {
  open: boolean;
  person: Person | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { branches } = useSession();
  const [toBranchId, setToBranchId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setToBranchId(null); setReason(''); setFormError(null);
  }, [open]);

  const current = person?.branches.find((b) => b.isPrimary) ?? person?.branches[0] ?? null;
  const destinations = branches.filter((b) => b.id !== current?.id && b.status !== 'ARCHIVED');
  const destination = destinations.find((b) => b.id === toBranchId);
  const valid = Boolean(toBranchId) && reason.trim().length >= 4;

  async function submit() {
    if (!person || !toBranchId) return;
    setBusy(true);
    setFormError(null);
    try {
      await api('/staff/transfer', {
        method: 'POST',
        body: { entityType: 'USER', entityId: person.id, toBranchId, reason: reason.trim() },
      });
      toast({
        kind: 'success',
        title: 'Transfer complete',
        description: `${person.name} now belongs to ${destination?.name}.`,
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
      title="Transfer to another branch"
      description={person ? `Moving ${person.name}.` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!valid}>Confirm transfer</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      {destinations.length === 0 ? (
        <Alert tone="warning" title="No destination available">
          There is no other active branch to transfer into.
        </Alert>
      ) : (
        <>
          <Alert tone="info" title="What changes">
            Future records follow the destination branch. Everything already recorded stays with{' '}
            {current?.name ?? 'their current branch'}, so past reports remain accurate.
          </Alert>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-secondary px-3.5 py-3">
            <span className="flex flex-col gap-0.5">
              <span className="text-caption text-fg-muted">Current branch</span>
              <span className="text-body-sm font-medium text-fg">{current?.name ?? 'Unassigned'}</span>
            </span>
            <span aria-hidden className="text-fg-muted">→</span>
            <span className="flex flex-col gap-0.5 text-right">
              <span className="text-caption text-fg-muted">Destination</span>
              <span className="text-body-sm font-medium text-fg">{destination?.name ?? 'Not selected'}</span>
            </span>
          </div>

          <RadioGroup
            name="destination"
            label="Destination branch"
            required
            variant="card"
            value={toBranchId}
            onChange={setToBranchId}
            options={destinations.map((b) => ({
              value: b.id,
              label: b.name,
              description: `${b.code} · ${b.city}`,
            }))}
          />

          <Textarea
            label="Reason"
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            helperText="Recorded in the transfer history and the audit log."
            placeholder="Relocating to lead the Salem physics team."
          />
        </>
      )}
    </FormModal>
  );
}
