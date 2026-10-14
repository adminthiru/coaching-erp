'use client';

import * as React from 'react';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dropdown, EmptyState, ErrorState,
  MetricCard, PageHeader, Progress, Segmented, Skeleton, useToast,
} from '@acadia/ui';
import { VEHICLE_STATUS_LABEL, VehicleStatus, type VehicleStatus as VStatus } from '@acadia/types';
import { formatMinor } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { CreateVehicleDrawer, CreateRouteDrawer } from '@/components/create-transport-drawers';
import { AllocateFacilityDrawer } from '@/components/allocate-facility-drawer';

interface VehicleRow {
  id: string; registration: string; model: string | null; capacity: number; status: VStatus;
  driverName: string | null; driverPhone: string | null; scope: 'branch' | 'organization';
  branch: { id: string; name: string; code: string } | null;
  routes: { id: string; name: string; code: string }[];
}

interface RouteRow {
  id: string; name: string; code: string; fareMinor: number; scope: 'branch' | 'organization';
  riders: number; seatsLeft: number | null;
  branch: { id: string; name: string; code: string } | null;
  vehicle: { id: string; registration: string; capacity: number; status: string; driverName: string | null } | null;
  stops: { id: string; name: string; pickupMinute: number }[];
}

interface RouteDetail extends RouteRow {
  allocations: {
    id: string;
    student: { id: string; name: string; studentCode: string };
    stop: { id: string; name: string };
  }[];
}

const clock = (minute: number) => {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
};

const VEHICLE_VARIANT: Record<VStatus, 'success' | 'warning' | 'neutral'> = {
  ACTIVE: 'success', MAINTENANCE: 'warning', RETIRED: 'neutral',
};

/** Spec §67 — vehicles, routes, stops and riders. */
export default function TransportPage() {
  const { user } = useSession();
  const { toast } = useToast();
  const [tab, setTab] = React.useState('routes');
  const [creatingVehicle, setCreatingVehicle] = React.useState(false);
  const [creatingRoute, setCreatingRoute] = React.useState(false);
  const [allocating, setAllocating] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN'].includes(user?.role ?? '');

  const vehicles = useQuery<VehicleRow[]>('/transport/vehicles');
  const routes = useQuery<RouteRow[]>('/transport/routes');
  const detail = useQuery<RouteDetail>(openId ? `/transport/routes/${openId}` : null, {}, [openId]);

  const riders = (routes.data ?? []).reduce((sum, r) => sum + r.riders, 0);
  const seats = (routes.data ?? []).reduce((sum, r) => sum + (r.vehicle?.capacity ?? 0), 0);

  async function setVehicleStatus(v: VehicleRow, status: VStatus) {
    try {
      await api(`/transport/vehicles/${v.id}/status`, { method: 'POST', body: { status } });
      toast({ kind: 'success', title: 'Vehicle updated', description: `${v.registration} is now ${VEHICLE_STATUS_LABEL[status].toLowerCase()}.` });
      vehicles.reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not update', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
  }

  async function endRide(allocationId: string, name: string) {
    try {
      await api(`/transport/allocations/${allocationId}/end`, { method: 'POST', body: { reason: 'Ended from transport page' } });
      toast({ kind: 'success', title: 'Rider removed', description: `${name} is off the route.` });
      detail.reload();
      routes.reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not remove', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Facilities' }, { label: 'Transport' }]}
        title="Transport"
        description="Routes, stops, vehicles and who rides them."
        actions={
          canManage ? (
            tab === 'routes' ? (
              <>
                <Button variant="outline" onClick={() => setAllocating(true)} disabled={!routes.data?.length}>Add a rider</Button>
                <Button onClick={() => setCreatingRoute(true)}>New route</Button>
              </>
            ) : (
              <Button onClick={() => setCreatingVehicle(true)}>New vehicle</Button>
            )
          ) : undefined
        }
        tabs={
          <Segmented
            options={[{ value: 'routes', label: 'Routes' }, { value: 'vehicles', label: 'Vehicles' }]}
            value={tab}
            onChange={setTab}
            aria-label="Transport view"
          />
        }
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {tab === 'routes' ? (
          routes.error ? (
            <ErrorState title="Couldn't load routes" description={routes.error.message} onRetry={routes.reload} />
          ) : routes.loading ? (
            <Skeleton className="h-48 rounded-lg" />
          ) : !routes.data?.length ? (
            <Card><CardContent>
              <EmptyState
                title="No routes yet"
                description="Add a vehicle first, then a route with its stops."
                action={canManage ? <Button onClick={() => setCreatingRoute(true)}>New route</Button> : undefined}
              />
            </CardContent></Card>
          ) : (
            <>
              <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="Routes" value={String(routes.data.length)} description="in service" />
                <MetricCard title="Riders" value={String(riders)} description="students allocated" />
                <MetricCard title="Seats" value={String(seats)} description="across assigned vehicles" />
                <MetricCard title="Free seats" value={String(Math.max(0, seats - riders))} description="still available" />
              </div>

              <div className="grid gap-3.5 lg:grid-cols-2">
                {routes.data.map((r) => (
                  <Card key={r.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col">
                          <CardTitle>{r.name}</CardTitle>
                          <span className="truncate text-caption text-fg-muted">
                            <span className="font-mono">{r.code}</span> · {r.stops.length} stops
                            {r.fareMinor > 0 && ` · ${formatMinor(r.fareMinor)}/term`}
                          </span>
                        </div>
                        {r.scope === 'organization'
                          ? <Badge variant="primary">Shared</Badge>
                          : <Badge variant="neutral">{r.branch?.code}</Badge>}
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      {r.vehicle ? (
                        <div className="flex items-baseline justify-between">
                          <span className="font-mono text-body-sm text-fg">{r.vehicle.registration}</span>
                          <span className="text-body-sm text-fg-secondary">{r.riders} / {r.vehicle.capacity} seats</span>
                        </div>
                      ) : (
                        <Alert tone="warning">No vehicle assigned — this route has no seat limit yet.</Alert>
                      )}
                      {r.vehicle && (
                        <Progress
                          value={r.riders}
                          max={Math.max(r.vehicle.capacity, 1)}
                          tone={r.seatsLeft === 0 ? 'error' : 'primary'}
                          aria-label={`${r.name} occupancy`}
                        />
                      )}
                      <span className="text-caption text-fg-muted">
                        {r.stops.slice(0, 4).map((s) => `${s.name} ${clock(s.pickupMinute)}`).join(' → ')}
                        {r.stops.length > 4 && ' → …'}
                      </span>
                      <Button
                        size="sm"
                        variant={openId === r.id ? 'primary' : 'outline'}
                        onClick={() => setOpenId(openId === r.id ? null : r.id)}
                      >
                        {openId === r.id ? 'Hide riders' : 'View riders'}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {openId && (
                <Card>
                  <CardHeader>
                    <CardTitle>{detail.data?.name ?? 'Riders'}</CardTitle>
                    <span className="text-caption text-fg-muted">Who boards where.</span>
                  </CardHeader>
                  <CardContent>
                    {detail.loading || !detail.data ? (
                      <Skeleton className="h-32 rounded-lg" />
                    ) : detail.data.allocations.length === 0 ? (
                      <p className="text-body-sm text-fg-muted">Nobody rides this route yet.</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {detail.data.allocations.map((a) => (
                          <li key={a.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-body-sm text-fg">{a.student.name}</span>
                              <span className="truncate text-caption text-fg-muted">
                                <span className="font-mono">{a.student.studentCode}</span> · boards at {a.stop.name}
                              </span>
                            </span>
                            {canManage && (
                              <Button size="xs" variant="ghost" onClick={() => endRide(a.id, a.student.name)}>Remove</Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )
        ) : vehicles.error ? (
          <ErrorState title="Couldn't load vehicles" description={vehicles.error.message} onRetry={vehicles.reload} />
        ) : vehicles.loading ? (
          <Skeleton className="h-48 rounded-lg" />
        ) : !vehicles.data?.length ? (
          <Card><CardContent>
            <EmptyState
              title="No vehicles yet"
              description="Add the buses and vans that serve your routes."
              action={canManage ? <Button onClick={() => setCreatingVehicle(true)}>New vehicle</Button> : undefined}
            />
          </CardContent></Card>
        ) : (
          <Card>
            <CardHeader><CardTitle>Fleet</CardTitle></CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2.5">
                {vehicles.data.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2.5 last:border-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-mono text-body-sm text-fg">{v.registration}</span>
                      <span className="truncate text-caption text-fg-muted">
                        {v.model ?? 'Vehicle'} · {v.capacity} seats
                        {v.driverName && ` · ${v.driverName}`}
                        {v.driverPhone && ` (${v.driverPhone})`}
                      </span>
                      {v.routes.length > 0 && (
                        <span className="truncate text-caption text-fg-muted">Serves {v.routes.map((r) => r.name).join(', ')}</span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {v.scope === 'organization' && <Badge variant="primary">Shared</Badge>}
                      <Badge variant={VEHICLE_VARIANT[v.status]}>{VEHICLE_STATUS_LABEL[v.status]}</Badge>
                      {canManage && (
                        <Dropdown
                          heading={v.registration}
                          trigger={<Button size="sm" variant="ghost" iconOnly aria-label="Vehicle actions">⋯</Button>}
                          items={(Object.keys(VehicleStatus) as VStatus[])
                            .filter((s) => s !== v.status)
                            .map((s) => ({
                              label: VEHICLE_STATUS_LABEL[s],
                              destructive: s === 'RETIRED',
                              onSelect: () => setVehicleStatus(v, s),
                            }))}
                        />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <CreateVehicleDrawer open={creatingVehicle} onClose={() => setCreatingVehicle(false)} onCreated={() => { setCreatingVehicle(false); vehicles.reload(); }} />
      <CreateRouteDrawer
        open={creatingRoute}
        vehicles={vehicles.data ?? []}
        onClose={() => setCreatingRoute(false)}
        onCreated={() => { setCreatingRoute(false); routes.reload(); vehicles.reload(); }}
      />
      <AllocateFacilityDrawer
        open={allocating}
        kind="transport"
        routes={routes.data ?? []}
        onClose={() => setAllocating(false)}
        onAllocated={() => { setAllocating(false); routes.reload(); detail.reload(); }}
      />
    </>
  );
}
