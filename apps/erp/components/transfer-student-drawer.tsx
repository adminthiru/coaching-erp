'use client';

import * as React from 'react';
import { Alert, Button, FormModal, RadioGroup, Skeleton, Textarea, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Preview {
  student: { id: string; name: string; studentCode: string };
  from: { id: string; name: string; code: string };
  to: { id: string; name: string; code: string; city: string };
  currentBatch: { id: string; name: string; code: string } | null;
  availableBatches: { id: string; name: string; code: string; seatsLeft: number; full: boolean; enrolled: number; capacity: number }[];
  impact: string[];
}

/**
 * Spec §35: Student → Transfer → Destination branch → Batch → Confirm, with the
 * impact shown before the confirmation rather than after it.
 */
export function TransferStudentDrawer({
  open, student, onClose, onDone,
}: {
  open: boolean;
  student: { id: string; name: string; branch: { id: string } } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { branches } = useSession();
  const [toBranchId, setToBranchId] = React.useState<string | null>(null);
  const [toBatchId, setToBatchId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setToBranchId(null); setToBatchId(null); setReason(''); setFormError(null);
  }, [open]);

  const destinations = branches.filter((b) => b.id !== student?.branch.id && b.status !== 'ARCHIVED');

  // The preview is fetched from the API rather than assembled client-side, so the
  // seat counts shown are the ones the server will actually enforce.
  const { data: preview, loading } = useQuery<Preview>(
    open && student && toBranchId ? `/students/${student.id}/transfer-preview` : null,
    { query: { toBranchId: toBranchId ?? undefined } },
    [toBranchId],
  );

  React.useEffect(() => { setToBatchId(null); }, [toBranchId]);

  const valid = Boolean(toBranchId) && reason.trim().length >= 4;

  async function submit() {
    if (!student || !toBranchId) return;
    setBusy(true); setFormError(null);
    try {
      await api(`/students/${student.id}/transfer`, {
        method: 'POST',
        body: { toBranchId, toBatchId: toBatchId ?? undefined, reason: reason.trim() },
      });
      toast({
        kind: 'success',
        title: 'Student transferred',
        description: `${student.name} now belongs to ${preview?.to.name ?? 'the destination branch'}.`,
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
      size="sm"
      title="Transfer student"
      description={student ? `Moving ${student.name} to another branch.` : undefined}
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
          <RadioGroup
            name="destination-branch"
            label="Destination branch"
            required
            variant="card"
            value={toBranchId}
            onChange={setToBranchId}
            options={destinations.map((b) => ({ value: b.id, label: b.name, description: `${b.code} · ${b.city}` }))}
          />

          {toBranchId && (loading ? <Skeleton className="h-32 rounded-lg" /> : preview && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-secondary px-3.5 py-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-caption text-fg-muted">From</span>
                  <span className="text-body-sm font-medium text-fg">{preview.from.name}</span>
                  <span className="text-caption text-fg-muted">{preview.currentBatch?.code ?? 'No batch'}</span>
                </span>
                <span aria-hidden className="text-fg-muted">→</span>
                <span className="flex flex-col gap-0.5 text-right">
                  <span className="text-caption text-fg-muted">To</span>
                  <span className="text-body-sm font-medium text-fg">{preview.to.name}</span>
                  <span className="text-caption text-fg-muted">
                    {preview.availableBatches.find((b) => b.id === toBatchId)?.code ?? 'No batch'}
                  </span>
                </span>
              </div>

              <RadioGroup
                name="destination-batch"
                label="Batch at the destination"
                variant="card"
                value={toBatchId}
                onChange={setToBatchId}
                options={
                  preview.availableBatches.length
                    ? preview.availableBatches.map((b) => ({
                        value: b.id,
                        label: b.name,
                        description: b.full ? `Full (${b.enrolled}/${b.capacity})` : `${b.seatsLeft} of ${b.capacity} seats left`,
                        disabled: b.full,
                      }))
                    : [{ value: '', label: 'No open batches at this branch', disabled: true }]
                }
                helperText="Optional — the student can be batched later."
              />

              <Alert tone="info" title="What this changes">
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  {preview.impact.map((i) => <li key={i}>{i}</li>)}
                </ul>
              </Alert>
            </>
          ))}

          <Textarea
            label="Reason"
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            helperText="Recorded in the transfer history and the audit log."
            placeholder="Family relocating to Salem."
          />
        </>
      )}
    </FormModal>
  );
}
