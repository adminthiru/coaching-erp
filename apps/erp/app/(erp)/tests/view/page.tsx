'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, DataTable, Dropdown,
  EmptyState, ErrorState, MetricCard, PageHeader, Skeleton, Tabs, useToast, type Column,
} from '@acadia/ui';
import {
  ATTEMPT_STATUS_LABEL, TEST_SCOPE_LABEL, TEST_STATUS_LABEL,
  type AttemptStatus, type TestScope, type TestStatus,
} from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { ManageTestQuestionsDrawer } from '@/components/manage-test-questions-drawer';
import { StartAttemptDrawer } from '@/components/start-attempt-drawer';
import { RecordOfflineScoresDrawer } from '@/components/record-offline-scores-drawer';

interface TestDetail {
  id: string; title: string; code: string; description: string | null;
  scope: TestScope; mode: 'ONLINE' | 'OFFLINE'; status: TestStatus;
  totalMarks: number; durationMinutes: number; startAt: string; endAt: string;
  negativeMarking: boolean; shuffleQuestions: boolean; instantResults: boolean;
  resultsPublishedAt: string | null;
  course: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  branches: { id: string; name: string; code: string }[];
  batches: { id: string; name: string; code: string; branchId: string }[];
  questionCount: number; attemptCount: number;
}

interface PaperQuestion {
  id: string; sequence: number; marks: number; negativeMarks: number;
  question: { id: string; body: string; subject: { id: string; name: string; code: string } };
}

interface ResultsPayload {
  published: boolean;
  summary: { candidates: number; submitted: number; inProgress: number; average: number; highest: number; lowest: number };
  attempts: {
    id: string; status: AttemptStatus; score: number; maxScore: number; percentage: number | null;
    correctCount: number; wrongCount: number; unattemptedCount: number;
    batchRank: number | null; branchRank: number | null; organizationRank: number | null; percentile: number | null;
    student: { id: string; name: string; studentCode: string };
    branch: { id: string; name: string; code: string };
  }[];
}

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'questions', label: 'Paper' },
  { value: 'results', label: 'Results' },
];

/** Spec §52. Terminal states have no forward transition. */
const ALLOWED: Record<TestStatus, TestStatus[]> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['LIVE', 'DRAFT', 'CANCELLED'],
  LIVE: ['CLOSED', 'CANCELLED'],
  CLOSED: ['RESULTS_PUBLISHED', 'LIVE'],
  RESULTS_PUBLISHED: [],
  CANCELLED: [],
};

const ACTION_LABEL: Record<TestStatus, string> = {
  DRAFT: 'Move to draft',
  SCHEDULED: 'Schedule',
  LIVE: 'Go live',
  CLOSED: 'Close test',
  RESULTS_PUBLISHED: 'Publish results',
  CANCELLED: 'Cancel test',
};

const STATUS_VARIANT: Record<TestStatus, 'neutral' | 'info' | 'warning' | 'success' | 'error' | 'primary'> = {
  DRAFT: 'neutral',
  SCHEDULED: 'info',
  LIVE: 'warning',
  CLOSED: 'primary',
  RESULTS_PUBLISHED: 'success',
  CANCELLED: 'error',
};

const ATTEMPT_VARIANT: Record<AttemptStatus, 'neutral' | 'info' | 'warning' | 'success' | 'error'> = {
  IN_PROGRESS: 'info',
  SUBMITTED: 'warning',
  AUTO_SUBMITTED: 'warning',
  EVALUATED: 'success',
  ABANDONED: 'neutral',
};

export default function TestDetailPage() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useSession();

  const [tab, setTab] = React.useState('overview');
  const [managingQuestions, setManagingQuestions] = React.useState(false);
  const [startingAttempt, setStartingAttempt] = React.useState(false);
  const [recordingScores, setRecordingScores] = React.useState(false);
  const [confirm, setConfirm] = React.useState<TestStatus | null>(null);
  const [busy, setBusy] = React.useState(false);

  const { data: test, error, loading, reload } = useQuery<TestDetail>(`/tests/${id}`);
  const canManage = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN'].includes(user?.role ?? '');
  const canBuildPaper = ['ORG_OWNER', 'ORG_ADMIN', 'BRANCH_ADMIN', 'FACULTY'].includes(user?.role ?? '');

  async function changeStatus(status: TestStatus) {
    setBusy(true);
    try {
      await api(`/tests/${id}/status`, { method: 'POST', body: { status } });
      toast({
        kind: 'success',
        title: status === 'RESULTS_PUBLISHED' ? 'Results published' : 'Test updated',
        description: `${test?.title} is now ${TEST_STATUS_LABEL[status].toLowerCase()}.`,
      });
      setConfirm(null);
      reload();
    } catch (err) {
      toast({
        kind: 'error',
        title: 'Could not update the test',
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
          action={<Button variant="outline" onClick={() => router.push('/tests')}>Back to tests</Button>}
        />
      </div>
    );
  }

  if (loading || !test) {
    return (
      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const nextStatuses = ALLOWED[test.status];

  return (
    <>
      <PageHeader
        onBack={() => router.push('/tests')}
        breadcrumbs={[{ label: 'Assessment' }, { label: 'Tests', href: '/tests' }, { label: test.title }]}
        title={test.title}
        description={`${test.code} · ${TEST_SCOPE_LABEL[test.scope]} · ${test.durationMinutes} min · ${test.totalMarks} marks`}
        actions={
          <>
            <Badge variant={STATUS_VARIANT[test.status]}>{TEST_STATUS_LABEL[test.status]}</Badge>
            {canBuildPaper && ['DRAFT', 'SCHEDULED'].includes(test.status) && (
              <Button variant="outline" onClick={() => setManagingQuestions(true)}>
                {test.questionCount ? 'Edit paper' : 'Build paper'}
              </Button>
            )}
            {canManage && nextStatuses.length > 0 && (
              <Dropdown
                heading={test.title}
                trigger={<Button variant="outline">Actions</Button>}
                items={nextStatuses.map((s) => ({
                  label: ACTION_LABEL[s],
                  destructive: s === 'CANCELLED',
                  onSelect: () => setConfirm(s),
                }))}
              />
            )}
          </>
        }
        tabs={<Tabs value={tab} onChange={setTab} tabs={TABS} />}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {test.status === 'SCHEDULED' && test.questionCount === 0 && (
          <Alert tone="warning" title="No paper yet">
            Add questions before this test can go live.
          </Alert>
        )}

        {tab === 'overview' && (
          <div className="grid gap-3.5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Test details</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Code"><span className="font-mono">{test.code}</span></Field>
                <Field label="Mode">{test.mode === 'ONLINE' ? 'Online' : 'Offline'}</Field>
                <Field label="Reach">{TEST_SCOPE_LABEL[test.scope]}</Field>
                <Field label="Course">{test.course?.name ?? '—'}</Field>
                <Field label="Opens">{new Date(test.startAt).toLocaleString()}</Field>
                <Field label="Closes">{new Date(test.endAt).toLocaleString()}</Field>
                <Field label="Duration">{test.durationMinutes} minutes</Field>
                <Field label="Negative marking">{test.negativeMarking ? 'Enabled' : 'Off'}</Field>
                <Field label="Shuffle questions">{test.shuffleQuestions ? 'Yes' : 'No'}</Field>
                <Field label="Created by">{test.createdBy.name}</Field>
                {test.description && (
                  <div className="col-span-full flex flex-col gap-0.5">
                    <span className="text-caption text-fg-muted">Description</span>
                    <span className="text-body-sm text-fg">{test.description}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Reach</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div>
                  <span className="text-caption text-fg-muted">Branches</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {test.scope === 'ORGANIZATION' ? (
                      <Badge variant="primary">Every branch</Badge>
                    ) : test.branches.length === 0 ? (
                      <span className="text-body-sm text-fg-muted">—</span>
                    ) : (
                      test.branches.map((b) => <Badge key={b.id} variant="neutral">{b.code}</Badge>)
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-caption text-fg-muted">Batches</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {test.batches.length === 0 ? (
                      <span className="text-body-sm text-fg-muted">—</span>
                    ) : (
                      test.batches.map((b) => <Badge key={b.id} variant="neutral">{b.code}</Badge>)
                    )}
                  </div>
                </div>
                {test.mode === 'ONLINE' && test.status === 'LIVE' && (
                  <Button onClick={() => setStartingAttempt(true)}>Start an attempt</Button>
                )}
                {test.mode === 'OFFLINE' && canBuildPaper && ['LIVE', 'CLOSED'].includes(test.status) && (
                  <Button onClick={() => setRecordingScores(true)}>Record scores</Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'questions' && <QuestionsTab testId={test.id} />}

        {tab === 'results' && <ResultsTab testId={test.id} testStatus={test.status} />}
      </div>

      <ManageTestQuestionsDrawer
        open={managingQuestions}
        testId={test.id}
        onClose={() => setManagingQuestions(false)}
        onSaved={() => { setManagingQuestions(false); reload(); }}
      />

      <StartAttemptDrawer
        open={startingAttempt}
        testId={test.id}
        batches={test.batches}
        onClose={() => setStartingAttempt(false)}
        onStarted={(attemptId) => { setStartingAttempt(false); router.push(`/tests/attempt?test=${test.id}&id=${attemptId}`); }}
      />

      <RecordOfflineScoresDrawer
        open={recordingScores}
        testId={test.id}
        batches={test.batches}
        totalMarks={test.totalMarks}
        onClose={() => setRecordingScores(false)}
        onSaved={() => { setRecordingScores(false); reload(); }}
      />

      <ConfirmDialog
        open={confirm !== null}
        destructive={confirm === 'CANCELLED'}
        loading={busy}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && changeStatus(confirm)}
        title={confirm ? `${ACTION_LABEL[confirm]}?` : ''}
        description={
          confirm === 'CANCELLED'
            ? 'Any attempts already in progress are left as they are; nobody new can start this test.'
            : confirm === 'LIVE'
              ? 'Students can start their attempts as soon as the test opens.'
              : confirm === 'CLOSED'
                ? 'No further attempts can be started or submitted.'
                : confirm === 'RESULTS_PUBLISHED'
                  ? 'Ranks and percentiles are computed and become visible to every candidate. This cannot be undone.'
                  : 'This changes what students and staff see for this test.'
        }
        confirmLabel={confirm ? ACTION_LABEL[confirm] : 'Confirm'}
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

function QuestionsTab({ testId }: { testId: string }) {
  const { data, loading } = useQuery<PaperQuestion[]>(`/tests/${testId}/questions`);

  if (loading) return <Skeleton className="h-64 rounded-lg" />;

  if (!data?.length) {
    return (
      <Card>
        <CardContent>
          <EmptyState title="No questions yet" description="Build the paper from the question bank using the button above." />
        </CardContent>
      </Card>
    );
  }

  const totalMarks = data.reduce((sum, q) => sum + q.marks, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paper</CardTitle>
        <span className="text-caption text-fg-muted">{data.length} questions · {totalMarks} marks</span>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2.5">
          {data.map((q) => (
            <li key={q.id} className="flex items-start gap-3 border-b border-border pb-2.5 last:border-0">
              <span className="mt-0.5 shrink-0 font-mono text-caption text-fg-muted">{q.sequence + 1}</span>
              <span className="min-w-0 flex-1 text-body-sm text-fg">{q.question.body}</span>
              <span className="shrink-0 text-right">
                <Badge variant="neutral">{q.question.subject.code}</Badge>
                <div className="mt-1 font-mono text-caption text-fg-muted">
                  +{q.marks}{q.negativeMarks > 0 && <span className="text-error"> / −{q.negativeMarks}</span>}
                </div>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ResultsTab({ testId, testStatus }: { testId: string; testStatus: TestStatus }) {
  const { data, loading, error, reload } = useQuery<ResultsPayload>(`/tests/${testId}/results`);

  if (error) return <ErrorState title="Couldn't load results" description={error.message} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-64 rounded-lg" />;

  const columns: Column<ResultsPayload['attempts'][number]>[] = [
    {
      key: 'student',
      header: 'Student',
      mobile: 'primary',
      cell: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-body-sm text-fg">{r.student.name}</span>
          <span className="truncate text-caption text-fg-muted">
            <span className="font-mono">{r.student.studentCode}</span> · {r.branch.code}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'secondary',
      cell: (r) => <Badge variant={ATTEMPT_VARIANT[r.status]}>{ATTEMPT_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'score',
      header: 'Score',
      align: 'right',
      cell: (r) => (
        <span className="font-mono tabular-nums text-fg-secondary">
          {r.status === 'IN_PROGRESS' ? '—' : `${r.score} / ${r.maxScore}`}
        </span>
      ),
    },
    {
      key: 'correctCount',
      header: 'Correct / wrong / skipped',
      mobile: 'meta',
      align: 'right',
      cell: (r) =>
        r.status === 'IN_PROGRESS' ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <span className="font-mono tabular-nums text-caption text-fg-muted">
            {r.correctCount} / {r.wrongCount} / {r.unattemptedCount}
          </span>
        ),
    },
    {
      key: 'organizationRank',
      header: 'Rank (org / branch / batch)',
      align: 'right',
      cell: (r) =>
        r.organizationRank === null ? (
          <span className="text-fg-muted">{testStatus === 'RESULTS_PUBLISHED' ? '—' : 'Hidden until published'}</span>
        ) : (
          <span className="font-mono tabular-nums text-fg-secondary">
            #{r.organizationRank} / #{r.branchRank} / #{r.batchRank}
          </span>
        ),
    },
    {
      key: 'percentile',
      header: 'Percentile',
      align: 'right',
      cell: (r) => (
        <span className="font-mono tabular-nums text-fg-secondary">
          {r.percentile === null ? '—' : `${r.percentile.toFixed(2)}%`}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Candidates" value={String(data.summary.candidates)} description={`${data.summary.submitted} submitted`} />
        <MetricCard title="In progress" value={String(data.summary.inProgress)} description="still attempting" />
        <MetricCard title="Average score" value={data.summary.average.toFixed(1)} description="across submitted attempts" />
        <MetricCard title="Highest / lowest" value={`${data.summary.highest} / ${data.summary.lowest}`} description="score range" />
      </div>

      {!data.published && data.summary.submitted > 0 && (
        <Alert tone="info" title="Ranks are hidden">
          Ranks and percentiles appear here once the test is closed and results are published.
        </Alert>
      )}

      {data.attempts.length === 0 ? (
        <Card><CardContent><EmptyState title="No attempts yet" description="Nobody has started this test." /></CardContent></Card>
      ) : (
        <DataTable columns={columns} data={data.attempts} getRowId={(r) => r.id} />
      )}
    </div>
  );
}
