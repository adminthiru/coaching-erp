# Campus Engine (Coaching) — NEET & JEE Coaching Centre SaaS ERP

Multi-tenant, multi-branch SaaS platform for competitive-exam coaching centres.
Built phase by phase against the specification in
`NEET & JEE Coaching Centre SaaS ERP — Complete Multi-Branch Master Implementation Prompt.md`.

## Layout

```
apps/
├── api/           NestJS 11 + Fastify + Prisma 6 → PostgreSQL 18 (Neon)
├── super-admin/   Next.js 15 — Platform Super Admin Console  (port 3001)
└── erp/           Next.js 15 — tenant-facing ERP             (Phase 1)
packages/
├── ui/            Campus Engine UI — brand-blue (#1A56E8) design system, Plus Jakarta Sans
├── types/         shared domain enums, mirrored by Prisma
├── validation/    Zod schemas shared by API and browser
├── utils/         money, dates, quotas — framework-free
└── config/        shared tsconfig base
```

## Running it

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL and JWT secrets

npm run db:migrate            # apply migrations
npm run db:seed               # plans, platform owner, demo organizations

npm run dev:api               # http://localhost:4000/api
npm run dev:super-admin       # http://localhost:3001
npm run dev:erp               # http://localhost:3000
```

Seeded sign-ins (override with `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`):

| Where | Email | Sees |
|---|---|---|
| Platform console `:3001` | `owner@acadia.dev` | the whole platform |
| ERP `:3000` | `abc@example.com` | all ABC branches (ORG_OWNER) |
| ERP `:3000` | `chennai.admin@example.com` | Chennai only (BRANCH_ADMIN) |

All share the password `ChangeMe!2026`. Signing in as both ERP users is the
quickest way to see branch isolation working.

### Hosting the frontends as static sites

Both frontends build to plain files (`output: 'export'`) and call the API from
the browser, so any static host serves them — no Node server, no rewrite rules.
Only the API needs a Node host.

```bash
NEXT_PUBLIC_API_URL="https://api.example.com" npm run build -w @acadia/erp
NEXT_PUBLIC_API_URL="https://api.example.com" npm run build -w @acadia/super-admin
# upload apps/erp/out/ and apps/super-admin/out/ to their hosts
```

- `NEXT_PUBLIC_API_URL` is baked in at build time; rebuild to point elsewhere.
- Add the site's origin to the API's `CORS_ORIGINS`, or every request is blocked.
- Record pages take their id from the query string (`/students/view?id=…`,
  `/tests/attempt?test=…&id=…`, `/organizations/view?id=…`), never a dynamic segment — a static export
  cannot prerender ids that only exist in the database.
- `npm run start -w @acadia/erp` (or `-w @acadia/super-admin`) previews the built `out/` locally.

## Design system

One design system, used by both frontends. **Add to it — never fork it.**

- Cobalt primary, semantic tokens only. Never hardcode a hex; use `bg-surface`,
  `text-fg-muted`, `border-border-strong`.
- Status colour is fixed and semantic: settled = success, needs-action = warning,
  broken = error. Adding a status means choosing which of those it *is*
  (`STATUS_VARIANT` in `packages/ui/src/components/data-display/status-badge.tsx`).
- **Plus Jakarta Sans throughout — one typeface, no exceptions.** Loaded once by
  `@acadia/ui/fonts` and applied by each root layout as
  `className={fontVariables}` — never call `next/font` in an app.
  `font-mono` is **not** a monospace face any more: it marks *figures* (ids,
  money, percentages, dates), and columns stay aligned through
  `fontFeatureSettings: "tnum"` on that family rather than through a second
  font. The class name is kept because the role it marks is still real.
  `next/font` is a build-time transform, so that module exports the *loaded
  fonts*, not a config to spread; it is kept out of the package barrel so the
  loader is not pulled into every consumer of `@acadia/ui`.
  `tokens.css` maps `--font-jakarta` onto both `--font-sans` and `--font-mono`,
  which is what Tailwind's `font-sans` and `font-mono` read. To change the
  typeface, edit `fonts.ts` and the two lines in `tokens.css` — nothing in
  either app changes.
- Light and dark both ship: `<html data-theme="dark">` and nothing else changes.
- Need a component that does not exist? Add it to `packages/ui` first, export it
  from `src/index.ts`, then use it in the app.
- **Icons are HugeIcons** (`@hugeicons/react` + `@hugeicons/core-free-icons`,
  free set, MIT). Import them from `@acadia/ui`, never from the package
  directly — `packages/ui/src/components/icons.tsx` wraps each glyph as a named
  component with the house defaults (18px, 1.8 stroke, `currentColor`, so an
  icon tints with its nav item). Adding an icon means adding one line there.
  Only the icons actually imported are bundled; the shared chunk did not grow.
- **`MetricCard` is compact by design.** Value and delta share a row, and the
  delta pill renders *only* when a `delta` is passed — it used to print "— 0%"
  on every card in the app, filling a row to say nothing. Loading skeletons for
  a metric row are `h-[86px]`; keep them in step or the grid jumps on load.

### Creating things uses `<FormModal>`, not `<Drawer>`

Spec §7 lists right-side drawers for add and edit. In use that failed: a drawer
is a narrow full-height column, so longer forms clipped at the fold — the New
enquiry form cut off mid-field — and the eye travelled a long way between label
and control. **Every create/edit surface is now a centred `<FormModal>`.** This
is a deliberate departure from §7, made because the rule did not survive
contact with the real forms.

- **Header and footer are fixed; only the body scrolls.** The primary action can
  never be scrolled out of reach, which is the specific failure being fixed.
- **Size by content:** `sm` 420 · `md` 560 · `lg` 680 · `xl` 820. Most short
  forms are `md`; anything with two-column rows wants `lg`.
- **Long forms take `steps`.** Pass an array and the footer builds itself —
  Back / Next / submit, with a step rail across the top. Splitting is not
  decoration: it keeps each screen completable without scrolling and gives
  validation somewhere to happen before the final click.
- **`canContinue` gates a step; `canSubmit` gates the submit.** Keep the reason
  a submit is blocked in `canSubmit` alone, so it lives in one place.
- **Form-level warnings go in `banner`,** not inside a step — they must show on
  every step, not only the one that happened to contain them.
- Completed steps in the rail are clickable, steps ahead are not: jumping
  forward past validation is how half-filled records get created.
- On small screens it becomes a near-full-height sheet — a centred box with the
  keyboard open is unusable.

`<Drawer>` remains for the app shell's mobile navigation rail and any genuinely
peripheral panel. It is no longer the surface for creating anything.

## Architecture rules that are not negotiable

- **Money** is an integer count of the minor unit (paise). Never a float.
- **Nothing financial or historical is deleted.** Invoices are voided,
  organizations and branches are archived, subscription history is append-only.
- **Branch is a scope boundary, not a display field.** Every branch-scoped row
  carries `branchId`, and the API — never the frontend — enforces it.
- **Authorization is server-side.** `JwtAuthGuard` is global: a route is protected
  unless it opts out with `@Public()`. Sessions are checked against the database on
  every request, so revoking a device or deactivating a user takes effect at once.
- **Validation is shared.** One Zod schema per operation in `@acadia/validation`,
  used by the API to enforce and by the browser to show field errors early.

## Phase status

| Phase | Scope | State |
|---|---|---|
| 0 | Platform Super Admin Console | API complete; console covers dashboard, organizations, plans, audit logs |
| 1 | Organization + multi-branch foundation | complete — tenant auth, branch CRUD, branch admins, switcher, transfers, closure |
| 2 | Admissions + Students + Faculty + Batches | complete — pipeline, conversion, students, batches, enrolment, faculty assignment |
| 3 | Academics + Syllabus + Timetable | complete — chapter/topic tree, per-batch syllabus tracking, weekly timetable with conflict detection, generated classes, lesson plans |
| 4 | Attendance + Leave + Communication | complete — per-class rolls, four-level reports, leave with excused backfill, targeted announcements |
| 5 | Question Bank + Tests + Online Tests + Results | complete — bank, paper builder, online attempt engine (timer/autosave/reconnect/auto-submit, seeded shuffle), offline manual score entry, and ranked results |
| 6 | Performance Analytics + Cross-Branch Reports | complete — student and batch performance (trend, subject accuracy, top performers), cross-branch comparison, and a filterable test-performance report (§57) |
| 7 | Homework + Doubts + Study Materials + Student Portal | complete — homework (targeting, publish, roster, grading), study materials (organization-down-to-student visibility), doubt routing/resolution; the student-facing portal landed in Phase 9 |
| 8 | Fees + Payments + Scholarships + Expenses + Finance | complete — fee structures, student accounts with installments, concessions, receipts and refunds, branch/central expenses, and finance analytics |
| 9 | Parent Portal + Hostel + Transport + Mess | complete — parent/student portal (guardian links, child switching, portal-only confinement), hostels with bed allocation, transport routes/stops/riders, and mess plans |
| 10 | AI Intelligence + Security + Audit + Hardening | complete — advisory insights at student, batch and organization scope; audit, RBAC, rate limiting and isolation were built into each phase as it landed and are verified here |

Phase 0 API surface that has no screen yet: subscriptions, coupons, invoices,
payments, support tickets, feature flags, platform users. All are implemented,
tested and reachable — the console navigation lists only what has a screen, so
there are no dead links.

### Branch scoping (Phase 1)

The rule the whole tenant side rests on: **a branch-scoped user cannot escape
their branch, by any route.** `TenantAuthGuard` resolves identity and scope from
the database on every request, and `branchScope()` in
`apps/api/src/tenant/scope/tenant-context.ts` is the only way a service builds a
branch predicate — so a new module cannot forget the filter.

The `x-branch-id` header is a *request*, never an assertion. It is validated
against the caller's live assignments; a branch in another tenant answers 404 so
its existence does not leak, and a sibling branch the caller cannot reach answers
403.

Every Phase 2 module — students, batches, admissions — goes through the same
`branchScope()` predicate, so branch isolation held on all three without new
enforcement code.

### Records that are never destroyed

Beyond invoices and branches, Phase 2 adds history that outlives the thing it
describes:

- `StudentBranchHistory` — the trail of every branch a student has belonged to
  (spec §75). Historical attendance, fees and results stay attributed to the
  branch that held them; only *future* records follow a transfer.
- `BatchStudent` — enrolment as a relationship with a lifetime, so leaving a
  batch preserves the term that was already studied.
- `EnquiryActivity` — every call, counselling session and stage change on an
  enquiry, which is what makes the admissions pipeline explainable.

An enquiry can only reach ADMITTED through the conversion endpoint, so "admitted
with no student" is not a reachable state.

### Timetable conflicts (Phase 3)

Spec §46 requires four clash types, all enforced server-side before a slot is
written (`apps/api/src/tenant/timetable/conflicts.service.ts`):

| Kind | Checked against |
|---|---|
| `BATCH` | the same batch, already in class |
| `FACULTY` | the same teacher, at this branch |
| `FACULTY_CROSS_BRANCH` | the same teacher, at **any** branch |
| `ROOM` | the same room |

Two details that decide whether the feature is usable:

- **Times are minutes from midnight**, not a `TIME` column. A weekly grid has no
  date to anchor a timezone to, and integer overlap maths is exact.
- **Overlap is half-open** (`aStart < bEnd && bStart < aEnd`). A class ending at
  10:00 does not clash with one starting at 10:00 — closed intervals would flag
  every back-to-back period in the school.

Faculty is checked across the whole organization, deliberately ignoring branch
scope: a teacher who works at two branches cannot be in both at once, and that is
exactly the clash a branch-local check would miss.

Two slots may share a weekday and hour if their **effective date windows are
disjoint** — this term's timetable does not block next term's.

### Attendance arithmetic (Phase 4)

Attendance hangs off a `ClassSession`, not a bare date: the timetable already
says which class happened, so a student who attends Physics but skips Chemistry
on the same day is recorded accurately.

Each status carries a weight (`ATTENDANCE_WEIGHT` in `@acadia/types`):

| Status | Counts as | In the denominator? |
|---|---|---|
| Present, Late | 1 | yes |
| Half day | 0.5 | yes |
| Absent | 0 | yes |
| **Excused** | — | **no** |

Excused absence is dropped from *both* sides: authorised leave should neither
reward nor penalise. The consequence is that a percentage can be **undefined**,
not zero — a student on approved leave all term has nothing to score. The API
returns `percent: null` for that case and the UI renders "—"; reporting them at
0% would say the exact opposite of what excluding Excused is for. Rows with no
countable data always sort last, so "no data" never heads a needs-attention list.

Approving leave backfills any `ABSENT` rows in the covered range to `EXCUSED`,
which is the point of requesting leave in advance. A recorded `PRESENT` is left
alone.

### Tests & the online engine (Phase 5)

The paper, the exam room and the result sheet exist end to end:

- `/questions` — the bank, with duplicate/retire and organization-wide vs
  branch-specific libraries (spec §51).
- `/tests` and `/tests/view?id=…` — paper builder (`ManageTestQuestionsDrawer`),
  status lifecycle (`DRAFT → SCHEDULED → LIVE → CLOSED → RESULTS_PUBLISHED`),
  and a results tab reading the ranked sheet from `tests.service.ts#results`.
- `/tests/attempt?test=…&id=…` — the exam room a staff member opens after
  starting an attempt for a student (`StartAttemptDrawer`). Countdown, debounced
  autosave, and submit all talk to the same server-enforced deadline described
  above; reloading mid-exam resumes cleanly because `GET /attempts/:id` is
  idempotent.

Two mechanics worth knowing about:

- **`mode: OFFLINE` tests are scored manually**, not by the attempt engine —
  `TestsService#recordOfflineScores` upserts a `TestAttempt` per student directly
  from a score a staff member enters (`RecordOfflineScoresDrawer`), gated to
  `LIVE`/`CLOSED` tests so entry is blocked once results are published, matching
  how a live online attempt is locked the moment it's submitted.
- **`shuffleQuestions` is seeded on the attempt, not randomised per request** —
  `attempts.service.ts#resume` shuffles with a PRNG seeded from the attempt id
  (FNV-1a → mulberry32), so a student who refreshes mid-exam keeps seeing the
  same order, while two students on the same paper see different ones.

What is deliberately not built yet:

- **No student self-service login.** `STUDENT` is a valid `OrgRole` and the
  attempt-answer/submit endpoints already accept it, but the ERP has no student
  portal — today a staff member starts the attempt for the student from the test
  detail page, which fits an exam-hall/lab setup but not take-home tests.

### Performance analytics & cross-branch comparison (Phase 6)

`AnalyticsService` (`apps/api/src/tenant/analytics/`) computes performance from
the `TestAttempt`/`TestAnswer` rows Phase 5 produces — nothing here is stored
redundantly, it's aggregated on read:

- `GET /analytics/students/:id` — a student's score trend (last 3 attempts vs.
  everything before them — fewer than that and "improving" isn't a claim the
  data can support), per-subject accuracy, and the full test timeline. Surfaced
  as the student detail page's **Performance** tab.
- `GET /analytics/batches/:id` — the same shape at batch scope, plus a
  top-performers list. Surfaced as the batch detail page's **Performance** tab.
  Scoped to tests actually assigned to the batch, so a student who has since
  transferred out doesn't pull an unrelated paper's score in.
- `TenantDashboardService#branchComparison` (spec §56) now returns real
  numbers — active students, 30-day attendance rate (reusing
  `AttendanceService#report`, not a second implementation of the same
  arithmetic), average test score, and admission conversion — rendered as a
  table on the "All branches" dashboard view, org-level roles only.

Two items spec §56 lists that are **not** in the comparison: fee collection
(Phase 8 hasn't landed) and faculty performance (no data source exists to
define it against). Every other figure on the table is real; there is no
placeholder standing in for either of these.

`GET /analytics/tests` (spec §57) is the general report: score trend by test,
branch-by-branch comparison, and subject accuracy, all over a date range —
with an explicit `branchId` filter an org-level user can set independently of
whatever branch the switcher happens to be on (the "Branch: All ▼ / Chennai /
Salem" pattern the spec shows). It's the `/reports` page in the ERP nav.

### Homework, study materials & doubts (Phase 7)

No student portal exists yet — every screen in this phase is staff-facing, the
same constraint that already shaped the online-test attempt engine (Phase 5)
and offline score entry:

- **Homework** (`apps/api/src/tenant/homework/`) — targets a batch, one or more
  branches, or named students (spec §58), the same audience/target-join shape
  `Announcement` uses (spec §49), plus the per-student tier a notice has no
  need for. `DRAFT → PUBLISHED` locks the targeting and creates a
  `HomeworkSubmission` row per reached student in one transaction — "who owes
  this" is then a query, not a re-derived join. Marking mirrors how Attendance
  is taken: staff records `PENDING`/`SUBMITTED`/`LATE` and an optional grade,
  since there's no student-submitted file to receive yet.
- **Study materials** (`apps/api/src/tenant/materials/`) — the same audience
  shape, plus an `ORGANIZATION` tier (org-level roles only), matching spec
  §60's "organization-wide down to a named student" scope. `fileUrl` is a
  pasted link, not a real upload — see the file-upload note below.
- **Doubts** (`apps/api/src/tenant/doubts/`) — spec §59's three routing tiers
  are one nullable column: `assignedToId` set to a specific `OrgUser` is tier
  2 (assigned faculty); `null` is tier 1/3 (branch faculty or the org pool —
  indistinguishable without a claim step, which isn't built). Creating a
  doubt auto-suggests tier 2 by looking up `BatchFaculty` for the student's
  current batch + the doubt's subject; a caller can still name someone
  explicitly. Resolution is a reply thread (`DoubtMessage`, shaped like
  `TicketNote`) rather than a single answer field, because a doubt is rarely
  settled in one message.

**No file-upload backend exists.** `StudyMaterial.fileUrl` and
`Homework.attachmentUrl` are plain links, following the exact precedent
`Organization.logoUrl` and `Student.photoUrl` already set — there is no
multipart endpoint, no storage client, nothing to plug into. `packages/ui`'s
`FileUpload` component is a picker with nowhere to send what it picks; it is
not wired into either drawer.

**No student portal** *(resolved in Phase 9 — see below)*. Every Phase 7 screen
is still something staff operates on a student's behalf; what Phase 9 adds is a
read-only portal, not student-submitted homework.

### Fees, payments & expenses (Phase 8)

Every amount is an integer count of paise, per the money rule above. The
arithmetic decisions that actually matter:

- **A fee structure is a template, not a charge.** Assigning one to a student
  *copies* its numbers onto a `StudentFee` (`apps/api/src/tenant/fees/`). Reading
  through a live relation instead would mean editing a structure silently
  restated what every existing student already owed.
- **`paidMinor` is maintained transactionally, not aggregated on read** — the
  same approach the platform's own `Invoice.amountPaidMinor` takes — so
  "who owes money" is an indexed status query rather than a sum over payments.
- **Payments allocate oldest-due-first across installments; refunds unwind
  newest-settled-first.** A part payment should clear the most overdue money,
  and a reversal should undo the most recent thing it touched. Both are covered
  by the same `allocate`/`deallocate` pair, so they cannot drift apart.
- **Overpayment is refused, not held.** A credit balance is a feature this
  product does not have, and silently keeping the excess would misreport
  collections.
- **Scholarships and discounts are one model** (`FeeConcession`) with a `kind`.
  They do the same thing to the arithmetic; the kind records *why*, which is
  what a finance report needs to separate. Concessions are append-only — the
  trail of who reduced a fee and why survives (spec §72).
- **Money received is never deleted.** A mistake is corrected by a `FeeRefund`
  row alongside the original receipt, which is what a paper receipt book does.

Two counting rules in the finance report (spec §64) that would misreport a
branch if ignored, and are stated on the page itself so nobody has to guess:

- **Collections are net of refunds** — refunded money was never earned.
- **Outstanding is not date-filtered.** A debt does not belong to the month it
  was raised in; windowing it would quietly shrink the number every time
  someone narrowed the range.
- **Central organization costs (`Expense.branchId: null`) are never divided
  across branches.** Any split would be invented, and netting head-office spend
  against one branch would defame it. They are reported separately and only to
  organization-level roles.

This phase also closes the fee-collection gap left in Phase 6's branch
comparison (spec §56). Faculty performance remains the one item on that list
still absent — it has no agreed definition and no data source, so it is missing
rather than approximated.

### Parent & student portal (Phase 9)

Spec §65. A parent is an `OrgUser` with role `PARENT`, joined to students
through `Guardian` — many-to-many on purpose, because the spec's own example
has one parent with children at *different branches*, which no single
`branchId` could express. A student's own login is `Student.portalUserId`.

The security rule this rests on: **a portal role is confined by URL prefix, in
the guard.**

```
PARENT / STUDENT  →  /api/tenant/portal/*  and  /api/tenant/auth/*   — nothing else
```

Enforcing it per-controller would not have held. Most staff *read* routes carry
no `@OrgRoles` at all, so a parent who reached `/students` would have listed
every child at their branch. Deciding it in `TenantAuthGuard`
(`route-scope.ts#isPortalRoute`) means a new staff module is closed to portal
roles without doing anything, because it never opts in.

Scope then comes from *students*, not branches:

- `TenantContext.portalStudentIds` is resolved from the database on every
  request, so revoking a guardian link takes effect at once rather than at
  token expiry.
- `portalStudentScope()` **throws** when it is unset rather than returning an
  empty filter — a bug that lost the scope must fail closed, not silently widen
  to a whole branch. This is also what stops an `ORG_OWNER` (who bypasses every
  role decorator) from reading the portal.
- Asking for another family's child answers `NOT_FOUND`, not `FORBIDDEN`.
  Whether some other student is enrolled here is not a parent's to learn.
- Portal queries are written separately rather than reusing staff services. A
  parent's branch scope necessarily contains their child's branch, so
  `attendance.report(ctx)` would have handed them the whole branch's register.

Verified end to end against a running server: a parent sees exactly their one
child, is refused another family's student, and is refused `/students`,
`/batches`, `/fees`, `/expenses`, `/tests`, `/analytics/finance` and
`/dashboard/summary` with `PORTAL_ONLY` — while staff access is unchanged.

The portal is **read-only**: attendance, published results, homework and its
marking, fees with receipts, materials and notices. Only *published* results
appear, the same gate the staff sheet applies (spec §54). Paying online is not
built — there is no payment gateway in this product.

### Hostel, transport & mess (Phase 9)

All three follow the conventions the rest of the codebase already set, rather
than inventing new ones:

- **A null `branchId` means centralised** — one hostel, vehicle, route or mess
  plan serving every branch, exactly as fee structures and expenses already
  read. A branch-specific one only accepts that branch's students, checked
  server-side on every allocation.
- **Allocations are stays, not flags.** Ending one keeps the row with
  `status: ENDED`, so "who was in room 204 last term" survives — the same rule
  `BatchStudent` follows. One `AllocationStatus` is shared by all three
  services because the lifecycle is genuinely identical; three near-copies
  would have drifted.
- **`HostelRoom.occupied` moves inside the same transaction as the
  allocation**, for the reason `StudentFee.paidMinor` does: "which rooms have a
  bed free" is asked constantly, and a check separated from its increment can
  oversell a full room to two clerks at once.
- **`RouteStop.pickupMinute` is minutes from midnight**, as timetable slots
  are: a recurring daily pickup has no date to anchor a timezone to.

Three judgement calls worth naming:

- **Drivers are fields on `Vehicle`, not `OrgUser` records.** They do not sign
  in, and inventing staff accounts for them would put people in the staff
  directory who never use it.
- **Seats come from the assigned vehicle**, so a route with no vehicle has *no
  limit yet* rather than a limit of zero — the alternative would block every
  allocation on a route that is still being set up.
- **Mess is deliberately minimal.** Spec §68 is a single line; a plan priced
  per month and who is on it is the least that is actually operable. Menus and
  per-meal attendance would be invention, not implementation.

Verified against a running server: allocating decrements the free-bed count,
re-allocating a student is refused (`ALREADY_ALLOCATED`), a full room is
refused (`ROOM_FULL`), ending a stay frees the bed for reuse, ending it twice
is refused (`NOT_ACTIVE`), and the ended stay remains readable as history.

### AI insights (Phase 10, spec §§69–71)

**The model never computes a number.** Every finding on an insight page is
arithmetic over real rows in `InsightsService` — attendance weighted the same
way the attendance report weights it, subject accuracy over answered questions,
score trends, branch gaps. Claude receives those already-true findings and is
asked only to write two to four sentences about what they suggest
(`NarrationService`). An LLM asked to *derive* "attendance is 68%" can be wrong
in a way nobody catches, and §71 is explicit that AI output is advisory.

Consequences of that split, all deliberate:

- **`ANTHROPIC_API_KEY` is optional.** Unset, the endpoints return the same
  findings with `narrative: null` and `narrationAvailable: false`, and the UI
  says the summary is switched off rather than leaving a gap. Insight quality
  does not depend on the key; only prose does.
- **A narration failure is never an endpoint failure.** Rate limits, outages
  and safety declines are caught and logged; the findings still render.
- **The prompt forbids new numbers** — the model is told the findings are
  correct, must not restate or recompute them, and should say the data is thin
  when it is rather than inventing concern.
- Findings carry a severity (`info` / `watch` / `concern`) computed from
  thresholds, so the UI can rank them without asking the model to.
- Thin data is labelled: a subject with under 15 answered questions is reported
  as context, not as a weakness.

Model and API shape: `claude-opus-5` with adaptive thinking at `low` effort —
the analysis was already done in SQL, so this is a short writing task. Both are
configurable via `ANTHROPIC_MODEL`.

**Not verified against the live API.** The request shape is type-checked
against `@anthropic-ai/sdk` 0.120.0 and the no-key path is tested end to end,
but no real Claude call has been made — that bills the account holder, and no
key was configured. Set one and exercise `/insights/students/:id` before
relying on the narration path.

### Security & audit (spec §§72–73)

These were not a final pass — each phase carried them as it landed, so this is
what is in place rather than what was added:

| §73 requirement | Where |
|---|---|
| Authentication | `JwtAuthGuard` (platform) / `TenantAuthGuard` (tenant), both global |
| Authorization, RBAC | `@OrgRoles` + `RolesGuard`; portal roles confined by URL prefix |
| Tenant isolation | `organizationId` on every tenant query |
| Branch isolation | `branchScope()` — the only way a service builds a branch predicate |
| Input validation | Zod schemas in `@acadia/validation`, shared with the browser |
| Rate limiting | `ThrottlerModule` globally (`RATE_LIMIT_PER_MINUTE`, default 300/min/IP); auth routes capped at 5–30/min via `@Throttle` |
| Secure headers | `@fastify/helmet` in `main.ts` |
| CORS | Explicit origin allow-list from `CORS_ORIGINS` |
| Secure sessions | Sessions checked against the database on every request — revoking a device takes effect immediately |
| Audit logging | 91 distinct audited actions, including every item §72 names — see the note below |
| File validation | **N/A — there is no upload endpoint.** Attachments are links (see Phase 7) |

Spec §72 asks for organization and branch actions, student and faculty
transfers, permission changes, fee changes, result publication, super-admin
actions and subscription actions. All are recorded — `student.transfer`,
`staff.transfer`, `platform_user.change_role`, `organization.feature_access`,
`fee.concession`, `test.publish_results`, `subscription.cancel` among them.

**`AuditLog.actorId` is intentionally not a foreign key.** It previously
referenced `PlatformUser`, which meant every *tenant* audit write — an OrgUser
id — violated the constraint. `AuditService.record` swallows write failures by
design (an audit failure must never fail the payment it is recording), so this
lost every tenant audit row silently from Phase 1 until it was found by reading
the API log while the servers were running: 15 rows existed, all `PLATFORM`,
none `ORG`. The constraint is now dropped and `actorType` discriminates which
table `actorId` points at. Counting `audit.record` call sites is not evidence
that rows land — query `actorType` if you need to be sure.

## A note on database latency — resolved

This checkout previously pointed at a Neon instance in **us-east-1**, where a
bare `SELECT 1` from India measured ~2.3s and multi-query endpoints felt slow
no matter how the code was written. It now points at **ap-southeast-1
(Singapore)**.

Measured on the switch, same machine, same code:

| | `SELECT 1` round trip |
|---|---|
| us-east-1 | ~3.4s |
| ap-southeast-1 | ~0.3s |

Live endpoints after the move — all sub-second, where several were multi-second
before:

| Endpoint | |
|---|---|
| `/tenant/analytics/finance` | ~410 ms |
| `/tenant/students` | ~545 ms |
| `/tenant/batches` | ~641 ms |
| `/tenant/dashboard/summary` | ~804 ms |

This was a region choice, not an optimisation, and it remains the largest
single performance change available to this product. **ap-south-1 (Mumbai)**
would be marginally closer again for Indian users if Neon offers it on your
plan; Singapore already captures most of the win.

The old instance's data was **not** migrated — the new database was migrated
and seeded fresh. The previous URL is retained (commented) in `.env` for
rollback.

## Database

PostgreSQL 18 on Neon. 84 tables, 51 enums. Migrations live in
`apps/api/prisma/migrations` and are the only way schema changes reach an
environment (`npm run db:migrate`).

`.env` is gitignored and holds live credentials — never commit it.
