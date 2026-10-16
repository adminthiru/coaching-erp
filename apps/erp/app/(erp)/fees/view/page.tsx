'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dropdown, ErrorState,
  PageHeader, Progress, Skeleton, useToast,
} from '@acadia/ui';
import {
  CONCESSION_KIND_LABEL, INSTALLMENT_STATUS_LABEL, STUDENT_FEE_STATUS_LABEL,
  type ConcessionKind, type InstallmentStatus, type StudentFeeStatus,
} from '@acadia/types';
import { formatMinor } from '@acadia/utils';
import { ApiError } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { RecordPaymentDrawer } from '@/components/record-payment-drawer';
import { GrantConcessionDrawer } from '@/components/grant-concession-drawer';
import { RefundPaymentDrawer } from '@/components/refund-payment-drawer';

interface FeeDetail {
  id: string; status: StudentFeeStatus;
  grossMinor: number; discountMinor: number; netMinor: number; paidMinor: number; outstandingMinor: number;
  assignedAt: string; note: string | null;
  student: { id: string; name: string; studentCode: string };
  branch: { id: string; name: string; code: string };
  feeStructure: { id: string; name: string };
  installments: { id: string; label: string; amountMinor: number; paidMinor: number; dueDate: string; status: InstallmentStatus }[];
  concessions: { id: string; kind: ConcessionKind; amountMinor: number; reason: string; createdAt: string; grantedBy: { id: string; name: string } }[];
  payments: {
    id: string; receiptNumber: string; amountMinor: number; refundedMinor: number; method: string;
    paidAt: string; reference: string | null; status: string;
    collectedBy: { id: string; name: string };
    refunds: { id: string; amountMinor: number; reason: string; createdAt: string }[];
  }[];
}

const STATUS_VARIANT: Record<StudentFeeStatus, 'neutral' | 'warning' | 'success' | 'error'> = {
  PENDING: 'warning', PARTIALLY_PAID: 'neutral', PAID: 'success', CANCELLED: 'error',
};

const INSTALLMENT_VARIANT: Record<InstallmentStatus, 'neutral' | 'warning' | 'success'> = {
  PENDING: 'warning', PARTIALLY_PAID: 'neutral', PAID: 'success', WAIVED: 'neutral',
};

export default function FeeDetailPage() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const { user } = useSession();

  const [paying, setPaying] = React.useState(false);
  const [granting, setGranting] = React.useState(false);
  const [refunding, setRefunding] = React.useState<FeeDetail['payments'][number] | null>(null);

  const { data: fee, error, loading, reload } = useQuery<FeeDetail>(`/fees/${id}`);
  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT'].includes(user?.role ?? '');

  if (error) {
    return (
      <div className="px-5 py-5 lg:px-6">
        <ErrorState
          kind={error instanceof ApiError && error.status === 403 ? 'forbidden' : 'not-found'}
          description={error.message}
          action={<Button variant="outline" onClick={() => router.push('/fees')}>Back to fees</Button>}
        />
      </div>
    );
  }

  if (loading || !fee) {
    return (
      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const settled = fee.outstandingMinor <= 0;
  const overdue = fee.installments.filter((i) => i.status !== 'PAID' && i.status !== 'WAIVED' && new Date(i.dueDate) < new Date());

  return (
    <>
      <PageHeader
        onBack={() => router.push('/fees')}
        breadcrumbs={[{ label: 'Finance' }, { label: 'Fees', href: '/fees' }, { label: fee.student.name }]}
        title={fee.student.name}
        description={`${fee.student.studentCode} · ${fee.feeStructure.name} · ${fee.branch.name}`}
        actions={
          <>
            <Badge variant={STATUS_VARIANT[fee.status]}>{STUDENT_FEE_STATUS_LABEL[fee.status]}</Badge>
            {canManage && fee.status !== 'CANCELLED' && (
              <>
                {!settled && <Button onClick={() => setPaying(true)}>Record payment</Button>}
                <Dropdown
                  heading={fee.student.name}
                  trigger={<Button variant="outline">Actions</Button>}
                  items={[
                    { label: 'Apply concession…', onSelect: () => setGranting(true) },
                    { label: 'View student', onSelect: () => router.push(`/students/view?id=${fee.student.id}`) },
                  ]}
                />
              </>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {overdue.length > 0 && (
          <Alert tone="warning" title={`${overdue.length} installment${overdue.length === 1 ? '' : 's'} overdue`}>
            {overdue.map((i) => `${i.label} (due ${i.dueDate.slice(0, 10)})`).join(', ')}
          </Alert>
        )}

        <div className="grid gap-3.5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Balance</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <Money label="Gross" value={fee.grossMinor} />
                <Money label="Concessions" value={fee.discountMinor} tone={fee.discountMinor > 0 ? 'success' : undefined} />
                <Money label="Payable" value={fee.netMinor} />
                <Money label="Paid" value={fee.paidMinor} />
              </div>
              <Progress
                value={fee.paidMinor}
                max={Math.max(fee.netMinor, 1)}
                tone={settled ? 'success' : 'primary'}
                aria-label="Fee paid"
              />
              <div className="flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-body-sm text-fg-secondary">Outstanding</span>
                <span className={`font-mono text-h2 tabular-nums ${settled ? 'text-success' : 'text-warning'}`}>
                  {settled ? 'Settled' : formatMinor(fee.outstandingMinor)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Account</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Field label="Structure">
                <Link href="/fees" className="text-primary hover:underline">{fee.feeStructure.name}</Link>
              </Field>
              <Field label="Branch">{fee.branch.name}</Field>
              <Field label="Assigned">{fee.assignedAt.slice(0, 10)}</Field>
              {fee.note && <Field label="Note">{fee.note}</Field>}
            </CardContent>
          </Card>
        </div>

        {fee.installments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
              <span className="text-caption text-fg-muted">Payments clear the most overdue installment first.</span>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2.5">
                {fee.installments.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 border-b border-border pb-2.5 last:border-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-body-sm text-fg">{i.label}</span>
                      <span className="text-caption text-fg-muted">due {i.dueDate.slice(0, 10)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-body-sm tabular-nums text-fg-secondary">
                        {formatMinor(i.paidMinor)} / {formatMinor(i.amountMinor)}
                      </span>
                      <Badge variant={INSTALLMENT_VARIANT[i.status]}>{INSTALLMENT_STATUS_LABEL[i.status]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3.5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Receipts</CardTitle>
              <span className="text-caption text-fg-muted">Never deleted — a mistake is corrected by a refund.</span>
            </CardHeader>
            <CardContent>
              {fee.payments.length === 0 ? (
                <p className="text-body-sm text-fg-muted">No payments yet.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {fee.payments.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-mono text-body-sm text-fg">{p.receiptNumber}</span>
                        <span className="truncate text-caption text-fg-muted">
                          {p.paidAt.slice(0, 10)} · {p.method.replace(/_/g, ' ').toLowerCase()} · {p.collectedBy.name}
                        </span>
                        {p.refunds.map((r) => (
                          <span key={r.id} className="truncate text-caption text-error">
                            −{formatMinor(r.amountMinor)} refunded · {r.reason}
                          </span>
                        ))}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-body-sm tabular-nums text-fg">{formatMinor(p.amountMinor)}</span>
                        {canManage && p.refundedMinor < p.amountMinor && (
                          <Button size="xs" variant="ghost" onClick={() => setRefunding(p)}>Refund</Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Concessions</CardTitle>
              <span className="text-caption text-fg-muted">Who reduced this fee, and why.</span>
            </CardHeader>
            <CardContent>
              {fee.concessions.length === 0 ? (
                <p className="text-body-sm text-fg-muted">No concessions applied.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {fee.concessions.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-3 border-b border-border pb-2.5 last:border-0">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-body-sm text-fg">{CONCESSION_KIND_LABEL[c.kind]}</span>
                        <span className="truncate text-caption text-fg-muted">{c.reason}</span>
                        <span className="text-caption text-fg-muted">{c.grantedBy.name} · {c.createdAt.slice(0, 10)}</span>
                      </span>
                      <span className="shrink-0 font-mono text-body-sm tabular-nums text-success">−{formatMinor(c.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <RecordPaymentDrawer open={paying} fee={fee} onClose={() => setPaying(false)} onRecorded={() => { setPaying(false); reload(); }} />
      <GrantConcessionDrawer open={granting} fee={fee} onClose={() => setGranting(false)} onGranted={() => { setGranting(false); reload(); }} />
      <RefundPaymentDrawer
        open={refunding !== null}
        payment={refunding ? { ...refunding, student: fee.student } : null}
        onClose={() => setRefunding(null)}
        onRefunded={() => { setRefunding(null); reload(); }}
      />
    </>
  );
}

function Money({ label, value, tone }: { label: string; value: number; tone?: 'success' }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption text-fg-muted">{label}</span>
      <span className={`font-mono text-body tabular-nums ${tone === 'success' ? 'text-success' : 'text-fg'}`}>
        {tone === 'success' && value > 0 ? '−' : ''}{formatMinor(value)}
      </span>
    </div>
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
