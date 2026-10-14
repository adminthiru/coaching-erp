'use client';

import * as React from 'react';
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, ErrorState, PageHeader, Skeleton,
  StatusBadge,
} from '@acadia/ui';
import { FEATURE_LABEL, LIMIT_LABEL, type Feature, type LimitKey } from '@acadia/types';
import { formatMinor } from '@acadia/utils';
import { useQuery } from '@/lib/hooks';

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  currency: string;
  monthlyPriceMinor: number;
  annualPriceMinor: number;
  trialDays: number;
  features: string[];
  limits: Record<string, number | null>;
  status: string;
  sortOrder: number;
  subscriptionCount: number;
}

export default function PlansPage() {
  const { data, error, loading, reload } = useQuery<Plan[]>('/platform/plans');

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Billing' }, { label: 'Plans' }]}
        title="Plans"
        description="What each tier costs, what it unlocks and how many organizations are on it."
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {error ? (
          <ErrorState title="Couldn't load plans" description={error.message} onRetry={reload} />
        ) : loading ? (
          <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[420px] rounded-lg" />)}
          </div>
        ) : (
          <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
            {(data ?? []).map((plan) => (
              <Card key={plan.id} className="flex flex-col">
                <CardHeader className="flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{plan.name}</CardTitle>
                    <StatusBadge status={plan.status} />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-h2 tabular-nums text-fg">
                      {plan.monthlyPriceMinor === 0 ? 'Free' : formatMinor(plan.monthlyPriceMinor, plan.currency)}
                    </span>
                    {plan.monthlyPriceMinor > 0 && <span className="text-caption text-fg-muted">/month</span>}
                  </div>
                  {plan.annualPriceMinor > 0 && (
                    <span className="text-caption text-fg-muted">
                      {formatMinor(plan.annualPriceMinor, plan.currency)}/year
                    </span>
                  )}
                  {plan.description && <p className="text-caption text-fg-secondary">{plan.description}</p>}
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-4">
                  <div className="flex items-center justify-between gap-2 rounded-md bg-surface-secondary px-3 py-2">
                    <span className="text-caption text-fg-secondary">Organizations</span>
                    <span className="font-mono text-body-sm tabular-nums text-fg">{plan.subscriptionCount}</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-label text-fg-secondary">Limits</span>
                    <ul className="flex flex-col gap-1">
                      {Object.entries(plan.limits).map(([key, value]) => (
                        <li key={key} className="flex items-center justify-between gap-2 text-caption">
                          <span className="text-fg-muted">{LIMIT_LABEL[key as LimitKey] ?? key}</span>
                          <span className="font-mono tabular-nums text-fg">
                            {value === null ? 'Unlimited' : value.toLocaleString('en-IN')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-label text-fg-secondary">
                      Features <span className="font-normal text-fg-muted">({plan.features.length})</span>
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {plan.features.map((f) => (
                        <Badge key={f} variant="neutral">{FEATURE_LABEL[f as Feature] ?? f}</Badge>
                      ))}
                    </div>
                  </div>

                  <span className="mt-auto text-caption text-fg-muted">
                    {plan.trialDays > 0 ? `${plan.trialDays}-day trial` : 'No trial'}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
