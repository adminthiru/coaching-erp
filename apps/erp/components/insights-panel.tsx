'use client';

import * as React from 'react';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@acadia/ui';
import { useQuery } from '@/lib/hooks';

interface Finding {
  kind: string;
  severity: 'info' | 'watch' | 'concern';
  detail: string;
}

interface Insights {
  findings: Finding[];
  narrative: string | null;
  narrativeModel: string | null;
  narrationAvailable: boolean;
  generatedAt: string;
}

const SEVERITY_VARIANT: Record<Finding['severity'], 'neutral' | 'warning' | 'error'> = {
  info: 'neutral', watch: 'warning', concern: 'error',
};

const SEVERITY_LABEL: Record<Finding['severity'], string> = {
  info: 'Context', watch: 'Watch', concern: 'Needs attention',
};

/**
 * Spec §§69–71. The findings are computed from the database and are always
 * shown; the written summary is advisory and may be absent — either because
 * narration is not configured, or because the model was unreachable. The panel
 * says which, rather than leaving a blank space.
 */
export function InsightsPanel({
  path, title = 'Insights', description,
}: {
  path: string;
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const { data, loading, error, reload } = useQuery<Insights>(open ? path : null, {}, [path]);

  if (!open) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <span className="flex min-w-0 flex-col">
            <span className="text-body-sm font-medium text-fg">{title}</span>
            <span className="truncate text-caption text-fg-muted">
              {description ?? 'Findings from attendance, tests and performance — with an advisory summary.'}
            </span>
          </span>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Generate</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <CardTitle>{title}</CardTitle>
            <span className="text-caption text-fg-muted">
              Advisory only — check anything you plan to act on.
            </span>
          </div>
          <Button size="sm" variant="ghost" onClick={reload} disabled={loading}>Refresh</Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        {error ? (
          <Alert tone="error" title="Couldn't generate insights">{error.message}</Alert>
        ) : loading || !data ? (
          <Skeleton className="h-32 rounded-lg" />
        ) : (
          <>
            {data.narrative ? (
              <div className="rounded-md border border-border bg-surface-secondary px-3.5 py-3">
                <p className="whitespace-pre-wrap text-body-sm text-fg">{data.narrative}</p>
                {data.narrativeModel && (
                  <p className="mt-2 text-caption text-fg-muted">Written by {data.narrativeModel}</p>
                )}
              </div>
            ) : (
              <Alert tone="info" title={data.narrationAvailable ? 'No written summary this time' : 'Written summaries are off'}>
                {data.narrationAvailable
                  ? 'The summary could not be generated just now. The findings below are unaffected.'
                  : 'Set ANTHROPIC_API_KEY to add a written summary. The findings below are computed from your data either way.'}
              </Alert>
            )}

            <ul className="flex flex-col gap-2.5">
              {data.findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 border-b border-border pb-2.5 last:border-0">
                  <Badge variant={SEVERITY_VARIANT[f.severity]}>{SEVERITY_LABEL[f.severity]}</Badge>
                  <span className="min-w-0 flex-1 text-body-sm text-fg-secondary">{f.detail}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
