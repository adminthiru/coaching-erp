'use client';

import * as React from 'react';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorState,
  FormRow, FormSection, Input, PageHeader, Segmented, Skeleton, UsageMeter, useToast,
} from '@acadia/ui';
import { LIMIT_LABEL, TARGET_EXAM_LABEL, type LimitKey, type TargetExam } from '@acadia/types';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface OrgProfile {
  id: string; name: string; slug: string; status: string;
  logoUrl: string | null; website: string | null; email: string | null; phone: string | null;
  addressLine: string | null; city: string | null; state: string | null;
  country: string | null; pincode: string | null; timezone: string | null;
  ownerName: string | null; ownerEmail: string | null;
  trialEndsAt: string | null; createdAt: string;
  plan: { name: string | null; features: string[] };
  usage: { key: LimitKey; used: number; limit: number | null; unlimited: boolean; pct: number; exceeded: boolean; nearLimit: boolean; overridden: boolean }[];
}

interface Course { id: string; name: string; code: string; targetExam: TargetExam; durationMonths: number; isActive: boolean }
interface Subject { id: string; name: string; code: string }
interface Year { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }

const TABS = [
  { value: 'organization', label: 'Organization' },
  { value: 'academic', label: 'Academic' },
  { value: 'plan', label: 'Plan & usage' },
];

/**
 * Spec §26 (organization profile) and §42 (academic structure).
 *
 * Only what the API actually supports is editable here: the profile has a PATCH,
 * courses/subjects/academic years can be listed and created. Anything without an
 * endpoint is shown read-only rather than as a control that would fail.
 */
export default function SettingsPage() {
  const { user } = useSession();
  const [tab, setTab] = React.useState('organization');

  // Spec §31 — organization settings belong to organization-level roles.
  const canEdit = ['ORG_OWNER', 'ORG_ADMIN'].includes(user?.role ?? '');

  const org = useQuery<OrgProfile>('/organization');

  if (org.error) {
    return (
      <div className="px-5 py-5 lg:px-6">
        <ErrorState title="Couldn't load settings" description={org.error.message} onRetry={org.reload} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Organization' }, { label: 'Settings' }]}
        title="Settings"
        description="Your organization's profile, academic structure and plan."
        tabs={<Segmented options={TABS} value={tab} onChange={setTab} aria-label="Settings section" />}
      />

      <div className="flex flex-col gap-3.5 px-5 py-5 lg:px-6">
        {!canEdit && (
          <Alert tone="info" title="Read-only">
            Only an organization owner or admin can change these settings.
          </Alert>
        )}

        {org.loading || !org.data ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : tab === 'organization' ? (
          <OrganizationTab org={org.data} canEdit={canEdit} onSaved={org.reload} />
        ) : tab === 'academic' ? (
          <AcademicTab canEdit={canEdit} />
        ) : (
          <PlanTab org={org.data} />
        )}
      </div>
    </>
  );
}

/** Spec §26 — the organization profile. */
function OrganizationTab({ org, canEdit, onSaved }: { org: OrgProfile; canEdit: boolean; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = React.useState({
    name: org.name, website: org.website ?? '', email: org.email ?? '', phone: org.phone ?? '',
    addressLine: org.addressLine ?? '', city: org.city ?? '', state: org.state ?? '',
    country: org.country ?? '', pincode: org.pincode ?? '', timezone: org.timezone ?? '',
    logoUrl: org.logoUrl ?? '',
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Only send what changed — the schema is all-optional, so a partial PATCH is
  // exactly what it expects.
  const dirty = Object.entries(form).some(([k, v]) => (org[k as keyof OrgProfile] ?? '') !== v);

  async function save() {
    setBusy(true); setErrors({}); setFormError(null);
    try {
      await api('/organization', {
        method: 'PATCH',
        body: Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || undefined])),
      });
      toast({ kind: 'success', title: 'Settings saved', description: 'Your organization profile is updated.' });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) setFormError(err.message);
      } else setFormError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization profile</CardTitle>
        <span className="text-caption text-fg-muted">
          <span className="font-mono">{org.slug}</span> · created {org.createdAt.slice(0, 10)}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {formError && <Alert tone="error">{formError}</Alert>}

        <FormSection title="Identity">
          <FormRow>
            <Input label="Organization name" required value={form.name} onChange={set('name')} error={errors.name} disabled={!canEdit} />
            <Input label="Website" value={form.website} onChange={set('website')} error={errors.website} disabled={!canEdit} placeholder="https://…" />
          </FormRow>
          <FormRow>
            <Input label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} disabled={!canEdit} />
            <Input label="Phone" value={form.phone} onChange={set('phone')} error={errors.phone} disabled={!canEdit} />
          </FormRow>
          <Input label="Logo URL" value={form.logoUrl} onChange={set('logoUrl')} error={errors.logoUrl} disabled={!canEdit} helperText="A link — there is no file upload yet." />
        </FormSection>

        <FormSection title="Address">
          <Input label="Address" value={form.addressLine} onChange={set('addressLine')} error={errors.addressLine} disabled={!canEdit} />
          <FormRow>
            <Input label="City" value={form.city} onChange={set('city')} error={errors.city} disabled={!canEdit} />
            <Input label="State" value={form.state} onChange={set('state')} error={errors.state} disabled={!canEdit} />
          </FormRow>
          <FormRow>
            <Input label="Country" value={form.country} onChange={set('country')} error={errors.country} disabled={!canEdit} />
            <Input label="Pincode" value={form.pincode} onChange={set('pincode')} error={errors.pincode} disabled={!canEdit} />
          </FormRow>
          <Input
            label="Timezone"
            value={form.timezone}
            onChange={set('timezone')}
            error={errors.timezone}
            disabled={!canEdit}
            helperText="Branches may sit in different timezones; this is the organization default."
          />
        </FormSection>

        <FormSection title="Owner">
          <FormRow>
            <Input label="Owner" value={org.ownerName ?? '—'} disabled helperText="Changed by the platform team." />
            <Input label="Owner email" value={org.ownerEmail ?? '—'} disabled />
          </FormRow>
        </FormSection>

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={save} loading={busy} disabled={!dirty}>
              {dirty ? 'Save changes' : 'Saved'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Spec §42 — the academic structure batches are built from. */
function AcademicTab({ canEdit }: { canEdit: boolean }) {
  const courses = useQuery<Course[]>('/courses');
  const subjects = useQuery<Subject[]>('/subjects');
  const years = useQuery<Year[]>('/academic-years');

  return (
    <div className="grid gap-3.5 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Courses</CardTitle>
          <span className="text-caption text-fg-muted">A batch runs one course.</span>
        </CardHeader>
        <CardContent>
          {courses.loading ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : !courses.data?.length ? (
            <EmptyState title="No courses" description="Create a course before adding batches." />
          ) : (
            <ul className="flex flex-col gap-2">
              {courses.data.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body-sm text-fg">{c.name}</span>
                    <span className="truncate text-caption text-fg-muted">
                      <span className="font-mono">{c.code}</span> · {c.durationMonths} months
                    </span>
                  </span>
                  <Badge variant="neutral">{TARGET_EXAM_LABEL[c.targetExam] ?? c.targetExam}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subjects</CardTitle>
          <span className="text-caption text-fg-muted">Used by the timetable and question bank.</span>
        </CardHeader>
        <CardContent>
          {subjects.loading ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : !subjects.data?.length ? (
            <EmptyState title="No subjects" description="Subjects group questions and classes." />
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {subjects.data.map((s) => (
                <Badge key={s.id} variant="neutral">{s.name}</Badge>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Academic years</CardTitle>
          <span className="text-caption text-fg-muted">Batches belong to one year.</span>
        </CardHeader>
        <CardContent>
          {years.loading ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : !years.data?.length ? (
            <EmptyState title="No academic years" description="Add a year before creating batches." />
          ) : (
            <ul className="flex flex-col gap-2">
              {years.data.map((y) => (
                <li key={y.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body-sm text-fg">{y.name}</span>
                    <span className="text-caption text-fg-muted">
                      {y.startDate.slice(0, 10)} → {y.endDate.slice(0, 10)}
                    </span>
                  </span>
                  {y.isCurrent && <Badge variant="primary">Current</Badge>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <Alert tone="info" title="Adding to the academic structure" className="lg:col-span-3">
          Courses, subjects and academic years are created through the API today; a form for each is not built yet.
          Batches, the timetable and the question bank all read from what is listed above.
        </Alert>
      )}
    </div>
  );
}

/** Spec §16 — the plan's limits and how much of each is used. */
function PlanTab({ org }: { org: OrgProfile }) {
  const trialDaysLeft = org.trialEndsAt
    ? Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 864e5)
    : null;

  return (
    <div className="grid gap-3.5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Usage against your plan</CardTitle>
          <span className="text-caption text-fg-muted">
            Creating past a limit is blocked — the plan is changed by the platform team.
          </span>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {org.usage.map((u) => (
            <UsageMeter
              key={u.key}
              label={LIMIT_LABEL[u.key] ?? u.key}
              used={u.used}
              limit={u.limit}
              hint={
                u.overridden
                  ? 'Raised for your organization by the platform team.'
                  : u.exceeded
                    ? 'Limit reached — contact your account manager to upgrade.'
                    : undefined
              }
            />
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3.5">
        <Card>
          <CardHeader><CardTitle>Plan</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="text-body-sm text-fg-secondary">Current plan</span>
              <span className="text-body-sm font-semibold text-fg">{org.plan.name ?? 'None'}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-body-sm text-fg-secondary">Status</span>
              <Badge variant={org.status === 'ACTIVE' ? 'success' : org.status === 'TRIAL' ? 'info' : 'warning'}>
                {org.status.replace(/_/g, ' ').toLowerCase()}
              </Badge>
            </div>
            {trialDaysLeft !== null && (
              <Alert tone={trialDaysLeft <= 3 ? 'warning' : 'info'}>
                {trialDaysLeft <= 0
                  ? 'Your trial has ended.'
                  : `Trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'}.`}
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Features</CardTitle>
            <span className="text-caption text-fg-muted">What your plan entitles you to.</span>
          </CardHeader>
          <CardContent>
            {org.plan.features.length === 0 ? (
              <p className="text-body-sm text-fg-muted">No features listed on this plan.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {org.plan.features.map((f) => (
                  <Badge key={f} variant="neutral">{f.replace(/_/g, ' ')}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
