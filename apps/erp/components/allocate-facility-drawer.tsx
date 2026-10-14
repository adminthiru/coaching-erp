'use client';

import * as React from 'react';
import { Alert, Button, Combobox, FormModal, FormSection, Select, useToast } from '@acadia/ui';
import { formatMinor } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface StudentOption { id: string; name: string; studentCode: string }

interface RoomOption { id: string; roomNumber: string; capacity: number; occupied: number; hostelName: string }
interface RouteOption { id: string; name: string; code: string; fareMinor: number; seatsLeft: number | null; stops: { id: string; name: string }[] }
interface PlanOption { id: string; name: string; monthlyFareMinor: number }

type Kind = 'hostel' | 'transport' | 'mess';

const COPY: Record<Kind, { title: string; description: string; cta: string; endpoint: string }> = {
  hostel: {
    title: 'Allocate a bed',
    description: 'A student holds one bed at a time — end their current stay before moving them.',
    cta: 'Allocate bed',
    endpoint: '/hostels/allocations',
  },
  transport: {
    title: 'Add a rider',
    description: 'Pick the route and the stop they board at.',
    cta: 'Add rider',
    endpoint: '/transport/allocations',
  },
  mess: {
    title: 'Subscribe to a mess plan',
    description: 'A student is on one plan at a time.',
    cta: 'Subscribe',
    endpoint: '/mess/subscriptions',
  },
};

/**
 * Hostel, transport and mess allocation share one drawer: the flow is identical
 * — pick a student, pick a thing, confirm — and three near-copies would drift.
 */
export function AllocateFacilityDrawer({
  open, kind, rooms, routes, plans, onClose, onAllocated,
}: {
  open: boolean;
  kind: Kind;
  rooms?: RoomOption[];
  routes?: RouteOption[];
  plans?: PlanOption[];
  onClose: () => void;
  onAllocated: () => void;
}) {
  const { toast } = useToast();
  const copy = COPY[kind];

  const { data: studentPage } = useQuery<{ data: StudentOption[] }>(open ? '/students' : null, { query: { pageSize: 200, status: 'ACTIVE' } });

  const [studentId, setStudentId] = React.useState<string | null>(null);
  const [targetId, setTargetId] = React.useState<string | null>(null);
  const [stopId, setStopId] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setStudentId(null); setTargetId(null); setStopId(null); setFormError(null);
  }, [open]);

  React.useEffect(() => { setStopId(null); }, [targetId]);

  const route = (routes ?? []).find((r) => r.id === targetId) ?? null;
  const complete = Boolean(studentId) && Boolean(targetId) && (kind !== 'transport' || Boolean(stopId));

  async function submit() {
    setBusy(true); setFormError(null);
    try {
      const body =
        kind === 'hostel' ? { studentId, roomId: targetId }
          : kind === 'transport' ? { studentId, routeId: targetId, stopId }
            : { studentId, messPlanId: targetId };

      await api(copy.endpoint, { method: 'POST', body });
      toast({ kind: 'success', title: copy.cta.replace(/^Add /, 'Added ').replace(/^Allocate /, 'Allocated ') + (kind === 'mess' ? 'd' : '') });
      onAllocated();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  const targetOptions =
    kind === 'hostel'
      ? (rooms ?? []).map((r) => ({
          value: r.id,
          label: `${r.hostelName} · Room ${r.roomNumber}`,
          meta: `${r.capacity - r.occupied} free`,
          disabled: r.occupied >= r.capacity,
        }))
      : kind === 'transport'
        ? (routes ?? []).map((r) => ({
            value: r.id,
            label: r.name,
            meta: r.seatsLeft === null ? 'no vehicle' : `${r.seatsLeft} seats`,
            disabled: r.seatsLeft !== null && r.seatsLeft <= 0,
          }))
        : (plans ?? []).map((p) => ({ value: p.id, label: p.name, meta: formatMinor(p.monthlyFareMinor) + '/mo' }));

  return (
    <FormModal
      open={open}
      onClose={onClose}
      size="md"
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!complete}>{copy.cta}</Button>
        </>
      }
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <FormSection title="Allocation">
        <Combobox
          label="Student"
          required
          placeholder="Search by name or code"
          options={(studentPage?.data ?? []).map((s) => ({ value: s.id, label: s.name, meta: s.studentCode }))}
          value={studentId}
          onChange={setStudentId}
        />

        <Combobox
          label={kind === 'hostel' ? 'Room' : kind === 'transport' ? 'Route' : 'Plan'}
          required
          placeholder={targetOptions.length ? 'Pick one' : 'Nothing available yet'}
          options={targetOptions}
          value={targetId}
          onChange={setTargetId}
        />

        {kind === 'transport' && route && (
          <Select
            label="Boarding stop"
            required
            options={route.stops.map((s) => ({ value: s.id, label: s.name }))}
            value={stopId}
            onChange={setStopId}
          />
        )}

        {kind === 'transport' && route && route.fareMinor > 0 && (
          <Alert tone="info">
            This route is charged at {formatMinor(route.fareMinor)} per term. Bill it through the student&rsquo;s fee account.
          </Alert>
        )}
      </FormSection>
    </FormModal>
  );
}
