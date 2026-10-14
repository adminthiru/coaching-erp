'use client';

import * as React from 'react';
import {
  Alert, Button, Combobox, FormModal, FormRow, FormSection, Input, MultiCombobox, RadioGroup, Textarea, useToast,
} from '@acadia/ui';
import { MATERIAL_AUDIENCE_LABEL, type MaterialAudience } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Subject { id: string; name: string; code: string }
interface BatchOption { id: string; name: string; code: string; branchId: string }
interface StudentOption { id: string; name: string; studentCode: string }

/** Spec §60 — study materials, from an organization-wide library down to a named student. */
export function CreateMaterialDrawer({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { activeBranch, branches, scope: sessionScope } = useSession();
  const canGoOrgWide = sessionScope?.canSelectAllBranches ?? false;

  const { data: subjects } = useQuery<Subject[]>(open ? '/subjects' : null);
  const { data: batchPage } = useQuery<{ data: BatchOption[] }>(open ? '/batches' : null, { query: { pageSize: 200, status: 'ACTIVE' } });
  const { data: studentPage } = useQuery<{ data: StudentOption[] }>(open ? '/students' : null, { query: { pageSize: 200, status: 'ACTIVE' } });

  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [audience, setAudience] = React.useState<MaterialAudience>('BATCH');
  const [batchId, setBatchId] = React.useState<string | null>(null);
  const [branchIds, setBranchIds] = React.useState<string[]>([]);
  const [studentIds, setStudentIds] = React.useState<string[]>([]);
  const [fileUrl, setFileUrl] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(''); setDescription(''); setSubjectId(null);
    setAudience('BATCH'); setBatchId(null);
    setBranchIds(activeBranch ? [activeBranch.id] : []);
    setStudentIds([]); setFileUrl('');
    setErrors({}); setFormError(null);
  }, [open, activeBranch]);

  const complete =
    title.trim().length >= 3 &&
    fileUrl.trim() &&
    (audience === 'ORGANIZATION' ? true
      : audience === 'BATCH' ? Boolean(batchId)
        : audience === 'STUDENTS' ? studentIds.length > 0
          : branchIds.length > 0);

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api('/materials', {
        method: 'POST',
        body: {
          title: title.trim(),
          description: description.trim() || undefined,
          subjectId: subjectId ?? undefined,
          audience,
          batchId: audience === 'BATCH' ? batchId : undefined,
          branchIds: audience === 'BRANCH' || audience === 'MULTI_BRANCH' ? branchIds : [],
          studentIds: audience === 'STUDENTS' ? studentIds : [],
          fileUrl: fileUrl.trim(),
        },
      });
      toast({ kind: 'success', title: 'Material added', description: 'It is now visible to everyone it reaches.' });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) setFormError(err.message);
      } else setFormError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const audienceOptions: { value: MaterialAudience; label: string; description: string }[] = [
    ...(canGoOrgWide
      ? [{ value: 'ORGANIZATION' as const, label: MATERIAL_AUDIENCE_LABEL.ORGANIZATION, description: 'Visible to every branch.' }]
      : []),
    { value: 'BATCH', label: MATERIAL_AUDIENCE_LABEL.BATCH, description: 'Every student currently enrolled.' },
    { value: 'BRANCH', label: MATERIAL_AUDIENCE_LABEL.BRANCH, description: 'Every active student at the branch(es) you pick.' },
    { value: 'MULTI_BRANCH', label: MATERIAL_AUDIENCE_LABEL.MULTI_BRANCH, description: 'Same as branches, for more than one at once.' },
    { value: 'STUDENTS', label: MATERIAL_AUDIENCE_LABEL.STUDENTS, description: 'Only the students you name.' },
  ];

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="lg"
      title="New study material"
      description="Materials are a link today — paste one to a file already hosted elsewhere."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!complete}>Add material</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <FormSection title="Material">
        <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="Organic Chemistry — reaction mechanisms" />
        <Textarea label="Description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
        <FormRow>
          <Combobox
            label="Subject"
            placeholder="Optional"
            options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.code }))}
            value={subjectId}
            onChange={setSubjectId}
          />
          <Input label="File URL" required value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} error={errors.fileUrl} placeholder="https://…" />
        </FormRow>
      </FormSection>

      <FormSection title="Who can see this">
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
