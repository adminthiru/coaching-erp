'use client';

import * as React from 'react';
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState, MetricCard,
  PageHeader, Skeleton, useToast,
} from '@acadia/ui';
import { formatMinor } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { CreateMessPlanDrawer } from '@/components/create-transport-drawers';
import { AllocateFacilityDrawer } from '@/components/allocate-facility-drawer';

interface PlanRow {
  id: string; name: string; description: string | null; monthlyFareMinor: number;
  scope: 'branch' | 'organization'; subscribers: number;
  branch: { id: string; name: string; code: string } | null;
}

interface SubscriberRow {
  id: string; startedAt: string;
  student: { id: string; name: string; studentCode: string; branch: { id: string; code: string } };
}

/** Spec §68 — mess plans and who is on them. */
export default function MessPage() {
  const { user } = useSession();
  const { toast } = useToast();
  const [creating, setCreating] = React.useState(false);
  const [subscribing, setSubscribing] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN'].includes(user?.role ?? '');

  const plans = useQuery<PlanRow[]>('/mess/plans');
  const subscribers = useQuery<SubscriberRow[]>(openId ? `/mess/plans/${openId}/subscribers` : null, {}, [openId]);

  const total = (plans.data ?? []).reduce((sum, p) => sum + p.subscribers, 0);
  const monthly = (plans.data ?? []).reduce((sum, p) => sum + p.subscribers * p.monthlyFareMinor, 0);

  async function endSubscription(id: string, name: string) {
    try {
      await api(`/mess/subscriptions/${id}/end`, { method: 'POST', body: { reason: 'Ended from mess page' } });
      toast({ kind: 'success', title: 'Subscription ended', description: `${name} is off the plan.` });
      subscribers.reload();
      plans.reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not end it', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Facilities' }, { label: 'Mess' }]}
        title="Mess"
        description="Meal plans and who is subscribed to them."
        actions={
          canManage ? (
            <>
              <Button variant="outline" onClick={() => setSubscribing(true)} disabled={!plans.data?.length}>Subscribe a student</Button>
              <Button onClick={() => setCreating(true)}>New plan</Button>
            </>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {plans.error ? (
          <ErrorState title="Couldn't load mess plans" description={plans.error.message} onRetry={plans.reload} />
        ) : plans.loading ? (
          <Skeleton className="h-48 rounded-lg" />
        ) : !plans.data?.length ? (
          <Card><CardContent>
            <EmptyState
              title="No mess plans yet"
              description="Create a plan before subscribing students to it."
              action={canManage ? <Button onClick={() => setCreating(true)}>New plan</Button> : undefined}
            />
          </CardContent></Card>
        ) : (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard title="Plans" value={String(plans.data.length)} description="in your scope" />
              <MetricCard title="Subscribers" value={String(total)} description="students on a plan" />
              <MetricCard title="Monthly value" value={formatMinor(monthly)} description="if every plan is billed" />
            </div>

            <div className="grid gap-3.5 lg:grid-cols-2">
              {plans.data.map((p) => (
                <Card key={p.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        <CardTitle>{p.name}</CardTitle>
                        {p.description && <span className="truncate text-caption text-fg-muted">{p.description}</span>}
                      </div>
                      {p.scope === 'organization'
                        ? <Badge variant="primary">Central</Badge>
                        : <Badge variant="neutral">{p.branch?.code}</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-h2 tabular-nums text-fg">{formatMinor(p.monthlyFareMinor)}</span>
                      <span className="text-body-sm text-fg-secondary">per month</span>
                    </div>
                    <span className="text-caption text-fg-muted">
                      {p.subscribers} subscriber{p.subscribers === 1 ? '' : 's'}
                    </span>
                    <Button
                      size="sm"
                      variant={openId === p.id ? 'primary' : 'outline'}
                      onClick={() => setOpenId(openId === p.id ? null : p.id)}
                    >
                      {openId === p.id ? 'Hide subscribers' : 'View subscribers'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {openId && (
              <Card>
                <CardHeader><CardTitle>Subscribers</CardTitle></CardHeader>
                <CardContent>
                  {subscribers.loading ? (
                    <Skeleton className="h-32 rounded-lg" />
                  ) : !subscribers.data?.length ? (
                    <p className="text-body-sm text-fg-muted">Nobody is on this plan yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {subscribers.data.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-body-sm text-fg">{s.student.name}</span>
                            <span className="truncate text-caption text-fg-muted">
                              <span className="font-mono">{s.student.studentCode}</span> · {s.student.branch.code} · since {s.startedAt.slice(0, 10)}
                            </span>
                          </span>
                          {canManage && (
                            <Button size="xs" variant="ghost" onClick={() => endSubscription(s.id, s.student.name)}>End</Button>
                          )}
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

      <CreateMessPlanDrawer open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); plans.reload(); }} />
      <AllocateFacilityDrawer
        open={subscribing}
        kind="mess"
        plans={plans.data ?? []}
        onClose={() => setSubscribing(false)}
        onAllocated={() => { setSubscribing(false); plans.reload(); subscribers.reload(); }}
      />
    </>
  );
}
