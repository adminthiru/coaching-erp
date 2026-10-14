'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Dropdown,
  ErrorState, PageHeader, Skeleton, StatusBadge, Tabs, UsageMeter, useToast,
} from '@acadia/ui';
import { FEATURE_LABEL, LIMIT_LABEL, type Feature, type LimitKey } from '@acadia/types';
import { formatMinor } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { ExtendTrialDrawer } from '@/components/extend-trial-drawer';
import { ChangePlanDrawer } from '@/components/change-plan-drawer';

interface UsageRow {
  key: LimitKey;
  used: number;
  limit: number | null;
  unlimited: boolean;
  pct: number;
  exceeded: boolean;
  nearLimit: boolean;
  overridden: boolean;
}

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  city: string | null;
  state: string | null;
  country: string;
  timezone: string;
  trialEndsAt: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  counts: { branches: number; users: number; tickets: number };
  entitlements: { planId: string | null; planName: string | null; features: Feature[]; overriddenFeatures: Feature[] };
  usage: UsageRow[];
  currentSubscription: {
    id: string; status: string; billingCycle: string; currentPeriodEnd: string;
    plan: { id: string; name: string }; coupon: { code: string } | null;
  } | null;
  subscriptionHistory: { id: string; status: string; createdAt: string; plan: { name: string } }[];
}

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'branches', label: 'Branches' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'usage', label: 'Usage' },
  { value: 'features', label: 'Feature access' },
  { value: 'activity', label: 'Activity' },
];

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [tab, setTab] = React.useState(searchParams.get('tab') ?? 'overview');
  const [extending, setExtending] = React.useState(false);
  const [changingPlan, setChangingPlan] = React.useState(false);
  const [confirm, setConfirm] = React.useState<{ status: string; label: string; destructive: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const { data: org, error, loading, reload } = useQuery<OrgDetail>(`/platform/organizations/${id}`);

  async function changeStatus(status: string, reason: string) {
    setBusy(true);
    try {
      await api(`/platform/organizations/${id}/status`, { method: 'POST', body: { status, reason } });
      toast({ kind: 'success', title: 'Status updated', description: `${org?.name} is now ${status.toLowerCase().replace('_', ' ')}.` });
      setConfirm(null);
      reload();
    } catch (err) {
      toast({
        kind: 'error',
        title: 'Could not update status',
        description: err instanceof ApiError ? err.message : 'Something went wrong.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="px-5 py-5 lg:px-6">
        <ErrorState
          kind={error instanceof ApiError && error.status === 404 ? 'not-found' : 'error'}
          title={error instanceof ApiError && error.status === 404 ? 'Organization not found' : undefined}
          description={error.message}
          onRetry={reload}
          action={<Button variant="outline" onClick={() => router.push('/organizations')}>Back to organizations</Button>}
        />
      </div>
    );
  }

  if (loading || !org) {
    return (
      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const trialDaysLeft = org.trialEndsAt
    ? Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 864e5)
    : null;

  const exceeded = org.usage.filter((u) => u.exceeded);
  const near = org.usage.filter((u) => u.nearLimit && !u.exceeded);

  return (
    <>
      <PageHeader
        onBack={() => router.push('/organizations')}
        breadcrumbs={[
          { label: 'Customers' },
          { label: 'Organizations', href: '/organizations' },
          { label: org.name },
        ]}
        title={org.name}
        description={`${org.ownerName} · ${org.ownerEmail}`}
        actions={
          <>
            <StatusBadge status={org.status} />
            <Button variant="outline" onClick={() => setChangingPlan(true)}>Change plan</Button>
            <Dropdown
              heading={org.name}
              trigger={<Button variant="outline">Actions</Button>}
              items={[
                { label: 'Extend trial', onSelect: () => setExtending(true) },
                ...(org.status === 'SUSPENDED'
                  ? [{ label: 'Reactivate', onSelect: () => setConfirm({ status: 'ACTIVE', label: 'Reactivate', destructive: false }) }]
                  : [{ label: 'Suspend', destructive: true, onSelect: () => setConfirm({ status: 'SUSPENDED', label: 'Suspend', destructive: true }) }]),
                'separator',
                { label: 'Archive organization', destructive: true, onSelect: () => setConfirm({ status: 'ARCHIVED', label: 'Archive', destructive: true }) },
              ]}
            />
          </>
        }
        tabs={<Tabs value={tab} onChange={setTab} tabs={TABS} />}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {org.status === 'ARCHIVED' && (
          <Alert tone="neutral" title="This organization is archived">
            Archived organizations are read-only. Historical records remain available.
          </Alert>
        )}

        {exceeded.length > 0 && (
          <Alert
            tone="error"
            title={`Over plan limit on ${exceeded.map((u) => LIMIT_LABEL[u.key].toLowerCase()).join(', ')}`}
            action={<Button size="sm" onClick={() => setChangingPlan(true)}>Upgrade plan</Button>}
          >
            {org.entitlements.planName
              ? `The ${org.entitlements.planName} plan does not cover current usage.`
              : 'Current usage exceeds the configured limits.'}
          </Alert>
        )}

        {exceeded.length === 0 && near.length > 0 && (
          <Alert tone="warning" title="Approaching plan limits" action={<Button size="sm" variant="outline" onClick={() => setTab('usage')}>View usage</Button>}>
            {near.map((u) => `${LIMIT_LABEL[u.key]} at ${u.pct.toFixed(0)}%`).join(' · ')}
          </Alert>
        )}

        {trialDaysLeft !== null && org.status === 'TRIAL' && (
          <Alert
            tone={trialDaysLeft <= 3 ? 'warning' : 'info'}
            title={trialDaysLeft <= 0 ? 'Trial has expired' : `Trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'}`}
            action={<Button size="sm" variant="outline" onClick={() => setExtending(true)}>Extend trial</Button>}
          >
            Ends {org.trialEndsAt?.slice(0, 10)}.
          </Alert>
        )}

        {tab === 'overview' && <OverviewTab org={org} />}
        {tab === 'usage' && <UsageTab usage={org.usage} planName={org.entitlements.planName} />}
        {tab === 'features' && <FeaturesTab org={org} />}
        {tab === 'subscription' && <SubscriptionTab org={org} />}
        {tab === 'branches' && <BranchesTab organizationId={org.id} />}
        {tab === 'activity' && <ActivityTab organizationId={org.id} />}
      </div>

      <ExtendTrialDrawer
        open={extending}
        organizationId={org.id}
        currentEndsAt={org.trialEndsAt}
        onClose={() => setExtending(false)}
        onDone={() => { setExtending(false); reload(); }}
      />

      <ChangePlanDrawer
        open={changingPlan}
        organizationId={org.id}
        currentPlanId={org.entitlements.planId}
        onClose={() => setChangingPlan(false)}
        onDone={() => { setChangingPlan(false); reload(); }}
      />

      <ConfirmDialog
        open={confirm !== null}
        destructive={confirm?.destructive}
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && changeStatus(confirm.status, `${confirm.label} via platform console`)}
        title={`${confirm?.label} ${org.name}?`}
        description={
          confirm?.status === 'ARCHIVED'
            ? 'The organization becomes read-only. Branches, students and financial history are retained but nobody can sign in.'
            : confirm?.status === 'SUSPENDED'
              ? 'Users lose access immediately and billing is suspended. Data is retained and the organization can be reactivated.'
              : 'Access and billing resume immediately.'
        }
        confirmLabel={confirm?.label ?? 'Confirm'}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption text-fg-muted">{label}</span>
      <span className="text-body-sm text-fg">{children}</span>
    </div>
  );
}

function OverviewTab({ org }: { org: OrgDetail }) {
  return (
    <div className="grid gap-3.5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Organization</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Identifier"><span className="font-mono">{org.slug}</span></Field>
          <Field label="Status"><StatusBadge status={org.status} /></Field>
          <Field label="Owner">{org.ownerName}</Field>
          <Field label="Owner email">{org.ownerEmail}</Field>
          <Field label="Owner phone"><span className="font-mono">{org.ownerPhone}</span></Field>
          <Field label="Location">{[org.city, org.state, org.country].filter(Boolean).join(', ')}</Field>
          <Field label="Timezone">{org.timezone}</Field>
          <Field label="Created">{org.createdAt.slice(0, 10)}</Field>
          <Field label="Last active">{org.lastActiveAt?.slice(0, 10) ?? 'Never'}</Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>At a glance</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Plan">{org.entitlements.planName ?? 'No plan'}</Field>
          <Field label="Branches"><span className="font-mono tabular-nums">{org.counts.branches}</span></Field>
          <Field label="Users"><span className="font-mono tabular-nums">{org.counts.users}</span></Field>
          <Field label="Open tickets"><span className="font-mono tabular-nums">{org.counts.tickets}</span></Field>
        </CardContent>
      </Card>
    </div>
  );
}

function UsageTab({ usage, planName }: { usage: UsageRow[]; planName: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan limits</CardTitle>
        <span className="text-caption text-fg-muted">
          {planName ? `Entitlements from the ${planName} plan.` : 'No plan assigned.'}
        </span>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        {usage.map((u) => (
          <UsageMeter
            key={u.key}
            label={LIMIT_LABEL[u.key]}
            used={u.used}
            limit={u.limit}
            unit={u.key === 'storage_mb' ? 'MB' : undefined}
            hint={u.overridden ? 'Overridden for this organization' : undefined}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function FeaturesTab({ org }: { org: OrgDetail }) {
  const all = Object.keys(FEATURE_LABEL) as Feature[];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature access</CardTitle>
        <span className="text-caption text-fg-muted">
          Granted by the plan, plus any per-organization overrides. Enforced server-side.
        </span>
      </CardHeader>
      <CardContent className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {all.map((f) => {
          const on = org.entitlements.features.includes(f);
          const overridden = org.entitlements.overriddenFeatures.includes(f);
          return (
            <div key={f} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
              <span className={on ? 'text-body-sm text-fg' : 'text-body-sm text-fg-muted'}>{FEATURE_LABEL[f]}</span>
              {on ? (
                <Badge variant={overridden ? 'primary' : 'success'}>{overridden ? 'Override' : 'On'}</Badge>
              ) : (
                <Badge variant="neutral">Off</Badge>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SubscriptionTab({ org }: { org: OrgDetail }) {
  const sub = org.currentSubscription;
  return (
    <div className="flex flex-col gap-3.5">
      <Card>
        <CardHeader><CardTitle>Current subscription</CardTitle></CardHeader>
        <CardContent>
          {sub ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Plan">{sub.plan.name}</Field>
              <Field label="Status"><StatusBadge status={sub.status} /></Field>
              <Field label="Billing cycle">{sub.billingCycle === 'ANNUAL' ? 'Annual' : 'Monthly'}</Field>
              <Field label="Renews">{sub.currentPeriodEnd.slice(0, 10)}</Field>
              {sub.coupon && <Field label="Coupon"><span className="font-mono">{sub.coupon.code}</span></Field>}
            </div>
          ) : (
            <p className="text-body-sm text-fg-muted">This organization has no active subscription.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <span className="text-caption text-fg-muted">Subscription history is never deleted.</span>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {org.subscriptionHistory.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                <span className="text-body-sm text-fg">{s.plan.name}</span>
                <span className="flex items-center gap-3">
                  <StatusBadge status={s.status} />
                  <span className="text-caption text-fg-muted">{s.createdAt.slice(0, 10)}</span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function BranchesTab({ organizationId }: { organizationId: string }) {
  const { data, loading } = useQuery<{ id: string; name: string; code: string; city: string; state: string; status: string }[]>(
    `/platform/organizations/${organizationId}/branches`,
  );

  if (loading) return <Skeleton className="h-40 rounded-lg" />;

  return (
    <Card>
      <CardHeader><CardTitle>Branches</CardTitle></CardHeader>
      <CardContent>
        {(data ?? []).length === 0 ? (
          <p className="text-body-sm text-fg-muted">
            No branches yet. The organization creates its first branch during onboarding.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(data ?? []).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-body-sm text-fg">{b.name}</span>
                  <span className="text-caption text-fg-muted">
                    <span className="font-mono">{b.code}</span> · {b.city}, {b.state}
                  </span>
                </span>
                <StatusBadge status={b.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityTab({ organizationId }: { organizationId: string }) {
  const { data, loading } = useQuery<{ data: { id: string; action: string; actorEmail: string | null; reason: string | null; createdAt: string }[] }>(
    `/platform/organizations/${organizationId}/audit-logs`,
    { query: { pageSize: 50 } },
  );

  if (loading) return <Skeleton className="h-40 rounded-lg" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <span className="text-caption text-fg-muted">Every platform action taken on this organization.</span>
      </CardHeader>
      <CardContent>
        {(data?.data ?? []).length === 0 ? (
          <p className="text-body-sm text-fg-muted">No recorded activity yet.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {(data?.data ?? []).map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-body-sm text-fg">{e.action}</span>
                  <span className="text-caption text-fg-muted">
                    {e.actorEmail ?? 'system'}{e.reason ? ` — ${e.reason}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-caption text-fg-muted">{e.createdAt.slice(0, 16).replace('T', ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
