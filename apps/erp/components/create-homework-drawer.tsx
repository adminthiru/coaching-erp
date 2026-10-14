'use client';

import * as React from 'react';
import {
  Alert, Button, Combobox, FormModal, FormRow, FormSection, Input, MultiCombobox, RadioGroup, Textarea, useToast,
} from '@acadia/ui';
import { HOMEWORK_AUDIENCE_LABEL, type HomeworkAudience } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Subject { id: string; name: string; code: string }
interface BatchOption { id: string; name: string; code: string; branchId: string }
interface StudentOption { id: string; name: string; studentCode: string }

/** Spec §58 — assigning homework to a batch, one or more branches, or named students. */
export function CreateHomeworkDrawer({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const { activeBranch, branches } = useSession();

  const { data: subjects } = useQuery<Subject[]>(open ? '/subjects' : null);
  const { data: batchPage } = useQuery<{ data: BatchOption[] }>(open ? '/batches' : null, { query: { pageSize: 200, status: 'ACTIVE' } });
  const { data: studentPage } = useQuery<{ data: StudentOption[] }>(open ? '/students' : null, { query: { pageSize: 200, status: 'ACTIVE' } });

  const [title, setTitle] = React.useState('');
  const [instructions, setInstructions] = React.useState('');
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [audience, setAudience] = React.useState<HomeworkAudience>('BATCH');
  const [batchId, setBatchId] = React.useState<string | null>(null);
  const [branchIds, setBranchIds] = React.useState<string[]>([]);
  const [studentIds, setStudentIds] = React.useState<string[]>([]);
  const [dueAt, setDueAt] = React.useState('');
  const [maxMarks, setMaxMarks] = React.useState('');
  const [attachmentUrl, setAttachmentUrl] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(''); setInstructions(''); setSubjectId(null);
    setAudience('BATCH'); setBatchId(null);
    setBranchIds(activeBranch ? [activeBranch.id] : []);
    setStudentIds([]); setDueAt(''); setMaxMarks(''); setAttachmentUrl('');
    setErrors({}); setFormError(null);
  }, [open, activeBranch]);

  const complete =
    title.trim().length >= 3 &&
    instructions.trim().length >= 3 &&
    dueAt &&
    (audience === 'BATCH' ? Boolean(batchId)
      : audience === 'STUDENTS' ? studentIds.length > 0
        : branchIds.length > 0);

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      const homework = await api<{ id: string; title: string }>('/homework', {
        method: 'POST',
        body: {
          title: title.trim(),
          instructions: instructions.trim(),
          subjectId: subjectId ?? undefined,
          audience,
          batchId: audience === 'BATCH' ? batchId : undefined,
          branchIds: audience === 'BRANCH' || audience === 'MULTI_BRANCH' ? branchIds : [],
          studentIds: audience === 'STUDENTS' ? studentIds : [],
          dueAt: new Date(dueAt).toISOString(),
          maxMarks: maxMarks ? Number(maxMarks) : undefined,
          attachmentUrl: attachmentUrl.trim() || undefined,
        },
      });
      toast({ kind: 'success', title: 'Homework created', description: `${homework.title} is a draft — publish it when ready.` });
      onCreated(homework.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) setFormError(err.message);
      } else setFormError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const audienceOptions: { value: HomeworkAudience; label: string; description: string }[] = [
    { value: 'BATCH', label: HOMEWORK_AUDIENCE_LABEL.BATCH, description: 'Every student currently enrolled.' },
    { value: 'BRANCH', label: HOMEWORK_AUDIENCE_LABEL.BRANCH, description: 'Every active student at the branch(es) you pick.' },
    { value: 'MULTI_BRANCH', label: HOMEWORK_AUDIENCE_LABEL.MULTI_BRANCH, description: 'Same as branches, for more than one at once.' },
    { value: 'STUDENTS', label: HOMEWORK_AUDIENCE_LABEL.STUDENTS, description: 'Only the students you name.' },
  ];

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="lg"
      title="New homework"
      description="Set who it reaches now; publishing later locks the targeting and creates the roster."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!complete}>Create homework</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <FormSection title="Assignment">
        <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="Thermodynamics — problem set 3" />
        <Textarea label="Instructions" required rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} error={errors.instructions} />
        <FormRow>
          <Combobox
            label="Subject"
            placeholder="Optional"
            options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.code }))}
            value={subjectId}
            onChange={setSubjectId}
          />
          <Input label="Due" type="datetime-local" required value={dueAt} onChange={(e) => setDueAt(e.target.value)} error={errors.dueAt} />
        </FormRow>
        <FormRow>
          <Input label="Max marks" type="number" min="0" placeholder="Optional" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} error={errors.maxMarks} />
          <Input label="Attachment URL" placeholder="Optional link to the worksheet" value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} error={errors.attachmentUrl} />
        </FormRow>
      </FormSection>

      <FormSection title="Who this reaches">
        <RadioGroup name="audience" variant="card" options={audienceOptions} value={audience} onChange={setAudience} />

        {audience === 'BATCH' && (
          <Combobox
            label="Batch"
            required
            placeholder="Pick a batch"
            options={(batchPage?.data ?? []).map((b) => ({ value: b.id, label: b.name, meta: b.code }))}
            value={batchId}
            onChange={setBatchId}
            error={errors.batchId}
          />
        )}

        {(audience === 'BRANCH' || audience === 'MULTI_BRANCH') && (
          <MultiCombobox
            label="Branches"
            required
            placeholder="Pick branches"
            options={branches.map((b) => ({ value: b.id, label: b.name, meta: b.code }))}
            value={branchIds}
            onChange={setBranchIds}
            error={errors.branchIds}
          />
        )}

        {audience === 'STUDENTS' && (
          <MultiCombobox
            label="Students"
            required
            placeholder="Search and pick students"
            options={(studentPage?.data ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.studentCode }))}
            value={studentIds}
            onChange={setStudentIds}
            error={errors.studentIds}
          />
        )}
      </FormSection>
    </FormModal>
  );
}
