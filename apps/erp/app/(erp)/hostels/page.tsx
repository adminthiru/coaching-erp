'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState,
  MetricCard, PageHeader, Progress, Skeleton, useToast,
} from '@acadia/ui';
import { HOSTEL_OCCUPANCY_LABEL, type HostelOccupancy } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { CreateHostelDrawer } from '@/components/create-hostel-drawer';
import { AllocateFacilityDrawer } from '@/components/allocate-facility-drawer';

interface HostelRow {
  id: string; name: string; code: string; occupancy: HostelOccupancy; scope: 'branch' | 'organization';
  wardenName: string | null; wardenPhone: string | null;
  capacity: number; occupied: number; available: number; roomCount: number;
  branch: { id: string; name: string; code: string } | null;
}

interface HostelDetail extends HostelRow {
  rooms: {
    id: string; roomNumber: string; floor: string | null; capacity: number; occupied: number;
    allocations: { id: string; student: { id: string; name: string; studentCode: string } }[];
  }[];
}

/** Spec §66 — hostels, rooms and who sleeps in them. */
export default function HostelsPage() {
  const { user } = useSession();
  const { toast } = useToast();
  const [creating, setCreating] = React.useState(false);
  const [allocating, setAllocating] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN'].includes(user?.role ?? '');

  const hostels = useQuery<HostelRow[]>('/hostels');
  const detail = useQuery<HostelDetail>(openId ? `/hostels/${openId}` : null, {}, [openId]);

  const totals = (hostels.data ?? []).reduce(
    (acc, h) => ({ capacity: acc.capacity + h.capacity, occupied: acc.occupied + h.occupied }),
    { capacity: 0, occupied: 0 },
  );

  // Every free bed across every hostel, for the allocation picker.
  const freeRooms = (detail.data?.rooms ?? []).map((r) => ({
    id: r.id, roomNumber: r.roomNumber, capacity: r.capacity, occupied: r.occupied,
    hostelName: detail.data?.name ?? '',
  }));

  async function endStay(allocationId: string, name: string) {
    try {
      await api(`/hostels/allocations/${allocationId}/end`, { method: 'POST', body: { reason: 'Ended from hostel page' } });
      toast({ kind: 'success', title: 'Stay ended', description: `${name} has left the room.` });
      detail.reload();
      hostels.reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not end the stay', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Facilities' }, { label: 'Hostel' }]}
        title="Hostel"
        description="Buildings, rooms and bed allocation."
        actions={
          canManage ? (
            <>
              <Button variant="outline" onClick={() => setAllocating(true)} disabled={!openId}>Allocate a bed</Button>
              <Button onClick={() => setCreating(true)}>New hostel</Button>
            </>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {hostels.error ? (
          <ErrorState title="Couldn't load hostels" description={hostels.error.message} onRetry={hostels.reload} />
        ) : hostels.loading ? (
          <Skeleton className="h-48 rounded-lg" />
        ) : !hostels.data?.length ? (
          <Card><CardContent>
            <EmptyState
              title="No hostels yet"
              description="Add a hostel and its rooms before allocating beds."
              action={canManage ? <Button onClick={() => setCreating(true)}>New hostel</Button> : undefined}
            />
          </CardContent></Card>
        ) : (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Hostels" value={String(hostels.data.length)} description="in your scope" />
              <MetricCard title="Beds" value={String(totals.capacity)} description="across every room" />
              <MetricCard title="Occupied" value={String(totals.occupied)} description="students resident" />
              <MetricCard title="Free" value={String(totals.capacity - totals.occupied)} description="beds available" />
            </div>

            <div className="grid gap-3.5 lg:grid-cols-2">
              {hostels.data.map((h) => (
                <Card key={h.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        <CardTitle>{h.name}</CardTitle>
                        <span className="truncate text-caption text-fg-muted">
                          <span className="font-mono">{h.code}</span> · {h.roomCount} rooms
                          {h.wardenName && ` · warden ${h.wardenName}`}
                        </span>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <Badge variant="neutral">{HOSTEL_OCCUPANCY_LABEL[h.occupancy]}</Badge>
                        {h.scope === 'organization'
                          ? <Badge variant="primary">Central</Badge>
                          : <Badge variant="neutral">{h.branch?.code}</Badge>}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-h2 tabular-nums text-fg">{h.occupied}<span className="text-h3 text-fg-muted"> / {h.capacity}</span></span>
                      <span className="text-body-sm text-fg-secondary">{h.available} free</span>
                    </div>
                    <Progress
                      value={h.occupied}
                      max={Math.max(h.capacity, 1)}
                      tone={h.available === 0 ? 'error' : h.occupied / Math.max(h.capacity, 1) >= 0.9 ? 'warning' : 'primary'}
                      aria-label={`${h.name} occupancy`}
                    />
                    <Button
                      size="sm"
                      variant={openId === h.id ? 'primary' : 'outline'}
                      onClick={() => setOpenId(openId === h.id ? null : h.id)}
                    >
                      {openId === h.id ? 'Hide rooms' : 'View rooms'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {openId && (
              <Card>
                <CardHeader>
                  <CardTitle>{detail.data?.name ?? 'Rooms'}</CardTitle>
                  <span className="text-caption text-fg-muted">Who is in each room right now.</span>
                </CardHeader>
                <CardContent>
                  {detail.loading || !detail.data ? (
                    <Skeleton className="h-40 rounded-lg" />
                  ) : detail.data.rooms.length === 0 ? (
                    <Alert tone="info" title="No rooms yet">This hostel has no rooms, so there are no beds to allocate.</Alert>
                  ) : (
                    <ul className="flex flex-col gap-2.5">
                      {detail.data.rooms.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0">
                          <span className="flex min-w-0 flex-col">
                            <span className="text-body-sm text-fg">
                              Room {r.roomNumber}
                              {r.floor && <span className="text-fg-muted"> · {r.floor}</span>}
                            </span>
                            <span className="text-caption text-fg-muted">
                              {r.allocations.length === 0
                                ? 'Empty'
                                : r.allocations.map((a) => a.student.name).join(', ')}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <Badge variant={r.occupied >= r.capacity ? 'error' : r.occupied > 0 ? 'warning' : 'success'}>
                              {r.occupied} / {r.capacity}
                            </Badge>
                            {canManage && r.allocations.map((a) => (
                              <Button key={a.id} size="xs" variant="ghost" onClick={() => endStay(a.id, a.student.name)}>
                                End {a.student.name.split(' ')[0]}
                              </Button>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <CreateHostelDrawer open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); hostels.reload(); }} />
      <AllocateFacilityDrawer
        open={allocating}
        kind="hostel"
        rooms={freeRooms}
        onClose={() => setAllocating(false)}
        onAllocated={() => { setAllocating(false); detail.reload(); hostels.reload(); }}
      />
    </>
  );
}
