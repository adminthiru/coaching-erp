'use client';

import * as React from 'react';
import { Alert, Button, Combobox, FormModal, Switch, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface Batch { id: string; name: string; branch: { id: string; name: string }; course: { id: string } }

/** Spec §45 — faculty teach a named subject in a batch, at their own branch. */
export function AssignFacultyDrawer({
  open, batch, onClose, onDone,
}: {
  open: boolean;
  batch: Batch | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [facultyId, setFacultyId] = React.useState<string | null>(null);
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [isClassTeacher, setIsClassTeacher] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Scoped to the batch's branch: the API rejects faculty from elsewhere.
  const { data: staff } = useQuery<{ data: { id: string; name: string; email: string; role: string }[] }>(
    open && batch ? '/staff' : null,
    { query: { pageSize: 100, branchId: batch?.branch.id } },
    [batch?.branch.id],
  );
  const { data: subjects } = useQuery<{ id: string; name: string; code: string }[]>(
    open && batch ? '/subjects' : null,
    { query: { courseId: batch?.course.id } },
    [batch?.course.id],
  );

  React.useEffect(() => {
    if (!open) return;
    setFacultyId(null); setSubjectId(null); setIsClassTeacher(false); setFormError(null);
  }, [open]);

  const teachers = (staff?.data ?? []).filter((s) => ['FACULTY', 'BRANCH_ADMIN', 'ORG_ADMIN'].includes(s.role));

  async function submit() {
    if (!batch || !facultyId || !subjectId) return;
    setBusy(true); setFormError(null);
    try {
      await api(`/batches/${batch.id}/faculty`, {
        method: 'POST',
        body: { facultyId, subjectId, isClassTeacher },
      });
      toast({ kind: 'success', title: 'Faculty assigned', description: `Added to ${batch.name}.` });
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
      title="Assign faculty"
      description={batch ? `Teaching ${batch.name}.` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!facultyId || !subjectId}>Assign</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      {teachers.length === 0 ? (
        <Alert tone="warning" title="No faculty at this branch">
          Add staff to {batch?.branch.name} before assigning them to a batch.
        </Alert>
      ) : (
        <>
          <Combobox
            label="Faculty"
            required
            placeholder="Select a teacher"
            options={teachers.map((t) => ({ value: t.id, label: t.name, meta: t.email }))}
            value={facultyId}
            onChange={setFacultyId}
            helperText={`Only staff assigned to ${batch?.branch.name} are listed.`}
          />
          <Combobox
            label="Subject"
            required
            placeholder="Select a subject"
            options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.code }))}
            value={subjectId}
            onChange={setSubjectId}
          />
          <Switch
            label="Class teacher"
            description="Each batch has one class teacher; assigning a new one replaces the current."
            checked={isClassTeacher}
            onChange={setIsClassTeacher}
          />
        </>
      )}
    </FormModal>
  );
}
