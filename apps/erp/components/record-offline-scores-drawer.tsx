'use client';

import * as React from 'react';
import { Alert, Button, FormModal, Input, Skeleton, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface TestBatch { id: string; name: string; code: string }
interface BatchStudent { id: string; name: string; studentCode: string; status: string }
interface ExistingAttempt {
  status: string; score: number; correctCount: number; wrongCount: number; unattemptedCount: number;
  student: { id: string };
}

interface Row { score: string; correctCount: string; wrongCount: string; unattemptedCount: string }

/** Spec §52 mode=OFFLINE — there is no attempt engine for a paper/OMR test. */
export function RecordOfflineScoresDrawer({
  open, testId, batches, totalMarks, onClose, onSaved,
}: {
  open: boolean;
  testId: string;
  batches: TestBatch[];
  totalMarks: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<Record<string, Row>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [students, setStudents] = React.useState<BatchStudent[] | null>(null);

  const existing = useQuery<{ attempts: ExistingAttempt[] }>(open ? `/tests/${testId}/results` : null);

  // Batches vary per test, so their student lists can't be fetched with one
  // fixed set of hook calls — plain requests merged by hand instead.
  React.useEffect(() => {
    if (!open) { setStudents(null); return; }
    let live = true;
    Promise.all(batches.map((b) => api<{ data: BatchStudent[] }>(`/batches/${b.id}/students`, { query: { pageSize: 200 } })))
      .then((results) => {
        if (!live) return;
        const merged = results
          .flatMap((r) => r.data)
          .filter((s, i, arr) => s.status === 'ACTIVE' && arr.findIndex((x) => x.id === s.id) === i);
        setStudents(merged);
      })
      .catch(() => { if (live) setStudents([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batches]);

  const loading = students === null || existing.loading;

  React.useEffect(() => {
    if (!open || loading || !students) return;
    const scored = new Map((existing.data?.attempts ?? []).map((a) => [a.student.id, a]));
    setRows(
      Object.fromEntries(
        students.map((s) => {
          const prior = scored.get(s.id);
          return [
            s.id,
            prior
              ? {
                  score: String(prior.score), correctCount: String(prior.correctCount),
                  wrongCount: String(prior.wrongCount), unattemptedCount: String(prior.unattemptedCount),
                }
              : { score: '', correctCount: '', wrongCount: '', unattemptedCount: '' },
          ];
        }),
      ),
    );
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading]);

  function update(studentId: string, field: keyof Row, value: string) {
    setRows((prev) => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }));
  }

  const filled = (students ?? []).filter((s) => rows[s.id]?.score.trim() !== '');

  async function submit() {
    setBusy(true); setFormError(null);
    try {
      await api(`/tests/${testId}/scores`, {
        method: 'POST',
        body: {
          scores: filled.map((s) => ({
            studentId: s.id,
            score: Number(rows[s.id].score) || 0,
            correctCount: Number(rows[s.id].correctCount) || 0,
            wrongCount: Number(rows[s.id].wrongCount) || 0,
            unattemptedCount: Number(rows[s.id].unattemptedCount) || 0,
          })),
        },
      });
      toast({ kind: 'success', title: 'Scores recorded', description: `${filled.length} student${filled.length === 1 ? '' : 's'} scored.` });
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
      size="lg"
      title="Record scores"
      description={`Enter each student's outcome from the paper. Out of ${totalMarks || 'the paper’s'} marks.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!filled.length}>
            Save {filled.length || ''} score{filled.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : !students?.length ? (
        <Alert tone="info" title="No students to score">
          None of this test's batches have active students enrolled.
        </Alert>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-[1fr_72px_64px_64px_72px] gap-2 px-1 text-caption text-fg-muted">
            <span>Student</span>
            <span>Score</span>
            <span>Correct</span>
            <span>Wrong</span>
            <span>Skipped</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {students.map((s) => (
              <li key={s.id} className="grid grid-cols-[1fr_72px_64px_64px_72px] items-center gap-2 border-b border-border py-1.5 last:border-0">
                <span className="min-w-0 truncate text-body-sm text-fg">
                  {s.name} <span className="font-mono text-caption text-fg-muted">{s.studentCode}</span>
                </span>
                <Input aria-label={`${s.name} score`} type="number" step="0.5" min="0" value={rows[s.id]?.score ?? ''} onChange={(e) => update(s.id, 'score', e.target.value)} />
                <Input aria-label={`${s.name} correct`} type="number" min="0" value={rows[s.id]?.correctCount ?? ''} onChange={(e) => update(s.id, 'correctCount', e.target.value)} />
                <Input aria-label={`${s.name} wrong`} type="number" min="0" value={rows[s.id]?.wrongCount ?? ''} onChange={(e) => update(s.id, 'wrongCount', e.target.value)} />
                <Input aria-label={`${s.name} skipped`} type="number" min="0" value={rows[s.id]?.unattemptedCount ?? ''} onChange={(e) => update(s.id, 'unattemptedCount', e.target.value)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </FormModal>
  );
}
