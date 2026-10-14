'use client';

import * as React from 'react';
import { Alert, Button, FormModal, MultiCombobox, Skeleton, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface Batch { id: string; name: string; capacity: number; enrolled: number; seatsLeft: number; branch: { id: string; name: string } }

/**
 * Only unbatched, active students from *this batch's branch* are offered — the
 * API rejects anything else, so the picker should not present it in the first place.
 */
export function EnrolStudentsDrawer({
  open, batch, onClose, onDone,
}: {
  open: boolean;
  batch: Batch | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const { data, loading } = useQuery<{ data: { id: string; name: string; studentCode: string; branch: { id: string } }[] }>(
    open && batch ? '/students' : null,
    { query: { pageSize: 100, unbatched: true, status: 'ACTIVE' } },
  );

  React.useEffect(() => {
    if (!open) return;
    setSelected([]); setFormError(null);
  }, [open]);

  const candidates = (data?.data ?? []).filter((s) => s.branch.id === batch?.branch.id);

  async function submit() {
    if (!batch || !selected.length) return;
    setBusy(true); setFormError(null);
    try {
      await api(`/batches/${batch.id}/students`, { method: 'POST', body: { studentIds: selected } });
      toast({
        kind: 'success',
        title: 'Students enrolled',
        description: `${selected.length} student${selected.length === 1 ? '' : 's'} added to ${batch.name}.`,
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
      title="Enrol students"
      description={batch ? `${batch.seatsLeft} of ${batch.capacity} seats available in ${batch.name}.` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!selected.length}>
            Enrol {selected.length || ''}
          </Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      {loading ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : candidates.length === 0 ? (
        <Alert tone="info" title="No students available">
          Every active student at {batch?.branch.name} is already in a batch. Admit a new student first.
        </Alert>
      ) : (
        <>
          <MultiCombobox
            label="Students"
            required
            placeholder="Search and pick students"
            options={candidates.map((s) => ({ value: s.id, label: s.name, meta: s.studentCode }))}
            value={selected}
            onChange={setSelected}
            max={batch?.seatsLeft}
            helperText={`Only unbatched, active students at ${batch?.branch.name} are listed.`}
          />
          {batch && selected.length > 0 && (
            <Alert tone="info">
              After this, the batch will hold {batch.enrolled + selected.length} of {batch.capacity} students.
            </Alert>
          )}
        </>
      )}
    </FormModal>
  );
}
