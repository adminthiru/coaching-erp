'use client';

import * as React from 'react';
import {
  Badge, Button, DataTable, DateRangeFilter, Dropdown, EmptyState, ErrorState, PageHeader,
  SearchInput, Segmented, resolvePreset, useToast, type Column, type DateRange,
} from '@acadia/ui';
import {
  EXPENSE_CATEGORY_LABEL, EXPENSE_STATUS_LABEL, type ExpenseCategory, type ExpenseStatus,
} from '@acadia/types';
import { formatMinor } from '@acadia/utils';
import { ApiError, api } from '@/lib/api';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { CreateExpenseDrawer } from '@/components/create-expense-drawer';

interface ExpenseRow {
  id: string; title: string; category: ExpenseCategory; status: ExpenseStatus;
  amountMinor: number; incurredOn: string; vendor: string | null; scope: 'branch' | 'organization';
  branch: { id: string; name: string; code: string } | null;
  recordedBy: { id: string; name: string };
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

const STATUS_VARIANT: Record<ExpenseStatus, 'warning' | 'info' | 'success' | 'error'> = {
  PENDING: 'warning', APPROVED: 'info', PAID: 'success', REJECTED: 'error',
};

const NEXT: Record<ExpenseStatus, ExpenseStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['PAID', 'REJECTED'],
  REJECTED: [],
  PAID: [],
};

const ACTION_LABEL: Record<ExpenseStatus, string> = {
  PENDING: 'Move to pending', APPROVED: 'Approve', PAID: 'Mark paid', REJECTED: 'Reject',
};

/** Spec §63 — branch and central organization costs. */
export default function ExpensesPage() {
  const { activeBranch, user } = useSession();
  const { toast } = useToast();
  const [status, setStatus] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [range, setRange] = React.useState<DateRange>(() => resolvePreset('30d'));
  const [page, setPage] = React.useState(1);
  const [creating, setCreating] = React.useState(false);
  const debounced = useDebounced(search);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'].includes(user?.role ?? '');

  React.useEffect(() => { setPage(1); }, [debounced, status, range.from, range.to]);

  const { data, error, loading, reload } = useQuery<Page<ExpenseRow>>('/expenses', {
    query: {
      page, pageSize: 25,
      search: debounced || undefined,
      status: status === 'all' ? undefined : status,
      from: range.from, to: range.to,
    },
  }, [range.from, range.to]);

  const total = (data?.data ?? []).reduce((sum, e) => sum + e.amountMinor, 0);

  async function changeStatus(row: ExpenseRow, next: ExpenseStatus) {
    try {
      await api(`/expenses/${row.id}/status`, { method: 'POST', body: { status: next } });
      toast({ kind: 'success', title: 'Expense updated', description: `${row.title} is now ${EXPENSE_STATUS_LABEL[next].toLowerCase()}.` });
      reload();
    } catch (err) {
      toast({ kind: 'error', title: 'Could not update', description: err instanceof ApiError ? err.message : 'Something went wrong.' });
    }
  }

  const columns: Column<ExpenseRow>[] = [
    {
      key: 'title',
      header: 'Expense',
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{r.title}</span>
          <span className="truncate text-caption text-fg-muted">
            {EXPENSE_CATEGORY_LABEL[r.category]}{r.vendor && ` · ${r.vendor}`}
          </span>
        </div>
      ),
    },
    {
      key: 'scope',
      header: 'Whose',
      mobile: 'secondary',
      cell: (r) => r.scope === 'organization'
        ? <Badge variant="primary">Central</Badge>
        : <Badge variant="neutral">{r.branch?.code ?? 'Branch'}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'secondary',
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{EXPENSE_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'incurredOn',
      header: 'Incurred',
      sortable: true,
      cell: (r) => <span className="text-fg-secondary">{r.incurredOn.slice(0, 10)}</span>,
    },
    {
      key: 'amountMinor',
      header: 'Amount',
      align: 'right',
      sortable: true,
      mobile: 'meta',
      cell: (r) => <span className="font-mono tabular-nums text-fg">{formatMinor(r.amountMinor)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Finance' }, { label: 'Expenses' }]}
        title="Expenses"
        description={activeBranch ? `Costs booked to ${activeBranch.name}.` : 'Branch costs and central organization spend.'}
        actions={
          <>
            <DateRangeFilter value={range} onChange={setRange} />
            {canManage && <Button onClick={() => setCreating(true)}>Record expense</Button>}
          </>
        }
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {error ? (
          <ErrorState title="Couldn't load expenses" description={error.message} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            getRowId={(r) => r.id}
            loading={loading}
            toolbar={
              <div className="flex w-full flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="w-full max-w-[260px]">
                    <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title…" />
                  </div>
                  <Segmented
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'PENDING', label: 'Pending' },
                      { value: 'APPROVED', label: 'Approved' },
                      { value: 'PAID', label: 'Paid' },
                    ]}
                    value={status}
                    onChange={setStatus}
                    size="sm"
                    aria-label="Filter by status"
                  />
                </div>
                <span className="text-body-sm text-fg-secondary">
                  <span className="font-mono tabular-nums text-fg">{formatMinor(total)}</span> on this page
                </span>
              </div>
            }
            rowActions={
              canManage
                ? (row) => NEXT[row.status].length > 0
                    ? (
                        <Dropdown
                          heading={row.title}
                          trigger={<Button size="sm" variant="ghost" iconOnly aria-label="Expense actions">⋯</Button>}
                          items={NEXT[row.status].map((s) => ({
                            label: ACTION_LABEL[s],
                            destructive: s === 'REJECTED',
                            onSelect: () => changeStatus(row, s),
                          }))}
                        />
                      )
                    : null
                : undefined
            }
            empty={
              <EmptyState
                title={debounced ? 'No matching expenses' : 'No expenses in this period'}
                description={debounced ? 'Try a different title.' : 'Record what the branch has spent.'}
                action={canManage && !debounced ? <Button onClick={() => setCreating(true)}>Record expense</Button> : undefined}
              />
            }
            pagination={
              data
                ? { page: data.meta.page, pageCount: data.meta.pageCount, onChange: setPage, summary: `${data.meta.total} expense${data.meta.total === 1 ? '' : 's'}` }
                : undefined
            }
          />
        )}
      </div>

      <CreateExpenseDrawer open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
