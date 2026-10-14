'use client';

import * as React from 'react';
import { Alert, Button, FormModal, FormRow, Input, Switch, useToast } from '@acadia/ui';
import { ApiError, api } from '@/lib/api';

/**
 * Turns the weekly grid into dated classes. Idempotent — running it again over an
 * overlapping window tops up rather than duplicating, so it is safe to repeat.
 */
export function GenerateSessionsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [replace, setReplace] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const today = new Date();
    const month = new Date(today.getTime() + 29 * 864e5);
    setFrom(today.toISOString().slice(0, 10));
    setTo(month.toISOString().slice(0, 10));
    setReplace(false); setResult(null); setFormError(null);
  }, [open]);

  async function submit() {
    setBusy(true); setFormError(null); setResult(null);
    try {
      const r = await api<{ created: number; skipped: number; message: string }>(
        '/timetable/sessions/generate',
        { method: 'POST', body: { from, to, replace } },
      );
      setResult(r.message + (r.skipped ? ` ${r.skipped} already existed.` : ''));
      toast({ kind: 'success', title: 'Classes generated', description: r.message });
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
      size="md"
      title="Generate classes"
      description="Creates dated classes from the weekly timetable."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
          <Button onClick={submit} loading={busy} disabled={!from || !to}>Generate</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}
      {result && <Alert tone="success">{result}</Alert>}

      <Alert tone="info">
        Only the branch’s working days are generated. Running this again over the same
        dates adds what is missing rather than duplicating.
      </Alert>

      <FormRow>
        <Input label="From" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" required value={to} onChange={(e) => setTo(e.target.value)} />
      </FormRow>

      <Switch
        label="Replace existing scheduled classes"
        description="Discards classes still marked scheduled in this window before regenerating. Completed and cancelled classes are always kept."
        checked={replace}
        onChange={setReplace}
      />
    </FormModal>
  );
}
