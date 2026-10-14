'use client';

import * as React from 'react';
import { Alert, Button, FormModal, Input, RadioGroup, Textarea, useToast } from '@acadia/ui';
import { ENQUIRY_STAGE_LABEL, type EnquiryStage } from '@acadia/types';
import { ApiError, api } from '@/lib/api';

/** ADMITTED is deliberately absent — conversion is the only route to it (spec §38). */
const MOVABLE: EnquiryStage[] = ['NEW', 'CONTACTED', 'COUNSELLING', 'TRIAL', 'FOLLOW_UP', 'LOST'];

const DESCRIPTION: Record<string, string> = {
  NEW: 'Back to the top of the pipeline.',
  CONTACTED: 'First contact has been made.',
  COUNSELLING: 'In active counselling with the family.',
  TRIAL: 'Attending trial classes.',
  FOLLOW_UP: 'Waiting on the family to decide.',
  LOST: 'Closed without an admission.',
};

export function MoveStageDrawer({
  open, enquiry, onClose, onDone,
}: {
  open: boolean;
  enquiry: { id: string; studentName: string; stage: EnquiryStage } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [stage, setStage] = React.useState<EnquiryStage | null>(null);
  const [note, setNote] = React.useState('');
  const [lostReason, setLostReason] = React.useState('');
  const [followUp, setFollowUp] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setStage(null); setNote(''); setLostReason(''); setFollowUp('');
    setErrors({}); setFormError(null);
  }, [open]);

  const isLost = stage === 'LOST';
  const valid = Boolean(stage) && (!isLost || lostReason.trim().length >= 4);

  async function submit() {
    if (!enquiry || !stage) return;
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api(`/admissions/enquiries/${enquiry.id}/stage`, {
        method: 'POST',
        body: {
          stage,
          note: note.trim() || undefined,
          lostReason: isLost ? lostReason.trim() : undefined,
          nextFollowUpAt: followUp || undefined,
        },
      });
      toast({
        kind: 'success',
        title: 'Stage updated',
        description: `${enquiry.studentName} moved to ${ENQUIRY_STAGE_LABEL[stage]}.`,
      });
      onDone();
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
      size="md"
      title="Move stage"
      description={enquiry ? `${enquiry.studentName} is at ${ENQUIRY_STAGE_LABEL[enquiry.stage]}.` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!valid}>Move</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <Alert tone="info">
        To admit this student, use <strong>Convert to student</strong> — that is what marks the
        enquiry admitted and creates the student record.
      </Alert>

      <RadioGroup
        name="stage"
        label="Move to"
        required
        variant="card"
        value={stage}
        onChange={(v) => setStage(v as EnquiryStage)}
        options={MOVABLE.filter((s) => s !== enquiry?.stage).map((s) => ({
          value: s,
          label: ENQUIRY_STAGE_LABEL[s],
          description: DESCRIPTION[s],
        }))}
      />

      {isLost ? (
        <Textarea
          label="Why was it lost?"
          required
          rows={3}
          value={lostReason}
          onChange={(e) => setLostReason(e.target.value)}
          error={errors.lostReason}
          helperText="Recorded on the enquiry timeline."
          placeholder="Joined a competitor closer to home."
        />
      ) : (
        <>
          <Textarea
            label="Note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            error={errors.note}
            placeholder="Spoke to the father; wants to see the Physics faculty first."
          />
          <Input
            label="Next follow-up"
            type="date"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            error={errors.nextFollowUpAt}
            helperText="Leave blank to keep the current date."
          />
        </>
      )}
    </FormModal>
  );
}
