'use client';

import * as React from 'react';
import { Alert, Button, Combobox, FormModal, Select, Skeleton, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface BatchStudent { id: string; name: string; studentCode: string; status: string }
interface TestBatch { id: string; name: string; code: string }

/** Spec §53 — a staff member starts an attempt for a student sitting the exam. */
export function StartAttemptDrawer({
  open, testId, batches, onClose, onStarted,
}: {
  open: boolean;
  testId: string;
  batches: TestBatch[];
  onClose: () => void;
  onStarted: (attemptId: string) => void;
}) {
  const { toast } = useToast();
  const [batchId, setBatchId] = React.useState<string | null>(null);
  const [studentId, setStudentId] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setBatchId(batches[0]?.id ?? null);
    setStudentId(null);
    setFormError(null);
  }, [open, batches]);

  const { data, loading } = useQuery<{ data: BatchStudent[] }>(
    open && batchId ? `/batches/${batchId}/students` : null,
    { query: { pageSize: 200 } },
    [batchId],
  );
  const students = (data?.data ?? []).filter((s) => s.status === 'ACTIVE');

  async function submit() {
    if (!studentId) return;
    setBusy(true); setFormError(null);
    try {
      const res = await api<{ attempt: { id: string } }>(`/tests/${testId}/attempts`, {
        method: 'POST',
        body: { studentId },
      });
      onStarted(res.attempt.id);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not reach the server.';
      setFormError(message);
      if (err instanceof ApiError) toast({ kind: 'error', title: 'Could not start the attempt', description: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="md"
      title="Start an attempt"
      description="Opens the paper for one student and starts their clock."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!studentId}>Start attempt</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <Select
        label="Batch"
        required
        options={batches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))}
        value={batchId}
        onChange={(v) => { setBatchId(v); setStudentId(null); }}
      />

      {loading ? (
        <Skeleton className="h-10 rounded-lg" />
      ) : students.length === 0 ? (
        <Alert tone="info" title="No eligible students">
          There are no active, enrolled students in this batch.
        </Alert>
      ) : (
        <Combobox
          label="Student"
          required
          placeholder="Search by name or code"
          options={students.map((s) => ({ value: s.id, label: s.name, meta: s.studentCode }))}
          value={studentId}
          onChange={setStudentId}
        />
      )}

      <Alert tone="warning" title="Starting is one-way">
        The deadline is set the moment the attempt starts and cannot be extended by reconnecting. Only start once the
        student is ready.
      </Alert>
    </FormModal>
  );
}
