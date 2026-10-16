'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Badge, Button, DataTable, DateRangeFilter, EmptyState, ErrorState, PageHeader, SearchInput,
  resolvePreset, type Column, type DateRange,
} from '@acadia/ui';
import { FEE_PAYMENT_STATUS_LABEL, type FeePaymentStatus } from '@acadia/types';
import { formatMinor } from '@acadia/utils';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { RefundPaymentDrawer } from '@/components/refund-payment-drawer';

interface PaymentRow {
  id: string; receiptNumber: string; amountMinor: number; refundedMinor: number;
  method: string; status: FeePaymentStatus; paidAt: string; reference: string | null;
  student: { id: string; name: string; studentCode: string };
  branch: { id: string; name: string; code: string };
  collectedBy: { id: string; name: string };
  studentFee: { id: string; feeStructure: { name: string } };
}

interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }

const STATUS_VARIANT: Record<FeePaymentStatus, 'success' | 'warning' | 'error'> = {
  SUCCEEDED: 'success', PARTIALLY_REFUNDED: 'warning', REFUNDED: 'error',
};

/** Spec §62 — the receipt book. */
export default function PaymentsPage() {
  const { activeBranch, user } = useSession();
  const [search, setSearch] = React.useState('');
  const [range, setRange] = React.useState<DateRange>(() => resolvePreset('30d'));
  const [page, setPage] = React.useState(1);
  const [refunding, setRefunding] = React.useState<PaymentRow | null>(null);
  const debounced = useDebounced(search);

  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'].includes(user?.role ?? '');

  React.useEffect(() => { setPage(1); }, [debounced, range.from, range.to]);

  const { data, error, loading, reload } = useQuery<Page<PaymentRow>>('/fee-payments', {
    query: { page, pageSize: 25, search: debounced || undefined, from: range.from, to: range.to },
  }, [range.from, range.to]);

  const collected = (data?.data ?? []).reduce((sum, p) => sum + (p.amountMinor - p.refundedMinor), 0);

  const columns: Column<PaymentRow>[] = [
    {
      key: 'receiptNumber',
      header: 'Receipt',
      mobile: 'primary',
      cell: (r) => (
        <Link href={`/fees/view?id=${r.studentFee.id}`} className="flex min-w-0 flex-col hover:text-primary">
          <span className="truncate font-mono font-semibold text-fg">{r.receiptNumber}</span>
          <span className="truncate text-caption text-fg-muted">
            {r.student.name} · <span className="font-mono">{r.student.studentCode}</span>
          </span>
        </Link>
      ),
    },
    {
      key: 'paidAt',
      header: 'Date',
      sortable: true,
      mobile: 'secondary',
      cell: (r) => <span className="text-fg-secondary">{r.paidAt.slice(0, 10)}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      cell: (r) => (
        <span className="flex flex-col gap-0.5">
          <span className="text-fg-secondary">{r.method.replace(/_/g, ' ').toLowerCase()}</span>
          {r.reference && <span className="truncate font-mono text-caption text-fg-muted">{r.reference}</span>}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'secondary',
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{FEE_PAYMENT_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'amountMinor',
      header: 'Amount',
      align: 'right',
      sortable: true,
      mobile: 'meta',
      cell: (r) => (
        <span className="flex flex-col items-end">
          <span className="font-mono tabular-nums text-fg">{formatMinor(r.amountMinor)}</span>
          {r.refundedMinor > 0 && <span className="font-mono text-caption text-error">−{formatMinor(r.refundedMinor)}</span>}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Finance' }, { label: 'Payments' }]}
        title="Payments"
        description={activeBranch ? `Receipts issued at ${activeBranch.name}.` : 'Receipts across the branches you can access.'}
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {error ? (
          <ErrorState title="Couldn't load payments" description={error.message} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            getRowId={(r) => r.id}
            loading={loading}
            toolbar={
              <div className="flex w-full flex-wrap items-center justify-between gap-2.5">
                <div className="w-full max-w-[300px]">
                  <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search receipt or student…" />
                </div>
                <span className="text-body-sm text-fg-secondary">
                  <span className="font-mono tabular-nums text-fg">{formatMinor(collected)}</span> on this page
                </span>
              </div>
            }
            rowActions={
              canManage
                ? (row) => row.refundedMinor < row.amountMinor
                    ? <Button size="sm" variant="ghost" onClick={() => setRefunding(row)}>Refund</Button>
                    : null
                : undefined
            }
            empty={
              <EmptyState
                title={debounced ? 'No matching receipts' : 'No payments in this period'}
                description={debounced ? 'Try a different receipt number or student.' : 'Record a payment from a student’s fee account.'}
              />
            }
            pagination={
              data
                ? { page: data.meta.page, pageCount: data.meta.pageCount, onChange: setPage, summary: `${data.meta.total} receipt${data.meta.total === 1 ? '' : 's'}` }
                : undefined
            }
          />
        )}
      </div>

      <RefundPaymentDrawer
        open={refunding !== null}
        payment={refunding}
        onClose={() => setRefunding(null)}
        onRefunded={() => { setRefunding(null); reload(); }}
      />
    </>
  );
}
