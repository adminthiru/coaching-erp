'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Alert, Badge, Button, Card, CardContent, Checkbox, ConfirmDialog, ErrorState, Input, Progress,
  RadioGroup, Skeleton, useToast,
} from '@acadia/ui';
import type { QuestionType } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface AttemptQuestion {
  id: string; sequence: number; marks: number; negativeMarks: number;
  type: QuestionType; body: string; subject: { id: string; name: string; code: string };
  options: { id: string; label: string; body: string }[];
  saved: { selectedOptionIds: string[]; numericAnswer: number | null } | null;
}

interface ResumePayload {
  attempt: {
    id: string; status: string; startedAt: string; expiresAt: string;
    secondsRemaining: number; lastSavedAt: string | null; submittedAt: string | null;
  };
  test: { id: string; title: string; code: string; durationMinutes: number; status: string; totalMarks: number };
  student: { id: string; name: string; studentCode: string };
  questions: AttemptQuestion[];
  progress: { total: number; answered: number };
}

interface SubmitResult {
  id: string; status: string; score: number; maxScore: number; percentage: number | null;
  correctCount: number; wrongCount: number; unattemptedCount: number; submittedAt: string;
}

interface Answer { selectedOptionIds: string[]; numericAnswer: number | null }

function formatClock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

const empty = (): Answer => ({ selectedOptionIds: [], numericAnswer: null });

/**
 * Spec §53 — the exam room. The countdown is a client-side mirror of the
 * server's clock; the server is the one that actually enforces the deadline
 * (see `enforceDeadline` in attempts.service.ts), so a paused tab or a wrong
 * device clock cannot buy extra time — it only desyncs the display until the
 * next submit attempt corrects it.
 */
export default function AttemptPage() {
  const params = useSearchParams();
  const testId = params.get('test') ?? '';
  const attemptId = params.get('id') ?? '';
  const router = useRouter();
  const { toast } = useToast();

  const { data, error, loading } = useQuery<ResumePayload>(`/attempts/${attemptId}`);

  const [answers, setAnswers] = React.useState<Record<string, Answer>>({});
  const [current, setCurrent] = React.useState(0);
  const [remaining, setRemaining] = React.useState<number | null>(null);
  const [dirty, setDirty] = React.useState<Set<string>>(new Set());
  const [confirmSubmit, setConfirmSubmit] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<SubmitResult | null>(null);
  const initialized = React.useRef(false);

  React.useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setAnswers(Object.fromEntries(data.questions.map((q) => [q.id, q.saved ?? empty()])));
    setRemaining(data.attempt.secondsRemaining);
  }, [data]);

  const submit = React.useCallback(
    async (auto: boolean) => {
      setSubmitting(true);
      try {
        const res = await api<SubmitResult>(`/attempts/${attemptId}/submit`, { method: 'POST' });
        setResult(res);
        if (auto) toast({ kind: 'info', title: 'Time is up', description: 'This attempt was submitted automatically.' });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ALREADY_SUBMITTED') {
          toast({ kind: 'info', title: 'Already submitted', description: 'This attempt was already closed.' });
          router.push(`/tests/view?id=${testId}`);
        } else {
          toast({ kind: 'error', title: 'Could not submit', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
        }
      } finally {
        setSubmitting(false);
        setConfirmSubmit(false);
      }
    },
    [attemptId, testId, router, toast],
  );

  // Countdown, ticking client-side from the server-issued remaining time.
  React.useEffect(() => {
    if (remaining === null || result || (data && data.attempt.status !== 'IN_PROGRESS')) return;
    if (remaining <= 0) { submit(true); return; }
    const t = setTimeout(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(t);
  }, [remaining, result, data, submit]);

  // Autosave dirty answers, debounced so a run of clicks becomes one request.
  React.useEffect(() => {
    if (dirty.size === 0) return;
    const t = setTimeout(async () => {
      const ids = Array.from(dirty);
      setDirty(new Set());
      try {
        await api(`/attempts/${attemptId}/answers`, {
          method: 'POST',
          body: { answers: ids.map((qid) => ({ questionId: qid, ...answers[qid] })) },
        });
      } catch {
        setDirty((prev) => new Set([...prev, ...ids]));
      }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  function setAnswer(questionId: string, value: Answer) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setDirty((prev) => new Set(prev).add(questionId));
  }

  if (error) {
    return (
      <div className="px-5 py-5 lg:px-6">
        <ErrorState
          kind={error instanceof ApiError && error.status === 403 ? 'forbidden' : 'not-found'}
          description={error.message}
          action={<Button variant="outline" onClick={() => router.push(`/tests/view?id=${testId}`)}>Back to test</Button>}
        />
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-3.5 px-5 py-10 lg:px-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <Badge variant="success">Submitted</Badge>
            <h1 className="text-h2 text-fg">{data.student.name}&rsquo;s attempt is in</h1>
            <div className="font-mono text-h1 tabular-nums text-fg">{result.score} / {result.maxScore}</div>
            <div className="flex gap-6 text-body-sm text-fg-secondary">
              <span>{result.correctCount} correct</span>
              <span>{result.wrongCount} wrong</span>
              <span>{result.unattemptedCount} unattempted</span>
            </div>
            <p className="text-caption text-fg-muted">
              Ranks and percentile appear once results for {data.test.title} are published.
            </p>
            <Button onClick={() => router.push(`/tests/view?id=${testId}`)}>Back to test</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.attempt.status !== 'IN_PROGRESS') {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-3.5 px-5 py-10 lg:px-6">
        <Alert tone="info" title="This attempt is already closed">
          {data.student.name}{' '}
          {data.attempt.status === 'AUTO_SUBMITTED' ? 'ran out of time and was submitted automatically' : 'already submitted this attempt'}
          {data.attempt.submittedAt && ` on ${new Date(data.attempt.submittedAt).toLocaleString()}`}.
        </Alert>
        <Button variant="outline" onClick={() => router.push(`/tests/view?id=${testId}`)}>Back to test</Button>
      </div>
    );
  }

  const question = data.questions[current];
  const answer = answers[question.id] ?? empty();
  const answeredCount = data.questions.filter((q) => {
    const a = answers[q.id];
    return a && (a.selectedOptionIds.length > 0 || a.numericAnswer !== null);
  }).length;
  const low = remaining !== null && remaining <= 300;

  return (
    <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{data.test.title}</span>
          <span className="truncate text-caption text-fg-muted">{data.student.name} · {data.student.studentCode}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-mono text-h3 tabular-nums ${low ? 'text-error' : 'text-fg'}`}>
            {remaining !== null ? formatClock(remaining) : '—'}
          </span>
          <Button onClick={() => setConfirmSubmit(true)}>Submit</Button>
        </div>
      </div>

      <Progress value={answeredCount} max={data.questions.length} aria-label="Questions answered" />

      <div className="grid gap-3.5 lg:grid-cols-[1fr_260px]">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-caption text-fg-muted">
                Question {current + 1} of {data.questions.length} · {question.subject.name}
              </span>
              <span className="font-mono text-caption text-fg-muted">
                +{question.marks}
                {question.negativeMarks > 0 && <span className="text-error"> / −{question.negativeMarks}</span>}
              </span>
            </div>

            <p className="text-body text-fg">{question.body}</p>

            {question.type === 'NUMERIC' ? (
              <Input
                label="Your answer"
                type="number"
                step="any"
                value={answer.numericAnswer ?? ''}
                onChange={(e) =>
                  setAnswer(question.id, {
                    selectedOptionIds: [],
                    numericAnswer: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            ) : question.type === 'MULTIPLE_CHOICE' ? (
              <div className="flex flex-col gap-2">
                {question.options.map((o) => (
                  <Checkbox
                    key={o.id}
                    checked={answer.selectedOptionIds.includes(o.id)}
                    onChange={() => {
                      const has = answer.selectedOptionIds.includes(o.id);
                      setAnswer(question.id, {
                        numericAnswer: null,
                        selectedOptionIds: has
                          ? answer.selectedOptionIds.filter((id) => id !== o.id)
                          : [...answer.selectedOptionIds, o.id],
                      });
                    }}
                    label={<span><span className="font-semibold">{o.label}.</span> {o.body}</span>}
                  />
                ))}
              </div>
            ) : (
              <RadioGroup
                name={`q-${question.id}`}
                value={answer.selectedOptionIds[0] ?? null}
                onChange={(v) => setAnswer(question.id, { selectedOptionIds: [v], numericAnswer: null })}
                options={question.options.map((o) => ({ value: o.id, label: `${o.label}. ${o.body}` }))}
              />
            )}

            <div className="flex items-center justify-between border-t border-border pt-3.5">
              <Button variant="outline" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>Previous</Button>
              <Button variant="ghost" onClick={() => setAnswer(question.id, empty())}>Clear response</Button>
              <Button
                variant="outline"
                disabled={current === data.questions.length - 1}
                onClick={() => setCurrent((c) => c + 1)}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <span className="text-caption text-fg-muted">Questions</span>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {data.questions.map((q, i) => {
                const a = answers[q.id];
                const isAnswered = a && (a.selectedOptionIds.length > 0 || a.numericAnswer !== null);
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrent(i)}
                    className={`h-9 rounded-md border font-mono text-caption tabular-nums transition-colors ${
                      i === current
                        ? 'border-primary bg-primary text-primary-fg'
                        : isAnswered
                          ? 'border-success bg-success-soft text-success'
                          : 'border-border-strong bg-surface text-fg-secondary hover:border-primary'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        loading={submitting}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={() => submit(false)}
        title="Submit this attempt?"
        description={`${answeredCount} of ${data.questions.length} questions answered. Once submitted, answers cannot be changed.`}
        confirmLabel="Submit"
      />
    </div>
  );
}
