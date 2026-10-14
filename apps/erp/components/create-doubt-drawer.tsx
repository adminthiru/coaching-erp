'use client';

import * as React from 'react';
import { Alert, Button, Combobox, FormModal, FormRow, FormSection, Textarea, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface Subject { id: string; name: string; code: string }
interface StudentOption { id: string; name: string; studentCode: string }
interface FacultyOption { id: string; name: string }

/**
 * Spec §59 — logging a doubt on a student's behalf. There is no student
 * portal yet (see README), so a counsellor or faculty member records the
 * question the way they would a phone call or a walk-in.
 */
export function CreateDoubtDrawer({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const { data: subjects } = useQuery<Subject[]>(open ? '/subjects' : null);
  const { data: studentPage } = useQuery<{ data: StudentOption[] }>(open ? '/students' : null, { query: { pageSize: 200, status: 'ACTIVE' } });
  const { data: facultyPage } = useQuery<{ data: FacultyOption[] }>(open ? '/staff' : null, { query: { pageSize: 200, role: 'FACULTY' } });

  const [studentId, setStudentId] = React.useState<string | null>(null);
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [assignedToId, setAssignedToId] = React.useState<string | null>(null);
  const [question, setQuestion] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setStudentId(null); setSubjectId(null); setAssignedToId(null); setQuestion('');
    setErrors({}); setFormError(null);
  }, [open]);

  const complete = Boolean(studentId) && Boolean(subjectId) && question.trim().length >= 3;

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      const doubt = await api<{ id: string }>('/doubts', {
        method: 'POST',
        body: { studentId, subjectId, assignedToId: assignedToId ?? undefined, question: question.trim() },
      });
      toast({ kind: 'success', title: 'Doubt logged', description: 'It is routed and ready to be answered.' });
      onCreated(doubt.id);
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
      title="Log a doubt"
      description="Leave the faculty field blank to route to the student's assigned subject teacher automatically, or the branch pool if there isn't one."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!complete}>Log doubt</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <FormSection title="Doubt">
        <FormRow>
          <Combobox
            label="Student"
            required
            placeholder="Search by name or code"
            options={(studentPage?.data ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.studentCode }))}
            value={studentId}
            onChange={setStudentId}
            error={errors.studentId}
          />
          <Combobox
            label="Subject"
            required
            placeholder="Select a subject"
            options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.code }))}
            value={subjectId}
            onChange={setSubjectId}
            error={errors.subjectId}
          />
        </FormRow>

        <Textarea
          label="Question"
          required
          rows={4}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          error={errors.question}
          placeholder="Couldn't work out why the reaction favours the anti product…"
        />

        <Combobox
          label="Assign to"
          placeholder="Auto-route (recommended)"
          options={(facultyPage?.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
          value={assignedToId}
          onChange={setAssignedToId}
          error={errors.assignedToId}
        />
      </FormSection>
    </FormModal>
  );
}
