'use client';

import * as React from 'react';
import { Alert, Combobox, FormModal, FormRow, FormSection, Input, Select, Textarea, useToast } from '@acadia/ui';
import { ENQUIRY_SOURCE_LABEL, TARGET_EXAM_LABEL, type EnquirySource, type TargetExam } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

export interface EditableEnquiry {
  id: string; studentName: string; phone: string; email: string | null;
  parentName: string | null; parentPhone: string | null;
  targetExam: TargetExam; source: EnquirySource;
  nextFollowUpAt: string | null; notes: string | null;
  course: { id: string } | null;
  assignedTo: { id: string } | null;
}

/** Branch is omitted when editing — `updateEnquirySchema` rejects it, so an
 *  enquiry stays with the branch that owns the follow-up. */
export function CreateEnquiryDrawer({
  open, enquiry, onClose, onCreated,
}: {
  open: boolean;
  enquiry?: EditableEnquiry | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const editing = Boolean(enquiry);
  const { toast } = useToast();
  const { activeBranch, branches } = useSession();
  const { data: courses } = useQuery<{ id: string; name: string }[]>(open ? '/courses' : null);
  const { data: staff } = useQuery<{ data: { id: string; name: string; role: string }[] }>(
    open ? '/staff' : null, { query: { pageSize: 100 } },
  );

  const [form, setForm] = React.useState({
    studentName: '', phone: '', email: '', parentName: '', parentPhone: '', nextFollowUpAt: '', notes: '',
  });
  const [targetExam, setTargetExam] = React.useState<TargetExam>('NEET');
  const [source, setSource] = React.useState<EnquirySource>('WALK_IN');
  const [courseId, setCourseId] = React.useState<string | null>(null);
  const [assignedToId, setAssignedToId] = React.useState<string | null>(null);
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm({
      studentName: enquiry?.studentName ?? '',
      phone: enquiry?.phone ?? '',
      email: enquiry?.email ?? '',
      parentName: enquiry?.parentName ?? '',
      parentPhone: enquiry?.parentPhone ?? '',
      nextFollowUpAt: enquiry?.nextFollowUpAt?.slice(0, 10) ?? '',
      notes: enquiry?.notes ?? '',
    });
    setTargetExam(enquiry?.targetExam ?? 'NEET');
    setSource(enquiry?.source ?? 'WALK_IN');
    setCourseId(enquiry?.course?.id ?? null);
    setAssignedToId(enquiry?.assignedTo?.id ?? null);
    setBranchId(activeBranch?.id ?? null);
    setErrors({}); setFormError(null);
  }, [open, activeBranch, enquiry]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const effectiveBranch = branchId ?? activeBranch?.id ?? null;
  const complete = form.studentName.trim() && form.phone.trim() && effectiveBranch;

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      const saved = await api<{ enquiryCode: string }>(
        enquiry ? `/admissions/enquiries/${enquiry.id}` : '/admissions/enquiries', {
        method: enquiry ? 'PATCH' : 'POST',
        body: {
          studentName: form.studentName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          parentName: form.parentName.trim() || undefined,
          parentPhone: form.parentPhone.trim() || undefined,
          targetExam,
          source,
          courseId: courseId ?? undefined,
          assignedToId: assignedToId ?? undefined,
          ...(enquiry ? {} : { branchId: effectiveBranch ?? undefined }),
          nextFollowUpAt: form.nextFollowUpAt || undefined,
          notes: form.notes.trim() || undefined,
        },
      });
      toast({
        kind: 'success',
        title: enquiry ? 'Enquiry updated' : 'Enquiry logged',
        description: enquiry ? `${saved.enquiryCode} was saved.` : `${saved.enquiryCode} is now in the pipeline.`,
      });
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

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit enquiry' : 'New enquiry'}
      description={editing ? 'Stage changes go through Move stage, not here.' : 'Starts at the New stage of the admissions pipeline.'}
      onSubmit={submit}
      submitLabel={editing ? 'Save changes' : 'Log enquiry'}
      canSubmit={Boolean(complete)}
      busy={busy}
      banner={formError ? <Alert tone="error">{formError}</Alert> : undefined}
      steps={[
        {
          label: 'Student',
          hint: 'Who is enquiring, and how to reach them.',
          // Name and phone are what makes an enquiry followable at all, so the
          // step will not advance without them.
          canContinue: Boolean(form.studentName.trim() && form.phone.trim()),
          content: (
            <FormSection title="Prospective student">
        <FormRow>
          <Input label="Student name" required value={form.studentName} onChange={set('studentName')} error={errors.studentName} placeholder="Ananya Nair" />
          <Input label="Phone" required value={form.phone} onChange={set('phone')} error={errors.phone} placeholder="+91 98765 43210" />
        </FormRow>
        <FormRow>
          <Input label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} />
          <Select
            label="Target exam"
            options={(Object.keys(TARGET_EXAM_LABEL) as TargetExam[]).map((t) => ({ value: t, label: TARGET_EXAM_LABEL[t] }))}
            value={targetExam}
            onChange={(v) => setTargetExam(v as TargetExam)}
          />
        </FormRow>
        <FormRow>
          <Input label="Parent name" value={form.parentName} onChange={set('parentName')} error={errors.parentName} />
          <Input label="Parent phone" value={form.parentPhone} onChange={set('parentPhone')} error={errors.parentPhone} />
        </FormRow>
            </FormSection>
          ),
        },
        {
          label: 'Pipeline',
          hint: 'Which branch owns the follow-up, and who does it.',
          content: (
            <FormSection title="Pipeline">
              {!editing && !effectiveBranch && (
                <Alert tone="warning" title="Pick a branch">
                  You are viewing all branches. Choose which branch will follow this up.
                </Alert>
              )}
        {!editing && branches.length > 1 && (
          <FormRow>
            <Combobox
              label="Branch"
              required
              placeholder="Select a branch"
              options={branches.map((b) => ({ value: b.id, label: b.name, meta: `${b.code} · ${b.city}` }))}
              value={effectiveBranch}
              onChange={setBranchId}
              error={errors.branchId}
            />
          </FormRow>
        )}
        <FormRow>
          <Select
            label="Source"
            options={(Object.keys(ENQUIRY_SOURCE_LABEL) as EnquirySource[]).map((s) => ({ value: s, label: ENQUIRY_SOURCE_LABEL[s] }))}
            value={source}
            onChange={(v) => setSource(v as EnquirySource)}
          />
          <Combobox
            label="Course of interest"
            placeholder="Not decided"
            options={(courses ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={courseId}
            onChange={setCourseId}
            error={errors.courseId}
          />
        </FormRow>
        <FormRow>
          <Combobox
            label="Counsellor"
            placeholder="Unassigned"
            options={(staff?.data ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.role.replace(/_/g, ' ').toLowerCase() }))}
            value={assignedToId}
            onChange={setAssignedToId}
            error={errors.assignedToId}
          />
          <Input label="Next follow-up" type="date" value={form.nextFollowUpAt} onChange={set('nextFollowUpAt')} error={errors.nextFollowUpAt} />
        </FormRow>
        <FormRow>
          <Textarea label="Notes" rows={3} value={form.notes} onChange={set('notes')} error={errors.notes} placeholder="Interested in the two-year NEET programme, wants hostel details." />
        </FormRow>
            </FormSection>
          ),
        },
      ]}
    />
  );
}
