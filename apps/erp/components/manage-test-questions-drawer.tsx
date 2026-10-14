'use client';

import * as React from 'react';
import { Alert, Button, FormModal, Input, MultiCombobox, Skeleton, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface BankQuestion {
  id: string; body: string; marks: number; negativeMarks: number;
  subject: { id: string; name: string; code: string };
}

interface PaperQuestion {
  id: string; marks: number; negativeMarks: number;
  question: { id: string; body: string; subject: { code: string } };
}

/** Spec §52 — builds the paper by picking from the bank and setting marks per test. */
export function ManageTestQuestionsDrawer({
  open, testId, onClose, onSaved,
}: {
  open: boolean;
  testId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [marksById, setMarksById] = React.useState<Record<string, { marks: string; negativeMarks: string }>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const bank = useQuery<{ data: BankQuestion[] }>(open ? '/questions' : null, { query: { pageSize: 200 } });
  const current = useQuery<PaperQuestion[]>(open ? `/tests/${testId}/questions` : null);
  const loading = bank.loading || current.loading;

  React.useEffect(() => {
    if (!open || !current.data) return;
    setSelected(current.data.map((q) => q.question.id));
    setMarksById(
      Object.fromEntries(
        current.data.map((q) => [q.question.id, { marks: String(q.marks), negativeMarks: String(q.negativeMarks) }]),
      ),
    );
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current.data]);

  const byId = new Map((bank.data?.data ?? []).map((q) => [q.id, q]));

  function changeSelection(ids: string[]) {
    setSelected(ids);
    setMarksById((prev) => {
      const next: typeof prev = {};
      for (const id of ids) {
        const q = byId.get(id);
        next[id] = prev[id] ?? { marks: String(q?.marks ?? 4), negativeMarks: String(q?.negativeMarks ?? 0) };
      }
      return next;
    });
  }

  const totalMarks = selected.reduce((sum, id) => sum + (Number(marksById[id]?.marks) || 0), 0);

  async function submit() {
    setBusy(true); setFormError(null);
    try {
      await api(`/tests/${testId}/questions`, {
        method: 'POST',
        body: {
          questions: selected.map((id) => ({
            questionId: id,
            marks: Number(marksById[id]?.marks) || 0.25,
            negativeMarks: Number(marksById[id]?.negativeMarks) || 0,
          })),
        },
      });
      toast({
        kind: 'success',
        title: 'Paper updated',
        description: `${selected.length} question${selected.length === 1 ? '' : 's'} · ${totalMarks} marks.`,
      });
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
      title="Build the paper"
      description="Pick questions from the bank and set the marks this test awards for each."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!selected.length}>Save paper</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      {loading ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : (
        <>
          <MultiCombobox
            label="Questions"
            placeholder="Search the question bank"
            options={(bank.data?.data ?? []).map((q) => ({
              value: q.id,
              label: q.body.length > 70 ? `${q.body.slice(0, 70)}…` : q.body,
              meta: q.subject.code,
            }))}
            value={selected}
            onChange={changeSelection}
            helperText="Marks live on the paper, not the bank — re-weighting the bank later never changes a paper already sat."
          />

          {selected.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-caption text-fg-muted">
                <span>{selected.length} question{selected.length === 1 ? '' : 's'} selected</span>
                <span className="font-mono">{totalMarks} marks</span>
              </div>
              <ul className="flex flex-col gap-2">
                {selected.map((id) => {
                  const q = byId.get(id);
                  return (
                    <li key={id} className="flex items-center gap-2 border-b border-border pb-2 last:border-0">
                      <span className="min-w-0 flex-1 truncate text-body-sm text-fg">{q?.body ?? 'Question'}</span>
                      <Input
                        aria-label="Marks"
                        type="number"
                        step="0.25"
                        min="0.25"
                        className="w-20"
                        value={marksById[id]?.marks ?? ''}
                        onChange={(e) => setMarksById((prev) => ({ ...prev, [id]: { ...prev[id], marks: e.target.value } }))}
                      />
                      <Input
                        aria-label="Negative marks"
                        type="number"
                        step="0.25"
                        min="0"
                        className="w-20"
                        value={marksById[id]?.negativeMarks ?? ''}
                        onChange={(e) => setMarksById((prev) => ({ ...prev, [id]: { ...prev[id], negativeMarks: e.target.value } }))}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </FormModal>
  );
}
