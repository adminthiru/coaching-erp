'use client';

import * as React from 'react';
import {
  Alert, Button, Combobox, FormModal, FormRow, FormSection, Input, Select, useToast,
} from '@acadia/ui';
import { GENDER_LABEL, TARGET_EXAM_LABEL, type Gender, type TargetExam } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Course { id: string; name: string; targetExam: string }
interface BatchOption { id: string; name: string; code: string; seatsLeft: number; full: boolean; branch: { id: string } }

/** The subset of a student this form can edit — everything except placement. */
export interface EditableStudent {
  id: string; name: string; phone: string | null; email: string | null;
  dateOfBirth: string | null; gender: Gender; targetExam: TargetExam;
  parentName: string | null; parentPhone: string | null; parentRelation: string | null;
  previousSchool: string | null; previousClass: string | null; previousMarks: string | null;
  course: { id: string } | null;
}

/**
 * Spec §39. Admission is one form: the student, their parent, and where they land.
 *
 * The same form edits an existing student — pass `student`. Placement (branch and
 * batch) is deliberately absent when editing: `updateStudentSchema` omits both
 * because moving a student is the transfer flow (spec §35), which writes branch
 * history. Letting this form quietly reassign a branch would bypass that record.
 */
export function AddStudentDrawer({
  open, student, onClose, onCreated,
}: {
  open: boolean;
  /** Present ⇒ edit that student. Absent ⇒ admit a new one. */
  student?: EditableStudent | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const editing = Boolean(student);
  const { toast } = useToast();
  const { activeBranch, branches } = useSession();
  const { data: courses } = useQuery<Course[]>(open ? '/courses' : null);
  const { data: batchPage } = useQuery<{ data: BatchOption[] }>(open ? '/batches' : null, {
    query: { pageSize: 100, status: 'ACTIVE' },
  });

  const [form, setForm] = React.useState({
    name: '', phone: '', email: '', dateOfBirth: '',
    parentName: '', parentPhone: '', parentRelation: '',
    previousSchool: '', previousClass: '', previousMarks: '',
  });
  const [gender, setGender] = React.useState<Gender>('UNDISCLOSED');
  const [targetExam, setTargetExam] = React.useState<TargetExam>('NEET');
  const [courseId, setCourseId] = React.useState<string | null>(null);
  const [branchId, setBranchId] = React.useState<string | null>(null);
  const [batchId, setBatchId] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [limitReached, setLimitReached] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm({
      name: student?.name ?? '',
      phone: student?.phone ?? '',
      email: student?.email ?? '',
      // The API returns an ISO timestamp; <input type="date"> needs YYYY-MM-DD.
      dateOfBirth: student?.dateOfBirth?.slice(0, 10) ?? '',
      parentName: student?.parentName ?? '',
      parentPhone: student?.parentPhone ?? '',
      parentRelation: student?.parentRelation ?? '',
      previousSchool: student?.previousSchool ?? '',
      previousClass: student?.previousClass ?? '',
      previousMarks: student?.previousMarks ?? '',
    });
    setGender(student?.gender ?? 'UNDISCLOSED');
    setTargetExam(student?.targetExam ?? 'NEET');
    setCourseId(student?.course?.id ?? null);
    setBatchId(null);
    setBranchId(activeBranch?.id ?? null);
    setErrors({}); setFormError(null); setLimitReached(null);
  }, [open, activeBranch, student]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const effectiveBranch = branchId ?? activeBranch?.id ?? null;
  // A batch belongs to exactly one branch, so the picker follows the branch choice.
  const batchOptions = (batchPage?.data ?? []).filter((b) => b.branch.id === effectiveBranch);

  React.useEffect(() => { setBatchId(null); }, [effectiveBranch]);

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null); setLimitReached(null);
    try {
      const shared = {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        gender,
        parentName: form.parentName.trim() || undefined,
        parentPhone: form.parentPhone.trim() || undefined,
        parentRelation: form.parentRelation.trim() || undefined,
        previousSchool: form.previousSchool.trim() || undefined,
        previousClass: form.previousClass.trim() || undefined,
        previousMarks: form.previousMarks.trim() || undefined,
        targetExam,
        courseId: courseId ?? undefined,
      };

      const saved = student
        ? await api<{ name: string; studentCode: string }>(`/students/${student.id}`, {
            method: 'PATCH',
            // Placement is intentionally not sent: the API rejects it, and
            // changing a branch belongs to the transfer flow.
            body: shared,
          })
        : await api<{ name: string; studentCode: string }>('/students', {
            method: 'POST',
            body: { ...shared, branchId: effectiveBranch ?? undefined, batchId: batchId ?? undefined },
          });

      toast({
        kind: 'success',
        title: student ? 'Student updated' : 'Student admitted',
        description: student
          ? `${saved.name}'s details were saved.`
          : `${saved.name} was admitted as ${saved.studentCode}.`,
      });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'LIMIT_REACHED') setLimitReached(err.message);
        else {
          setErrors(err.fieldErrors);
          if (!Object.keys(err.fieldErrors).length) setFormError(err.message);
        }
      } else setFormError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  // Placement only applies to a new admission; editing never moves a student.
  const needsBranch = !editing && !effectiveBranch;
  // A student needs a name, and a new one needs a branch and plan headroom —
  // the API rejects all three, so the button should not offer them.
  const complete = Boolean(form.name.trim()) && !needsBranch && !limitReached;

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit student' : 'Add student'}
      description={editing ? 'Placement changes go through Transfer, not here.' : 'A student code is allocated automatically.'}
      onSubmit={submit}
      submitLabel={editing ? 'Save changes' : 'Admit student'}
      canSubmit={Boolean(complete)}
      busy={busy}
      banner={
        <>
          {formError && <Alert tone="error">{formError}</Alert>}
          {limitReached && (
            <Alert tone="error" title="Student limit reached">
              {limitReached} Contact your account manager to upgrade.
            </Alert>
          )}
          {needsBranch && (
            <Alert tone="warning" title="Pick a branch">
              You are viewing all branches. Choose which branch this student joins.
            </Alert>
          )}
        </>
      }
      steps={[
        {
          label: "Student",
          hint: "Name, contact and target exam.",
          canContinue: Boolean(form.name.trim()),
          content: (
            <FormSection title="Student">
        <FormRow>
          <Input label="Full name" required value={form.name} onChange={set('name')} error={errors.name} placeholder="Riya Sharma" />
          <Input label="Phone" value={form.phone} onChange={set('phone')} error={errors.phone} placeholder="+91 98765 43210" />
        </FormRow>
        <FormRow>
          <Input label="Date of birth" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} error={errors.dateOfBirth} />
          <Select
            label="Gender"
            options={(Object.keys(GENDER_LABEL) as Gender[]).map((g) => ({ value: g, label: GENDER_LABEL[g] }))}
            value={gender}
            onChange={(v) => setGender(v as Gender)}
          />
          <Input label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} />
        </FormRow>
            </FormSection>
          ),
        },

        ...(editing ? [] : [{
          label: "Placement",
          hint: "Which branch and batch they join.",
          content: (
            <FormSection title="Placement" description="Where the student studies.">
        {branches.length > 1 && (
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
            label="Target exam"
            options={(Object.keys(TARGET_EXAM_LABEL) as TargetExam[]).map((t) => ({ value: t, label: TARGET_EXAM_LABEL[t] }))}
            value={targetExam}
            onChange={(v) => setTargetExam(v as TargetExam)}
          />
          <Combobox
            label="Course"
            placeholder="No course"
            options={(courses ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={courseId}
            onChange={setCourseId}
            error={errors.courseId}
          />
        </FormRow>
        <FormRow>
          <Combobox
            label="Batch"
            placeholder={batchOptions.length ? 'Assign later' : 'No active batch in this branch'}
            options={batchOptions.map((b) => ({
              value: b.id,
              label: b.name,
              meta: b.full ? 'Full' : `${b.seatsLeft} seats left`,
              disabled: b.full,
            }))}
            value={batchId}
            onChange={setBatchId}
            error={errors.batchId}
            helperText="Full batches cannot be selected."
          />
        </FormRow>
            </FormSection>
          ),
        }]),

        {
          label: "Guardian",
          hint: "Who the branch calls.",
          content: (
            <FormSection title="Parent / guardian">
        <FormRow>
          <Input label="Name" value={form.parentName} onChange={set('parentName')} error={errors.parentName} />
          <Input label="Phone" value={form.parentPhone} onChange={set('parentPhone')} error={errors.parentPhone} />
          <Input label="Relation" value={form.parentRelation} onChange={set('parentRelation')} placeholder="Father" />
        </FormRow>
            </FormSection>
          ),
        },

        {
          label: "Background",
          hint: "Optional — prior schooling.",
          content: (
            <FormSection title="Academic background">
        <FormRow>
          <Input label="Previous school" value={form.previousSchool} onChange={set('previousSchool')} />
          <Input label="Class" value={form.previousClass} onChange={set('previousClass')} placeholder="XI" />
          <Input label="Marks" value={form.previousMarks} onChange={set('previousMarks')} placeholder="86%" />
        </FormRow>
            </FormSection>
          ),
        },
      ]}
    />
  );
}
