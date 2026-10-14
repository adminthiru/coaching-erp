'use client';

import * as React from 'react';
import { Alert, Button, FormModal, Input, Textarea, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';

interface Submission {
  id: string; marksAwarded: number | null; feedback: string | null;
  student: { id: string; name: string; studentCode: string };
}

export function GradeSubmissionDrawer({
  open, submission, maxMarks, onClose, onSaved,
}: {
  open: boolean;
  submission: Submission | null;
  maxMarks: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [marks, setMarks] = React.useState('');
  const [feedback, setFeedback] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !submission) return;
    setMarks(submission.marksAwarded !== null ? String(submission.marksAwarded) : '');
    setFeedback(submission.feedback ?? '');
    setFormError(null);
  }, [open, submission]);

  async function submit() {
    if (!submission) return;
    setBusy(true); setFormError(null);
    try {
      await api(`/homework-submissions/${submission.id}/grade`, {
        method: 'POST',
        body: { marksAwarded: marks === '' ? null : Number(marks), feedback: feedback.trim() || undefined },
      });
      toast({ kind: 'success', title: 'Grade saved', description: `${submission.student.name}'s submission is updated.` });
      onSaved();
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
      title={submission ? `Grade — ${submission.student.name}` : 'Grade'}
      description={submission ? `${submission.student.studentCode}${maxMarks ? ` · out of ${maxMarks}` : ''}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Save grade</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}
      <Input label="Marks awarded" type="number" min="0" max={maxMarks ?? undefined} value={marks} onChange={(e) => setMarks(e.target.value)} helperText="Leave blank to clear a grade." />
      <Textarea label="Feedback" rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
    </FormModal>
  );
}
