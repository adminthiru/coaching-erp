'use client';

import * as React from 'react';
import {
  Alert, Button, Combobox, FormModal, FormRow, FormSection, Input, MultiCombobox, RadioGroup, Select,
  Switch, Textarea, useToast,
} from '@acadia/ui';
import { TEST_SCOPE_LABEL, type TestScope } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Course { id: string; name: string; targetExam: string }
interface BatchOption { id: string; name: string; code: string; branch: { id: string } }

/** Spec §52 — creating a test paper and choosing who it reaches. */
export function CreateTestDrawer({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const { activeBranch, branches, scope: sessionScope } = useSession();
  const canGoOrgWide = sessionScope?.canSelectAllBranches ?? false;

  const { data: courses } = useQuery<Course[]>(open ? '/courses' : null);
  const { data: batchPage } = useQuery<{ data: BatchOption[] }>(open ? '/batches' : null, { query: { pageSize: 200, status: 'ACTIVE' } });

  const [form, setForm] = React.useState({
    title: '', code: '', description: '', durationMinutes: '180', startAt: '', endAt: '',
  });
  const [codeTouched, setCodeTouched] = React.useState(false);
  const [scope, setScope] = React.useState<TestScope>('BRANCH');
  const [branchIds, setBranchIds] = React.useState<string[]>([]);
  const [batchIds, setBatchIds] = React.useState<string[]>([]);
  const [courseId, setCourseId] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<'ONLINE' | 'OFFLINE'>('ONLINE');
  const [negativeMarking, setNegativeMarking] = React.useState(true);
  const [shuffleQuestions, setShuffleQuestions] = React.useState(false);
  const [instantResults, setInstantResults] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm({ title: '', code: '', description: '', durationMinutes: '180', startAt: '', endAt: '' });
    setCodeTouched(false);
    setScope('BRANCH');
    setBranchIds(activeBranch ? [activeBranch.id] : []);
    setBatchIds([]);
    setCourseId(null);
    setMode('ONLINE');
    setNegativeMarking(true); setShuffleQuestions(false); setInstantResults(false);
    setErrors({}); setFormError(null);
  }, [open, activeBranch]);

  React.useEffect(() => {
    if (codeTouched) return;
    setForm((f) => ({ ...f, code: f.title.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) }));
  }, [form.title, codeTouched]);

  // Batches outside the chosen branches would never see the paper — drop them
  // as soon as the branch selection narrows.
  React.useEffect(() => {
    if (scope === 'ORGANIZATION') return;
    setBatchIds((prev) => prev.filter((id) => {
      const b = (batchPage?.data ?? []).find((x) => x.id === id);
      return b && branchIds.includes(b.branch.id);
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, branchIds]);

  const set = (k: 'title' | 'description' | 'durationMinutes') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const eligibleBatches = (batchPage?.data ?? []).filter(
    (b) => scope === 'ORGANIZATION' || branchIds.includes(b.branch.id),
  );

  const complete =
    form.title.trim().length >= 3 &&
    form.code.trim() &&
    form.startAt &&
    form.endAt &&
    batchIds.length > 0 &&
    (scope === 'ORGANIZATION' || branchIds.length > 0);

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      const test = await api<{ id: string; title: string }>('/tests', {
        method: 'POST',
        body: {
          title: form.title.trim(),
          code: form.code.trim(),
          description: form.description.trim() || undefined,
          scope,
          mode,
          courseId: courseId ?? undefined,
          branchIds: scope === 'ORGANIZATION' ? [] : branchIds,
          batchIds,
          durationMinutes: Number(form.durationMinutes) || 180,
          startAt: new Date(form.startAt).toISOString(),
          endAt: new Date(form.endAt).toISOString(),
          negativeMarking,
          shuffleQuestions,
          instantResults,
        },
      });
      toast({ kind: 'success', title: 'Test created', description: `${test.title} is a draft — build the paper next.` });
      onCreated(test.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) setFormError(err.message);
      } else setFormError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const scopeOptions = [
    { value: 'BRANCH' as const, label: 'One or more branches', description: 'Runs only where you choose.' },
    ...(canGoOrgWide
      ? [{ value: 'ORGANIZATION' as const, label: TEST_SCOPE_LABEL.ORGANIZATION, description: 'Every branch sits this paper.' }]
      : []),
  ];

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="lg"
      title="New test"
      description="Set the reach and window now; add questions once it's created."
      onSubmit={submit}
      submitLabel="Create test"
      canSubmit={Boolean(complete)}
      busy={busy}
      banner={formError ? <Alert tone="error">{formError}</Alert> : undefined}
      steps={[

        {
          label: "Paper",
          hint: "What the test is called and which course it belongs to.",
          canContinue: Boolean(form.title.trim().length >= 3 && form.code.trim()),
          content: (
            <FormSection title="Test">
        <FormRow>
          <Input label="Title" required value={form.title} onChange={set('title')} error={errors.title} placeholder="All India Mock Test #4" />
          <Input
            label="Code"
            required
            value={form.code}
            onChange={(e) => { setCodeTouched(true); setForm((f) => ({ ...f, code: e.target.value.toUpperCase() })); }}
            error={errors.code}
            helperText="Unique within your organization."
          />
        </FormRow>
        <Textarea label="Description" rows={2} value={form.description} onChange={set('description')} error={errors.description} />
        <Combobox
          label="Course"
          placeholder="Optional"
          options={(courses ?? []).map((c) => ({ value: c.id, label: c.name, meta: c.targetExam.replace(/_/g, ' ') }))}
          value={courseId}
          onChange={setCourseId}
          error={errors.courseId}
        />
            </FormSection>
          ),
        },

        {
          label: "Reach",
          hint: "Which branches sit it, and which batches take it.",
          canContinue: Boolean(batchIds.length > 0 && (scope === 'ORGANIZATION' || branchIds.length > 0)),
          content: (
            <FormSection title="Reach">
        <RadioGroup
          name="scope"
          variant="card"
          options={scopeOptions}
          value={scope}
          onChange={setScope}
        />
        {scope !== 'ORGANIZATION' && (
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
        <MultiCombobox
          label="Batches"
          required
          placeholder={eligibleBatches.length ? 'Pick batches sitting this test' : 'Pick a branch first'}
          options={eligibleBatches.map((b) => ({ value: b.id, label: b.name, meta: b.code }))}
          value={batchIds}
          onChange={setBatchIds}
          error={errors.batchIds}
          helperText="Only students enrolled in a chosen batch can sit this test."
        />
            </FormSection>
          ),
        },

        {
          label: "Window",
          hint: "When it opens, when it closes, how long each student gets.",
          canContinue: Boolean(form.startAt && form.endAt),
          content: (
            <FormSection title="Window">
        <FormRow>
          <Input label="Opens" type="datetime-local" required value={form.startAt} onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))} error={errors.startAt} />
          <Input label="Closes" type="datetime-local" required value={form.endAt} onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))} error={errors.endAt} />
        </FormRow>
        <FormRow>
          <Select
            label="Mode"
            options={[{ value: 'ONLINE', label: 'Online' }, { value: 'OFFLINE', label: 'Offline (OMR / paper)' }]}
            value={mode}
            onChange={(v) => setMode(v as 'ONLINE' | 'OFFLINE')}
          />
          <Input
            label="Duration"
            type="number"
            min="5"
            max="600"
            required
            value={form.durationMinutes}
            onChange={set('durationMinutes')}
            error={errors.durationMinutes}
            helperText="Minutes given per student, once started."
          />
        </FormRow>
            </FormSection>
          ),
        },

        {
          label: "Rules",
          hint: "Marking and delivery options.",
          content: (
            <FormSection title="Rules">
        <Switch label="Negative marking" description="Applies each question's negative marks to a wrong answer." checked={negativeMarking} onChange={setNegativeMarking} />
        <Switch label="Shuffle questions" description="Each candidate sees the paper in a different order." checked={shuffleQuestions} onChange={setShuffleQuestions} />
        <Switch label="Instant results" description="Reveal a student's own score as soon as they submit." checked={instantResults} onChange={setInstantResults} />
            </FormSection>
          ),
        },
      ]}
    />
  );
}
