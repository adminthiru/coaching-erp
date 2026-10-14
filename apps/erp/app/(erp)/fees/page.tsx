'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge, Button, DataTable, EmptyState, ErrorState, MetricCard, PageHeader, SearchInput, Segmented,
  Skeleton, type Column,
} from '@acadia/ui';
import { STUDENT_FEE_STATUS_LABEL, type StudentFeeStatus } from '@acadia/types';
import { formatMinor } from '@acadia/utils';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { AssignFeeDrawer } from '@/components/assign-fee-drawer';
import { CreateFeeStructureDrawer } from '@/components/create-fee-structure-drawer';

interface FeeRow {
  id: string; status: StudentFeeStatus;
  grossMinor: number; discountMinor: number; netMinor: number; paidMinor: number; outstandingMinor: number;
  student: { id: string; name: string; studentCode: string };
  branch: { id: string; name: string; code: string };
  feeStructure: { id: string; name: string };
}

interface StructureRow {
  id: string; name: string; totalMinor: number; scope: 'branch' | 'organization'; assignedCount: number;
  branch: { id: string; name: string; code: string } | null;
  course: { id: string; name: string } | null;
  academicYear: { id: string; name: string } | null;
}

interface FinanceSummary {
  summary: { collectedMinor: number; outstandingMinor: number; branchExpensesMinor: number; netMinor: number; receiptsCount: number };
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

const STATUS_VARIANT: Record<StudentFeeStatus, 'neutral' | 'warning' | 'success' | 'error'> = {
  PENDING: 'warning', PARTIALLY_PAID: 'neutral', PAID: 'success', CANCELLED: 'error',
};

/** Spec §61 — student fee accounts and the structures they come from. */
export default function FeesPage() {
  const router = useRouter();
  const { user } = useSession();
  const [tab, setTab] = React.useState('accounts');
  const [status, setStatus] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [assigning, setAssigning] = React.useState(false);
  const [creatingStructure, setCreatingStructure] = React.useState(false);
  const debounced = useDebounced(search);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'].includes(user?.role ?? '');

  React.useEffect(() => { setPage(1); }, [debounced, status, tab]);

  const finance = useQuery<FinanceSummary>(canManage ? '/analytics/finance' : null);

  const accounts = useQuery<Page<FeeRow>>(tab === 'accounts' ? '/fees' : null, {
    query: {
      page, pageSize: 25,
      search: debounced || undefined,
      status: status === 'all' || status === 'outstanding' ? undefined : status,
      outstanding: status === 'outstanding' ? true : undefined,
    },
  }, [tab]);

  const structures = useQuery<Page<StructureRow>>(tab === 'structures' ? '/fee-structures' : null, {
    query: { page, pageSize: 25, search: debounced || undefined },
  }, [tab]);

  const accountColumns: Column<FeeRow>[] = [
    {
      key: 'student',
      header: 'Student',
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{r.student.name}</span>
          <span className="truncate text-caption text-fg-muted">
            <span className="font-mono">{r.student.studentCode}</span> · {r.feeStructure.name}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'secondary',
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{STUDENT_FEE_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'netMinor',
      header: 'Payable',
      align: 'right',
      cell: (r) => (
        <span className="flex flex-col items-end">
          <span className="font-mono tabular-nums text-fg-secondary">{formatMinor(r.netMinor)}</span>
          {r.discountMinor > 0 && <span className="font-mono text-caption text-success">−{formatMinor(r.discountMinor)}</span>}
        </span>
      ),
    },
    {
      key: 'paidMinor',
      header: 'Paid',
      align: 'right',
      mobile: 'meta',
      cell: (r) => <span className="font-mono tabular-nums text-fg-secondary">{formatMinor(r.paidMinor)}</span>,
    },
    {
      key: 'outstandingMinor',
      header: 'Outstanding',
      align: 'right',
      mobile: 'secondary',
      cell: (r) => (
        <span className={`font-mono tabular-nums ${r.outstandingMinor > 0 ? 'text-warning' : 'text-fg-muted'}`}>
          {r.outstandingMinor > 0 ? formatMinor(r.outstandingMinor) : '—'}
        </span>
      ),
    },
  ];

  const structureColumns: Column<StructureRow>[] = [
    {
      key: 'name',
      header: 'Structure',
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{r.name}</span>
          <span className="truncate text-caption text-fg-muted">
            {r.course?.name ?? 'Any course'}{r.academicYear && ` · ${r.academicYear.name}`}
          </span>
        </div>
      ),
    },
    {
      key: 'scope',
      header: 'Library',
      mobile: 'secondary',
      cell: (r) => r.scope === 'organization'
        ? <Badge variant="primary">Shared</Badge>
        : <Badge variant="neutral">{r.branch?.code ?? 'Branch'}</Badge>,
    },
    {
      key: 'totalMinor',
      header: 'Total',
      align: 'right',
      cell: (r) => <span className="font-mono tabular-nums text-fg">{formatMinor(r.totalMinor)}</span>,
    },
    {
      key: 'assignedCount',
      header: 'Assigned',
      align: 'right',
      mobile: 'meta',
      cell: (r) => <span className="font-mono tabular-nums text-fg-secondary">{r.assignedCount || '—'}</span>,
    },
  ];

  const active = tab === 'accounts' ? accounts : structures;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Finance' }, { label: 'Fees' }]}
        title="Fees"
        description="What each student owes, and the structures those amounts come from."
        actions={
          canManage ? (
            tab === 'accounts'
              ? <Button onClick={() => setAssigning(true)}>Assign a fee</Button>
              : <Button onClick={() => setCreatingStructure(true)}>New structure</Button>
          ) : undefined
        }
        tabs={
          <Segmented
            options={[{ value: 'accounts', label: 'Accounts' }, { value: 'structures', label: 'Structures' }]}
            value={tab}
            onChange={setTab}
            aria-label="Fees view"
          />
        }
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {canManage && (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {finance.loading || !finance.data ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-lg" />)
            ) : (
              <>
                <MetricCard title="Collected" value={formatMinor(finance.data.summary.collectedMinor)} description={`${finance.data.summary.receiptsCount} receipts`} />
                <MetricCard title="Outstanding" value={formatMinor(finance.data.summary.outstandingMinor)} description="still owed" invertDelta />
                <MetricCard title="Expenses" value={formatMinor(finance.data.summary.branchExpensesMinor)} description="approved and paid" invertDelta />
                <MetricCard title="Net" value={formatMinor(finance.data.summary.netMinor)} description="collections less expenses" />
              </>
            )}
          </div>
        )}

        {active.error ? (
          <ErrorState title="Couldn't load fees" description={active.error.message} onRetry={active.reload} />
        ) : tab === 'accounts' ? (
          <DataTable
            columns={accountColumns}
            data={accounts.data?.data ?? []}
            getRowId={(r) => r.id}
            loading={accounts.loading}
            onRowClick={(r) => router.push(`/fees/${r.id}`)}
            toolbar={
              <div className="flex w-full flex-wrap items-center gap-2.5">
                <div className="w-full max-w-[280px]">
                  <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student…" />
                </div>
                <Segmented
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'outstanding', label: 'Outstanding' },
                    { value: 'PAID', label: 'Paid' },
                  ]}
                  value={status}
                  onChange={setStatus}
                  size="sm"
                  aria-label="Filter by status"
                />
              </div>
            }
            empty={
              <EmptyState
                title={debounced ? 'No matching accounts' : 'No fees assigned yet'}
                description={debounced ? 'Try a different name or code.' : 'Create a structure, then assign it to students.'}
                action={canManage && !debounced ? <Button onClick={() => setAssigning(true)}>Assign a fee</Button> : undefined}
              />
            }
            pagination={
              accounts.data
                ? { page: accounts.data.meta.page, pageCount: accounts.data.meta.pageCount, onChange: setPage, summary: `${accounts.data.meta.total} account${accounts.data.meta.total === 1 ? '' : 's'}` }
                : undefined
            }
          />
        ) : (
          <DataTable
            columns={structureColumns}
            data={structures.data?.data ?? []}
            getRowId={(r) => r.id}
            loading={structures.loading}
            toolbar={
              <div className="w-full max-w-[280px]">
                <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search structures…" />
              </div>
            }
            empty={
              <EmptyState
                title="No fee structures yet"
                description="A structure is the template a student's fee account is built from."
                action={canManage ? <Button onClick={() => setCreatingStructure(true)}>New structure</Button> : undefined}
              />
            }
            pagination={
              structures.data
                ? { page: structures.data.meta.page, pageCount: structures.data.meta.pageCount, onChange: setPage, summary: `${structures.data.meta.total} structure${structures.data.meta.total === 1 ? '' : 's'}` }
                : undefined
            }
          />
        )}
      </div>

      <AssignFeeDrawer
        open={assigning}
        onClose={() => setAssigning(false)}
        onAssigned={(id) => { setAssigning(false); router.push(`/fees/${id}`); }}
      />
      <CreateFeeStructureDrawer
        open={creatingStructure}
        onClose={() => setCreatingStructure(false)}
        onCreated={() => { setCreatingStructure(false); structures.reload(); }}
      />
    </>
  );
}
