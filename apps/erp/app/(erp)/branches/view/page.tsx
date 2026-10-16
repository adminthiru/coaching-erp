'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Dropdown,
  ErrorState, PageHeader, Skeleton, StatusBadge, Tabs, useToast,
} from '@acadia/ui';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { CreateBranchDrawer } from '@/components/create-branch-drawer';
import { CreateBranchAdminDrawer } from '@/components/create-branch-admin-drawer';

interface BranchDetail {
  id: string; name: string; code: string; status: string;
  addressLine: string | null; city: string; state: string; country: string;
  pincode: string | null; phone: string | null; email: string | null;
  timezone: string; workingDays: number[];
  openedAt: string | null; createdAt: string;
  needsAdmin: boolean; staffCount: number;
  admins: { id: string; name: string; email: string }[];
  members: { isPrimary: boolean; user: { id: string; name: string; email: string; role: string; acceptedAt: string | null } }[];
}

interface ClosureImpact {
  branch: { id: string; name: string; status: string };
  blockers: { key: string; label: string; count: number; resolution: string }[];
  canArchive: boolean;
  otherBranchCount: number;
}

const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'staff', label: 'Staff' },
  { value: 'transfers', label: 'Transfers' },
];

export default function BranchDetailPage() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const { toast } = useToast();
  const { user, reload: reloadSession } = useSession();

  const [tab, setTab] = React.useState('overview');
  const [addingAdmin, setAddingAdmin] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [confirm, setConfirm] = React.useState<{ status: string; label: string; destructive: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const { data: branch, error, loading, reload } = useQuery<BranchDetail>(`/branches/${id}`);
  const impact = useQuery<ClosureImpact>(confirm?.status === 'ARCHIVED' ? `/branches/${id}/closure-impact` : null);

  const canManage = user?.role === 'ORG_OWNER' || user?.role === 'ORG_ADMIN';

  async function changeStatus(status: string, reason: string) {
    setBusy(true);
    try {
      await api(`/branches/${id}/status`, { method: 'POST', body: { status, reason } });
      toast({ kind: 'success', title: 'Branch updated', description: `${branch?.name} is now ${status.toLowerCase().replace(/_/g, ' ')}.` });
      setConfirm(null);
      reload();
      await reloadSession();
    } catch (err) {
      toast({
        kind: 'error',
        title: 'Could not update the branch',
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
          kind={error instanceof ApiError && error.status === 403 ? 'forbidden' : 'not-found'}
          description={error.message}
          action={<Button variant="outline" onClick={() => router.push('/branches')}>Back to branches</Button>}
        />
      </div>
    );
  }

  if (loading || !branch) {
    return (
      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        onBack={() => router.push('/branches')}
        breadcrumbs={[{ label: 'Organization' }, { label: 'Branches', href: '/branches' }, { label: branch.name }]}
        title={branch.name}
        description={`${branch.code} · ${branch.city}, ${branch.state}`}
        actions={
          <>
            <StatusBadge status={branch.status} />
            {canManage && branch.status !== 'ARCHIVED' && (
              <Dropdown
                heading={branch.name}
                trigger={<Button variant="outline">Actions</Button>}
                items={[
                  { label: 'Edit branch', onSelect: () => setEditing(true) },
                  ...(branch.needsAdmin ? [{ label: 'Add branch admin', onSelect: () => setAddingAdmin(true) }] : []),
                  ...(branch.status === 'ACTIVE'
                    ? [{ label: 'Temporarily close', onSelect: () => setConfirm({ status: 'TEMPORARILY_CLOSED', label: 'Temporarily close', destructive: false }) }]
                    : [{ label: 'Reopen branch', onSelect: () => setConfirm({ status: 'ACTIVE', label: 'Reopen', destructive: false }) }]),
                  'separator',
                  { label: 'Archive branch', destructive: true, onSelect: () => setConfirm({ status: 'ARCHIVED', label: 'Archive', destructive: true }) },
                ]}
              />
            )}
          </>
        }
        tabs={<Tabs value={tab} onChange={setTab} tabs={TABS} />}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {branch.needsAdmin && branch.status !== 'ARCHIVED' && (
          <Alert
            tone="warning"
            title="This branch has no admin"
            action={canManage ? <Button size="sm" onClick={() => setAddingAdmin(true)}>Add admin</Button> : undefined}
          >
            A branch becomes active once an admin is assigned.
          </Alert>
        )}

        {branch.status === 'ARCHIVED' && (
          <Alert tone="neutral" title="This branch is archived">
            Archived branches are read-only. Their historical records remain available.
          </Alert>
        )}

        {tab === 'overview' && (
          <div className="grid gap-3.5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Branch details</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Code"><span className="font-mono">{branch.code}</span></Field>
                <Field label="Status"><StatusBadge status={branch.status} /></Field>
                <Field label="Address">{branch.addressLine ?? '—'}</Field>
                <Field label="City">{branch.city}, {branch.state}</Field>
                <Field label="Pincode"><span className="font-mono">{branch.pincode ?? '—'}</span></Field>
                <Field label="Phone"><span className="font-mono">{branch.phone ?? '—'}</span></Field>
                <Field label="Email">{branch.email ?? '—'}</Field>
                <Field label="Timezone">{branch.timezone}</Field>
                <Field label="Working days">
                  {branch.workingDays.map((d) => DAYS[d]).join(', ')}
                </Field>
                <Field label="Opened">{branch.openedAt?.slice(0, 10) ?? 'Not yet'}</Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Team</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Field label="Branch admin">
                  {branch.admins.length ? branch.admins.map((a) => a.name).join(', ') : <Badge variant="warning">None</Badge>}
                </Field>
                <Field label="Staff assigned"><span className="font-mono tabular-nums">{branch.staffCount}</span></Field>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'staff' && (
          <Card>
            <CardHeader><CardTitle>Assigned staff</CardTitle></CardHeader>
            <CardContent>
              {branch.members.length === 0 ? (
                <p className="text-body-sm text-fg-muted">Nobody is assigned to this branch yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {branch.members.map((m) => (
                    <li key={m.user.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-body-sm text-fg">{m.user.name}</span>
                        <span className="truncate text-caption text-fg-muted">{m.user.email}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {m.isPrimary && <Badge variant="primary">Primary</Badge>}
                        {!m.user.acceptedAt && <Badge variant="warning">Invited</Badge>}
                        <Badge variant="neutral">{m.user.role.replace(/_/g, ' ').toLowerCase()}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'transfers' && <TransfersTab branchId={branch.id} />}
      </div>

      <CreateBranchAdminDrawer
        open={addingAdmin}
        branch={branch}
        onClose={() => setAddingAdmin(false)}
        onCreated={() => { setAddingAdmin(false); reload(); }}
      />

      <CreateBranchDrawer
        open={editing}
        branch={branch}
        onClose={() => setEditing(false)}
        onCreated={() => { setEditing(false); reload(); }}
      />

      <ConfirmDialog
        open={confirm !== null}
        destructive={confirm?.destructive}
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && changeStatus(confirm.status, `${confirm.label} via ERP`)}
        title={`${confirm?.label} ${branch.name}?`}
        description={
          confirm?.status === 'ARCHIVED'
            ? impact.data && !impact.data.canArchive
              ? `This branch still has ${impact.data.blockers.map((b) => `${b.count} ${b.label.toLowerCase()}`).join(', ')}. Resolve them before archiving.`
              : 'The branch becomes read-only. Its historical records are retained and remain reportable.'
            : confirm?.status === 'TEMPORARILY_CLOSED'
              ? 'Day-to-day operations pause. Staff assignments and records are kept, and you can reopen at any time.'
              : 'The branch resumes normal operation.'
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

function TransfersTab({ branchId }: { branchId: string }) {
  const { data, loading } = useQuery<{
    id: string; entityType: string; entityLabel: string | null; reason: string | null; createdAt: string;
    fromBranch: { id: string; name: string } | null;
    toBranch: { id: string; name: string };
  }[]>(`/branches/${branchId}/transfers`);

  if (loading) return <Skeleton className="h-40 rounded-lg" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfers</CardTitle>
        <span className="text-caption text-fg-muted">
          Every move in or out of this branch. Historical records stay with the branch that owned them.
        </span>
      </CardHeader>
      <CardContent>
        {(data ?? []).length === 0 ? (
          <p className="text-body-sm text-fg-muted">No transfers recorded.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {(data ?? []).map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-body-sm text-fg">
                    {t.entityLabel ?? t.entityType}
                    <span className="text-fg-muted">
                      {' '}— {t.fromBranch ? `${t.fromBranch.name} → ` : 'joined '}{t.toBranch.name}
                    </span>
                  </span>
                  {t.reason && <span className="truncate text-caption text-fg-muted">{t.reason}</span>}
                </span>
                <span className="shrink-0 text-caption text-fg-muted">{t.createdAt.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
