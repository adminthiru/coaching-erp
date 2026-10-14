'use client';

import * as React from 'react';
import {
  Alert, Button, Combobox, FormModal, FormRow, FormSection, Input, Select, Switch, Textarea, useToast,
} from '@acadia/ui';
import {
  DIFFICULTY_LABEL, QUESTION_TYPE_LABEL, isChoiceQuestion,
  type Difficulty, type QuestionType,
} from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Option { label: string; body: string; isCorrect: boolean }

const BLANK: Option[] = [
  { label: 'A', body: '', isCorrect: true },
  { label: 'B', body: '', isCorrect: false },
  { label: 'C', body: '', isCorrect: false },
  { label: 'D', body: '', isCorrect: false },
];

/** Spec §51 — authoring a question into the shared or branch library. */
export interface EditableQuestion {
  id: string; body: string; explanation?: string | null;
  type: QuestionType; difficulty: Difficulty;
  marks: number; negativeMarks: number;
  numericAnswer?: number | null; numericTolerance?: number;
  subject: { id: string }; chapter?: { id: string } | null;
  options: { label: string; body: string; isCorrect?: boolean }[];
}

/**
 * Editing is refused by the API once a question has been sat in a live test
 * (`lockedAt`), so callers must not offer it for a locked question — duplicate
 * it instead. See spec §51.
 */
export function CreateQuestionDrawer({
  open, question, onClose, onCreated,
}: {
  open: boolean;
  question?: EditableQuestion | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const editing = Boolean(question);
  const { toast } = useToast();
  const { scope: sessionScope } = useSession();
  const { data: subjects } = useQuery<{ id: string; name: string; code: string }[]>(open ? '/subjects' : null);

  const [type, setType] = React.useState<QuestionType>('SINGLE_CHOICE');
  const [difficulty, setDifficulty] = React.useState<Difficulty>('MEDIUM');
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [chapterId, setChapterId] = React.useState<string | null>(null);
  const [body, setBody] = React.useState('');
  const [explanation, setExplanation] = React.useState('');
  const [marks, setMarks] = React.useState('4');
  const [negative, setNegative] = React.useState('1');
  const [options, setOptions] = React.useState<Option[]>(BLANK);
  const [numericAnswer, setNumericAnswer] = React.useState('');
  const [tolerance, setTolerance] = React.useState('0');
  const [shared, setShared] = React.useState(true);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Only an org-level role may add to the library every branch draws on.
  const canShare = sessionScope?.canSelectAllBranches ?? false;

  const tree = useQuery<{ id: string; chapters: { id: string; name: string }[] }[]>(
    open && subjectId ? '/syllabus/tree' : null,
    { query: { subjectId: subjectId ?? undefined } },
    [subjectId],
  );

  React.useEffect(() => {
    if (!open) return;
    setType(question?.type ?? 'SINGLE_CHOICE');
    setDifficulty(question?.difficulty ?? 'MEDIUM');
    setSubjectId(question?.subject.id ?? null);
    setChapterId(question?.chapter?.id ?? null);
    setBody(question?.body ?? '');
    setExplanation(question?.explanation ?? '');
    setMarks(String(question?.marks ?? 4));
    setNegative(String(question?.negativeMarks ?? 1));
    setOptions(
      question?.options.length
        ? question.options.map((o) => ({ label: o.label, body: o.body, isCorrect: Boolean(o.isCorrect) }))
        : BLANK.map((o) => ({ ...o })),
    );
    setNumericAnswer(question?.numericAnswer != null ? String(question.numericAnswer) : '');
    setTolerance(String(question?.numericTolerance ?? 0));
    setShared(canShare);
    setErrors({}); setFormError(null);
  }, [open, canShare, question]);

  React.useEffect(() => { setChapterId(null); }, [subjectId]);

  // True/false has a fixed pair of options; switching type resets them.
  React.useEffect(() => {
    if (type === 'TRUE_FALSE') {
      setOptions([
        { label: 'A', body: 'True', isCorrect: true },
        { label: 'B', body: 'False', isCorrect: false },
      ]);
    } else if (type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE') {
      setOptions((prev) => (prev.length >= 4 ? prev : BLANK.map((o) => ({ ...o }))));
    }
  }, [type]);

  function toggleCorrect(index: number) {
    setOptions((prev) =>
      prev.map((o, i) =>
        type === 'MULTIPLE_CHOICE'
          ? i === index ? { ...o, isCorrect: !o.isCorrect } : o
          : { ...o, isCorrect: i === index },
      ),
    );
  }

  const choice = isChoiceQuestion(type);
  const complete =
    Boolean(subjectId) &&
    body.trim().length >= 3 &&
    (choice
      ? options.filter((o) => o.body.trim()).length >= 2 && options.some((o) => o.isCorrect && o.body.trim())
      : numericAnswer.trim() !== '');

  async function submit() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api(question ? `/questions/${question.id}` : '/questions', {
        method: question ? 'PATCH' : 'POST',
        body: {
          subjectId,
          chapterId: chapterId ?? undefined,
          branchId: shared && canShare ? null : undefined,
          type,
          difficulty,
          body: body.trim(),
          explanation: explanation.trim() || undefined,
          marks: Number(marks) || 4,
          negativeMarks: Number(negative) || 0,
          options: choice
            ? options
                .filter((o) => o.body.trim())
                .map((o, i) => ({ label: String.fromCharCode(65 + i), body: o.body.trim(), isCorrect: o.isCorrect }))
            : [],
          numericAnswer: choice ? undefined : Number(numericAnswer),
          numericTolerance: Number(tolerance) || 0,
        },
      });
      toast({
        kind: 'success',
        title: question ? 'Question updated' : 'Question added',
        description: question ? 'The change applies to new papers only.' : 'It is available for new papers.',
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

  const chapters = tree.data?.[0]?.chapters ?? [];

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit question' : 'New question'}
      description="Marks set here are the bank's default; a paper can override them."
      onSubmit={submit}
      submitLabel={editing ? 'Save changes' : 'Add to bank'}
      canSubmit={Boolean(complete)}
      busy={busy}
      banner={formError ? <Alert tone="error">{formError}</Alert> : undefined}
      steps={[
        {
          label: "Classify",
          hint: "Subject, type and difficulty decide where this question can be used.",
          canContinue: Boolean(subjectId),
          content: (
      <FormSection title="Classification">
        <FormRow>
          <Combobox
            label="Subject"
            required
            placeholder="Select a subject"
            options={(subjects ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.code }))}
            value={subjectId}
            onChange={setSubjectId}
            error={errors.subjectId}
          />
          <Combobox
            label="Chapter"
            placeholder={subjectId ? (chapters.length ? 'Optional' : 'No chapters yet') : 'Pick a subject first'}
            options={chapters.map((c) => ({ value: c.id, label: c.name }))}
            value={chapterId}
            onChange={setChapterId}
            error={errors.chapterId}
          />
        </FormRow>
        <FormRow>
          <Select
            label="Question type"
            options={(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => ({ value: t, label: QUESTION_TYPE_LABEL[t] }))}
            value={type}
            onChange={(v) => setType(v as QuestionType)}
          />
          <Select
            label="Difficulty"
            options={(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))}
            value={difficulty}
            onChange={(v) => setDifficulty(v as Difficulty)}
          />
        </FormRow>
        {canShare && (
          <Switch
            label="Add to the shared library"
            description="Shared questions are reusable by every branch. Turn this off to keep it private to your branch."
            checked={shared}
            onChange={setShared}
          />
        )}
            </FormSection>
          ),
        },
        {
          label: "Question",
          hint: "The stem, its marks, and the answer.",
          canContinue: Boolean(body.trim().length >= 3),
          content: (
            <>
            <FormSection title="Question">
        <Textarea
          label="Question text"
          required
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          error={errors.body}
          placeholder="A body moves 20 m north then 20 m east. What is its displacement?"
        />
        <FormRow>
          <Input label="Marks" type="number" step="0.25" min="0.25" required value={marks} onChange={(e) => setMarks(e.target.value)} error={errors.marks} />
          <Input
            label="Negative marks"
            type="number"
            step="0.25"
            min="0"
            value={negative}
            onChange={(e) => setNegative(e.target.value)}
            error={errors.negativeMarks}
            helperText="Applied only when the test enables negative marking."
          />
        </FormRow>
            </FormSection>

      {choice ? (
        <FormSection
          title="Options"
          description={type === 'MULTIPLE_CHOICE' ? 'Tick every correct option — marking is all-or-nothing.' : 'Tick the single correct option.'}
        >
          {errors.options && <span className="text-caption text-error">{errors.options}</span>}
          <div className="flex flex-col gap-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleCorrect(i)}
                  aria-pressed={o.isCorrect}
                  aria-label={`Mark option ${String.fromCharCode(65 + i)} correct`}
                  className={
                    o.isCorrect
                      ? 'grid size-8 shrink-0 place-items-center rounded-md border border-success bg-success text-[12px] font-bold text-white'
                      : 'grid size-8 shrink-0 place-items-center rounded-md border border-border-strong bg-surface text-[12px] font-semibold text-fg-secondary hover:border-success'
                  }
                >
                  {String.fromCharCode(65 + i)}
                </button>
                <input
                  value={o.body}
                  onChange={(e) => setOptions((prev) => prev.map((x, xi) => (xi === i ? { ...x, body: e.target.value } : x)))}
                  disabled={type === 'TRUE_FALSE'}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className="h-[38px] flex-1 rounded-md border border-border-strong bg-surface px-3 text-body-sm text-fg outline-none focus:border-primary disabled:bg-surface-secondary disabled:text-fg-disabled"
                />
              </div>
            ))}
          </div>
        </FormSection>
      ) : (
        <FormSection title="Numeric answer">
          <FormRow>
            <Input
              label="Correct value"
              type="number"
              step="any"
              required
              value={numericAnswer}
              onChange={(e) => setNumericAnswer(e.target.value)}
              error={errors.numericAnswer}
              placeholder="28.28"
            />
            <Input
              label="Tolerance"
              type="number"
              step="any"
              min="0"
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
              helperText="An answer within ± this margin is accepted."
            />
          </FormRow>
        </FormSection>
      )}
            </>
          ),
        },
        {
          label: "Solution",
          hint: "Optional — shown to students only after results are published.",
          content: (
            <FormSection title="Solution">
        <Textarea
          label="Explanation"
          rows={3}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          error={errors.explanation}
          helperText="Shown to students only after results are published."
        />
            </FormSection>
          ),
        },
      ]}
    />
  );
}
