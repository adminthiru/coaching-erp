'use client';

import * as React from 'react';
import { Alert, Badge, Button, FormModal, Segmented, Skeleton, useToast } from '@acadia/ui';
import { ATTENDANCE_LABEL, type AttendanceStatus } from '@acadia/types';
import { formatClock12 } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface RosterStudent {
  id: string; studentCode: string; name: string;
  status: AttendanceStatus | null;
  marked: boolean;
  onApprovedLeave: boolean;
  note: string | null;
}

interface Roster {
  session: {
    id: string; date: string; startMinute: number; endMinute: number;
    batch: { name: string }; subject: { name: string }; faculty: { name: string };
    room: { name: string } | null;
  };
  students: RosterStudent[];
  markedCount: number;
  total: number;
}

const CYCLE: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'EXCUSED'];

const VARIANT: Record<AttendanceStatus, 'success' | 'error' | 'warning' | 'info' | 'neutral'> = {
  PRESENT: 'success',
  ABSENT: 'error',
  LATE: 'warning',
  HALF_DAY: 'warning',
  EXCUSED: 'info',
};

/**
 * Spec §47. Defaults everyone to Present — the common case — so a teacher only
 * touches the exceptions. Students on approved leave arrive pre-marked Excused.
 */
export function MarkAttendanceDrawer({
  open, session, onClose, onDone,
}: {
  open: boolean;
  session: { id: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [marks, setMarks] = React.useState<Record<string, AttendanceStatus>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const { data, loading } = useQuery<Roster>(
    open && session ? `/attendance/sessions/${session.id}` : null, {}, [session?.id],
  );

  React.useEffect(() => {
    if (!open || !data) return;
    setFormError(null);
    setMarks(
      Object.fromEntries(
        data.students.map((s) => [s.id, s.status ?? (s.onApprovedLeave ? 'EXCUSED' : 'PRESENT')]),
      ) as Record<string, AttendanceStatus>,
    );
  }, [open, data]);

  function cycle(studentId: string) {
    setMarks((m) => {
      const current = m[studentId] ?? 'PRESENT';
      const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
      return { ...m, [studentId]: next };
    });
  }

  function setAll(status: AttendanceStatus) {
    if (!data) return;
    setMarks(Object.fromEntries(data.students.map((s) => [s.id, status])) as Record<string, AttendanceStatus>);
  }

  async function submit() {
    if (!session || !data) return;
    setBusy(true); setFormError(null);
    try {
      await api(`/attendance/sessions/${session.id}`, {
        method: 'POST',
        body: { entries: data.students.map((s) => ({ studentId: s.id, status: marks[s.id] ?? 'PRESENT' })) },
      });
      toast({
        kind: 'success',
        title: 'Attendance saved',
        description: `${data.students.length} students marked for ${data.session.subject.name}.`,
      });
      onDone();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const tally = React.useMemo(() => {
    const t: Record<string, number> = {};
    for (const v of Object.values(marks)) t[v] = (t[v] ?? 0) + 1;
    return t;
  }, [marks]);

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="md"
      title="Take the roll"
      description={
        data
          ? `${data.session.subject.name} · ${data.session.batch.name} · ${data.session.date} ${formatClock12(data.session.startMinute)}`
          : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!data || data.students.length === 0}>
            Save attendance
          </Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : !data || data.students.length === 0 ? (
        <Alert tone="warning" title="No students enrolled">
          This batch has no active students to mark.
        </Alert>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-fg-muted">Mark everyone:</span>
            <Button size="xs" variant="outline" onClick={() => setAll('PRESENT')}>All present</Button>
            <Button size="xs" variant="outline" onClick={() => setAll('ABSENT')}>All absent</Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CYCLE.filter((s) => tally[s]).map((s) => (
              <Badge key={s} variant={VARIANT[s]}>{ATTENDANCE_LABEL[s]} {tally[s]}</Badge>
            ))}
          </div>

          <span className="text-caption text-fg-muted">Tap a student to cycle their status.</span>

          <ul className="flex flex-col gap-1">
            {data.students.map((s) => {
              const status = marks[s.id] ?? 'PRESENT';
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => cycle(s.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left transition-colors hover:border-border-strong"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-body-sm text-fg">{s.name}</span>
                      <span className="truncate text-caption text-fg-muted">
                        <span className="font-mono">{s.studentCode}</span>
                        {s.onApprovedLeave && ' · on approved leave'}
                      </span>
                    </span>
                    <Badge variant={VARIANT[status]}>{ATTENDANCE_LABEL[status]}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </FormModal>
  );
}
