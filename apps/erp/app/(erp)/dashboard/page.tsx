'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Alert, Button, Card, CardContent, CardHeader, CardTitle, DataTable, ErrorState,
  MetricCard, PageHeader, percent, Skeleton, StatusBadge, UsageMeter, type Column,
} from '@acadia/ui';
import { formatMinorCompact } from '@acadia/utils';
import { useRouter } from 'next/navigation';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Summary {
  scope: 'branch' | 'assigned' | 'organization';
  activeBranchId: string | null;
  branches: { id: string; name: string; code: string; city: string; status: string }[];
  metrics: { branches: number; staff: number; faculty: number; pendingInvites: number; students: number | null };
  plan: { name: string | null; branchLimit: number | null; branchesUsed: number };
  alerts: { branchesNeedingAdmin: { id: string; name: string; status: string }[] };
}

interface BranchComparisonRow {
  id: string; name: string; code: string; city: string; status: string;
  staffCount: number; activeStudents: number;
  attendanceRate: number | null; admissionConversionRate: number | null;
  averageTestScore: number | null; testsSat: number;
  collectedMinor: number; outstandingMinor: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const { organization, activeBranch, scope } = useSession();
  const { data, error, loading, reload } = useQuery<Summary>('/dashboard/summary');

  const comparison = useQuery<BranchComparisonRow[]>(
    scope?.canSelectAllBranches && !activeBranch ? '/dashboard/branch-comparison' : null,
  );

  const comparisonColumns: Column<BranchComparisonRow>[] = [
    {
      key: 'name',
      header: 'Branch',
      mobile: 'primary',
      cell: (r) => (
        <Link href={`/branches/${r.id}`} className="flex min-w-0 flex-col hover:text-primary">
          <span className="truncate text-body-sm text-fg">{r.name}</span>
          <span className="truncate text-caption text-fg-muted"><span className="font-mono">{r.code}</span> · {r.city}</span>
        </Link>
      ),
    },
    {
      key: 'activeStudents',
      header: 'Students',
      align: 'right',
      mobile: 'secondary',
      cell: (r) => <span className="font-mono tabular-nums">{r.activeStudents.toLocaleString('en-IN')}</span>,
    },
    {
      key: 'staffCount',
      header: 'Staff',
      align: 'right',
      cell: (r) => <span className="font-mono tabular-nums">{r.staffCount}</span>,
    },
    {
      key: 'attendanceRate',
      header: 'Attendance (30d)',
      align: 'right',
      mobile: 'secondary',
      cell: (r) => <span className="font-mono tabular-nums text-fg-secondary">{r.attendanceRate === null ? '—' : percent(r.attendanceRate)}</span>,
    },
    {
      key: 'averageTestScore',
      header: 'Avg test score',
      align: 'right',
      mobile: 'meta',
      cell: (r) => (
        <span className="font-mono tabular-nums text-fg-secondary">
          {r.averageTestScore === null ? '—' : percent(r.averageTestScore)}
          {r.testsSat > 0 && <span className="text-caption text-fg-muted"> ({r.testsSat})</span>}
        </span>
      ),
    },
    {
      key: 'admissionConversionRate',
      header: 'Admission conversion',
      align: 'right',
      cell: (r) => <span className="font-mono tabular-nums text-fg-secondary">{r.admissionConversionRate === null ? '—' : percent(r.admissionConversionRate)}</span>,
    },
    {
      key: 'collectedMinor',
      header: 'Fees (30d)',
      align: 'right',
      cell: (r) => (
        <span className="flex flex-col items-end">
          <span className="font-mono tabular-nums text-fg-secondary">{formatMinorCompact(r.collectedMinor)}</span>
          {r.outstandingMinor > 0 && (
            <span className="font-mono text-caption text-warning">{formatMinorCompact(r.outstandingMinor)} due</span>
          )}
        </span>
      ),
    },
  ];

  const trialDaysLeft = organization?.trialEndsAt
    ? Math.ceil((new Date(organization.trialEndsAt).getTime() - Date.now()) / 864e5)
    : null;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: organization?.name ?? 'Organization' }, { label: 'Dashboard' }]}
        title={activeBranch ? activeBranch.name : 'All branches'}
        description={
          activeBranch
            ? `Operations for the ${activeBranch.city} branch.`
            : 'Everything across your organization.'
        }
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {trialDaysLeft !== null && trialDaysLeft <= 14 && (
          <Alert
            tone={trialDaysLeft <= 3 ? 'warning' : 'info'}
            title={trialDaysLeft <= 0 ? 'Your trial has ended' : `Trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'}`}
          >
            Contact your account manager to move onto a paid plan and keep access.
          </Alert>
        )}

        {error ? (
          <ErrorState title="Couldn't load your dashboard" description={error.message} onRetry={reload} />
        ) : loading || !data ? (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-lg" />)}
          </div>
        ) : (
          <>
            {data.alerts.branchesNeedingAdmin.length > 0 && (
              <Alert
                tone="warning"
                title={`${data.alerts.branchesNeedingAdmin.length} branch${data.alerts.branchesNeedingAdmin.length === 1 ? '' : 'es'} without an admin`}
                action={<Button size="sm" variant="outline" onClick={() => router.push('/branches')}>Review</Button>}
              >
                {data.alerts.branchesNeedingAdmin.map((b) => b.name).join(', ')} cannot operate until an admin is assigned.
              </Alert>
            )}

            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title={activeBranch ? 'Branch' : 'Branches'}
                value={activeBranch ? activeBranch.code : String(data.metrics.branches)}
                description={activeBranch ? activeBranch.city : 'active in your scope'}
              />
              <MetricCard
                title="Staff"
                value={data.metrics.staff.toLocaleString('en-IN')}
                description={`${data.metrics.faculty} faculty`}
              />
              <MetricCard
                title="Pending invites"
                value={String(data.metrics.pendingInvites)}
                description="not yet accepted"
              />
              <MetricCard
                title="Students"
                value={data.metrics.students === null ? '—' : data.metrics.students.toLocaleString('en-IN')}
                description={data.metrics.students === null ? 'available from Phase 2' : 'across the organization'}
              />
            </div>

            {comparison.data && comparison.data.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Branch comparison</CardTitle>
                  <span className="text-caption text-fg-muted">
                    Spec §56 — students, staff, attendance, test performance and admission conversion, side by side.
                  </span>
                </CardHeader>
                <CardContent>
                  <DataTable columns={comparisonColumns} data={comparison.data} getRowId={(r) => r.id} loading={comparison.loading} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Plan</CardTitle>
                <span className="text-caption text-fg-muted">{data.plan.name ?? 'No plan assigned'}</span>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <UsageMeter
                  label="Branches"
                  used={data.plan.branchesUsed}
                  limit={data.plan.branchLimit}
                  hint={
                    data.plan.branchLimit !== null && data.plan.branchesUsed >= data.plan.branchLimit
                      ? 'Branch limit reached — contact your account manager to upgrade.'
                      : undefined
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Branches in scope</CardTitle></CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2">
                  {data.branches.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                      <Link href={`/branches/${b.id}`} className="flex min-w-0 flex-col hover:text-primary">
                        <span className="truncate text-body-sm text-fg">{b.name}</span>
                        <span className="text-caption text-fg-muted">
                          <span className="font-mono">{b.code}</span> · {b.city}
                        </span>
                      </Link>
                      <StatusBadge status={b.status} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
