# NEET & JEE COACHING CENTRE SaaS ERP
## Complete Production-Ready Multi-Tenant + Multi-Branch Product Specification

Build a **production-ready, scalable, multi-tenant, multi-branch SaaS platform and Coaching Centre ERP** specifically designed for:

- NEET coaching centres
- JEE coaching centres
- NEET + JEE integrated institutes
- Foundation coaching
- Competitive exam coaching
- Entrance exam institutes
- Residential coaching centres
- Single-branch and multi-branch coaching organizations

The platform must support an organization operating:

- One branch
- Multiple branches in the same city
- Branches across different cities
- Branches across different states
- Potentially branches across different countries/timezones in the future

Example:

```text
Platform
│
└── ABC NEET & JEE Academy
    │
    ├── Chennai Branch
    │   ├── Branch Admin
    │   ├── Faculty
    │   ├── Counsellors
    │   ├── Students
    │   └── Batches
    │
    ├── Salem Branch
    │   ├── Branch Admin
    │   ├── Faculty
    │   ├── Students
    │   └── Batches
    │
    └── Bangalore Branch
        ├── Branch Admin
        ├── Faculty
        ├── Students
        └── Batches
```

The system must NOT be designed as a generic school ERP.

The core focus is:

- Coaching operations
- Multi-branch management
- Admissions
- Students
- Batches
- Academic planning
- Faculty
- Timetable
- Attendance
- Tests
- Question bank
- Online examinations
- Results
- Ranking
- Percentile
- Performance analytics
- Homework
- Doubt management
- Study materials
- Fees
- Finance
- Communication
- Parent portal
- Student portal
- AI-powered academic intelligence

The product also contains a completely separate **Platform Super Admin Console** for the SaaS owner.

---

# 1. TECHNOLOGY STACK

## Frontend

Use:

- Next.js
- TypeScript
- Tailwind CSS

Create a modern component-based responsive application.

Recommended structure:

```text
apps/
├── super-admin/
│   └── Next.js
│
├── erp/
│   └── Next.js
│
└── api/
    └── NestJS + Fastify
```

Shared packages may contain:

```text
packages/
├── ui/
├── types/
├── config/
├── utils/
└── validation/
```

Keep Super Admin and ERP as separate applications/interfaces even if they share a monorepo.

---

# 2. BACKEND

Use:

- NestJS
- Fastify Adapter
- TypeScript
- REST APIs

DO NOT use Express.

Use modular NestJS architecture.

Each module should have:

- Controller
- Service
- DTO
- Validation
- Authorization
- Database/repository access
- Error handling
- Logging where appropriate

Keep controllers thin.

Business logic belongs in services/domain logic.

---

# 3. DATABASE

Use:

**PostgreSQL 18**

Hosted on:

**Neon Cloud**

Use:

```env
DATABASE_URL="PASTE_NEON_DATABASE_URL_HERE"
```

Do not hardcode credentials.

Use:

- Primary keys
- Foreign keys
- Unique constraints
- Indexes
- Transactions
- Referential integrity
- Created timestamps
- Updated timestamps
- Soft deletion/archive where appropriate
- Audit fields

---

# 4. CORE ARCHITECTURE

The entire system must follow this hierarchy:

```text
SAAS PLATFORM
│
├── SUPER ADMIN CONSOLE
│
└── ORGANIZATION / TENANT
    │
    ├── ORGANIZATION ADMIN
    │
    ├── BRANCH 1
    │   ├── BRANCH ADMIN
    │   ├── FACULTY
    │   ├── COUNSELLORS
    │   ├── ACCOUNTANTS
    │   ├── STUDENTS
    │   └── BATCHES
    │
    ├── BRANCH 2
    │   └── ...
    │
    └── BRANCH N
        └── ...
```

This hierarchy is fundamental.

Do NOT treat branch as merely a display field.

Branch-level access must be enforced throughout the backend.

---

# 5. MULTI-TENANT + MULTI-BRANCH ISOLATION

Every organization-owned record must contain the appropriate organization relationship.

Every branch-specific record must contain the appropriate branch relationship.

Conceptually:

```text
organization_id
branch_id
```

where applicable.

Examples:

Students:

```text
organization_id
branch_id
```

Faculty:

```text
organization_id
branch_id
```

Batches:

```text
organization_id
branch_id
```

Attendance:

```text
organization_id
branch_id
```

Fees:

```text
organization_id
branch_id
```

Branch-specific data must NEVER leak between branches.

Organization Admin may have cross-branch access.

Branch Admin normally sees only their assigned branch.

Backend must enforce this.

Frontend filtering is NOT sufficient.

---

# 6. DESIGN SYSTEM

A separate design system will be provided later.

Use the provided design system when supplied.

Do not create conflicting colors, typography or component styles.

Build reusable:

- Buttons
- Inputs
- Selects
- Comboboxes
- Tables
- Cards
- Drawers
- Modals
- Tabs
- Badges
- Dropdowns
- Tooltips
- Toasts
- Pagination
- Filters
- Charts
- File upload
- Empty states
- Loading states
- Error states
- Confirmation dialogs

---

# 7. GLOBAL UX RULES

Use:

### Tables

For:

- Students
- Faculty
- Batches
- Admissions
- Organizations
- Subscriptions
- Tests
- Questions
- Results
- Fees
- Payments
- Expenses
- Homework
- Doubts
- Communications
- Reports

### Right-side drawers

For:

- Add
- Edit
- Quick assignment
- Quick payment
- Quick branch creation
- Branch Admin creation
- Coupon creation
- Trial extension
- Support note

### Modals

For:

- Delete
- Archive
- Suspend
- Restore
- Cancel
- Refund
- Publish
- Confirm
- Dangerous actions

### Full detail pages

For:

- Organization
- Branch
- Student
- Faculty
- Batch
- Test
- Result
- Performance
- Subscription
- Payment
- Support ticket

---

# 8. RESPONSIVE REQUIREMENT

The entire platform must be responsive.

Test:

```text
320px
375px
390px
430px
768px
1024px
1280px+
```

Desktop:

- Sidebar
- Tables
- Drawers
- Multi-column layouts

Tablet:

- Collapsible navigation
- Responsive tables
- Adaptive layouts

Mobile:

- Compact navigation
- Cards instead of huge tables
- Full-screen drawers
- Bottom sheets
- Stacked forms
- Touch-friendly controls
- Mobile filters

Do not shrink desktop tables to fit mobile.

Every module must have intentional mobile UX.

---

# ============================================================
# PHASE 0 — SAAS PLATFORM SUPER ADMIN CONSOLE
# ============================================================

Build this before the coaching ERP.

The Super Admin Console is a separate privileged application.

It manages the entire SaaS platform.

---

# 9. SUPER ADMIN AUTHENTICATION

Roles:

- Platform Owner
- Platform Admin
- Finance Admin
- Support Admin
- Read-only Admin

Support:

- Login
- Logout
- Forgot password
- Reset password
- Session management
- MFA-ready architecture
- Device/session management

Permissions must be granular.

---

# 10. SUPER ADMIN DASHBOARD

Show:

- Total organizations
- Active organizations
- Trial organizations
- Expired trials
- Paid organizations
- Suspended organizations
- MRR
- ARR
- Revenue
- New organizations
- New subscriptions
- Trial conversion
- Churn
- Active students
- Active branches
- Usage
- Support issues

Filters:

- Today
- 7 days
- 30 days
- Month
- Year
- Custom range

---

# 11. ORGANIZATION MANAGEMENT

Organization table:

- Organization ID
- Organization name
- Owner
- Email
- Phone
- Branch count
- Student count
- Plan
- Subscription
- Trial
- Created date
- Last active
- Status

Statuses:

- Trial
- Active
- Payment Due
- Suspended
- Cancelled
- Expired
- Archived

Actions:

- View
- Edit
- Suspend
- Reactivate
- Archive
- Extend trial
- Change plan
- Apply coupon
- View billing
- View usage
- Support note
- Feature access

---

# 12. ORGANIZATION DETAIL

Tabs:

```text
Overview
Branches
Subscription
Billing
Users
Students
Usage
Activity
Support
Feature Access
Audit Logs
```

The Super Admin should be able to understand the organization's entire platform state from here.

---

# 13. PLAN MANAGEMENT

Create dynamic plans:

- Free
- Starter
- Professional
- Enterprise

Fields:

- Name
- Description
- Monthly price
- Annual price
- Currency
- Trial
- Student limit
- Branch limit
- Faculty limit
- Storage
- Features
- Status

---

# 14. FEATURE ENTITLEMENTS

Examples:

- students
- branches
- attendance
- fees
- tests
- question_bank
- online_tests
- analytics
- communication
- whatsapp
- sms
- study_materials
- homework
- doubts
- hostel
- transport
- ai_insights
- advanced_reports

Backend must enforce entitlements.

---

# 15. BRANCH PLAN LIMITS

Plans must support branch limits.

Example:

```text
Starter
1 branch

Professional
5 branches

Enterprise
Unlimited/custom
```

If organization reaches the branch limit:

Show:

"Your current plan allows 5 branches."

Provide:

[Upgrade Plan]

Do not allow accidental creation beyond the limit.

Super Admin may override limits.

---

# 16. USAGE LIMITS

Support:

- Student limit
- Branch limit
- Faculty limit
- Storage
- Admin users
- Messages
- Tests
- Questions

Show:

```text
Branches
4 / 5

Students
1,842 / 2,000
```

Warn before limits are reached.

---

# 17. TRIAL MANAGEMENT

Support:

- Configurable trial
- Start
- Extend
- Cancel
- Convert
- Trial history

Track:

- Start
- Expiry
- Extensions
- Reason
- Admin
- Date

---

# 18. COUPONS

Support:

- Percentage
- Fixed
- First payment
- Recurring
- One-time
- Trial extension

Prevent:

- Duplicate codes
- Expired coupons
- Disabled coupons
- Usage overflow
- Invalid plans

---

# 19. SUBSCRIPTIONS

Lifecycle:

```text
Trial
→ Active
→ Renewal
→ Payment Due
→ Past Due
→ Suspended
→ Cancelled
```

Support:

- Create
- Upgrade
- Downgrade
- Renew
- Cancel
- Pause
- Resume
- Extend

Never delete subscription history.

---

# 20. PAYMENTS & INVOICES

Payments:

- ID
- Organization
- Invoice
- Amount
- Currency
- Method
- Status
- Transaction reference
- Date

Invoices:

- Number
- Organization
- Plan
- Billing period
- Amount
- Discount
- Tax
- Total
- Status

Never delete financial history.

---

# 21. PLATFORM ANALYTICS

Include:

- Revenue
- MRR
- ARR
- Growth
- Churn
- Trial conversion
- Plan distribution
- Organization growth
- Branch growth
- Student growth
- Usage

---

# 22. SUPPORT

Support tickets:

- Organization
- User
- Subject
- Description
- Priority
- Status
- Assigned admin

Support notes remain internal.

---

# 23. FEATURE FLAGS

Support:

- Global
- Organization
- Plan

Examples:

- AI
- New dashboard
- New test engine
- WhatsApp V2

---

# 24. AUDIT LOGS

Audit:

- Organization changes
- Trial extension
- Plan changes
- Coupons
- Payments
- Refunds
- Feature changes
- Impersonation
- Settings

---

# ============================================================
# PHASE 1 — ORGANIZATION + MULTI-BRANCH FOUNDATION
# ============================================================

This phase is intentionally focused on the foundation required before students, faculty and batches.

---

# 25. ORGANIZATION ONBOARDING

Flow:

```text
Sign Up
↓
Create Organization
↓
Create Organization Owner
↓
Organization Setup
↓
Create First Branch
↓
Create First Branch Admin
↓
Branch Setup
↓
ERP Dashboard
```

Do not allow a newly created organization to become operational without a branch unless the product explicitly supports branchless organizations.

---

# 26. ORGANIZATION PROFILE

Fields:

- Organization name
- Logo
- Website
- Email
- Phone
- Address
- Country
- State
- City
- Pincode
- Default timezone
- Academic year settings

---

# 27. BRANCH MANAGEMENT

Branch table:

- Branch name
- Branch code
- City
- State
- Phone
- Branch Admin
- Students
- Faculty
- Active batches
- Status

Statuses:

- Setup Required
- Active
- Temporarily Closed
- Suspended
- Archived

Actions:

- View
- Edit
- Create Admin
- Assign Admin
- Suspend
- Reactivate
- Archive

---

# 28. CREATE FIRST BRANCH

After organization creation, guide the user through:

### Branch details

- Branch name
- Branch code
- Address
- City
- State
- Country
- Pincode
- Phone
- Email
- Timezone
- Working days

Then:

**Create Branch Admin**

---

# 29. BRANCH ADMIN CREATION

Fields:

- Full name
- Employee ID
- Email
- Phone
- Login email
- Branch
- Role

Automatically associate:

```text
organization_id = current organization
branch_id = selected branch
role = BRANCH_ADMIN
```

Do not allow a normal Branch Admin to exist without a branch assignment.

---

# 30. BRANCH ADMIN PERMISSIONS

Default Branch Admin access:

- Admissions
- Students
- Faculty
- Batches
- Timetable
- Attendance
- Tests
- Results
- Homework
- Doubts
- Materials
- Branch fees
- Branch expenses
- Branch communication
- Branch reports

Cannot access by default:

- Other branches
- Platform Super Admin
- SaaS billing
- Plans
- Coupons
- Organization security settings

Organization Owner can grant additional permissions.

---

# 31. ORGANIZATION ADMIN

Organization Admin can manage:

- Organization
- All branches
- Branch creation
- Branch admins
- Users
- Organization courses
- Academic structures
- Cross-branch reports
- Organization communication
- Organization settings

---

# 32. BRANCH SWITCHER

Organization-level users with access to multiple branches should have a branch switcher.

Example:

```text
ABC Academy

Current Branch:
Chennai ▼

Chennai
Salem
Bangalore
All Branches
```

Permissions determine which options appear.

Branch Admin should normally see only:

```text
Chennai
```

Do not show inaccessible branches.

---

# 33. ALL-BRANCH VIEW

Organization Admin should be able to choose:

**All Branches**

Dashboard can then show:

```text
All Branches
────────────────────────
Students       8,420
Branches           5
Faculty           210
Batches            96
Today's Attendance 94%
```

Allow filtering by branch.

---

# 34. BRANCH DASHBOARD

Branch Admin dashboard:

- Branch students
- Branch faculty
- Active batches
- Today's classes
- Attendance
- Admissions
- Tests
- Fee collection
- Outstanding fees
- Alerts

Every metric must respect branch scope.

---

# 35. BRANCH TRANSFER

Support transferring:

- Students
- Faculty where appropriate
- Courses
- Batches where appropriate

Student transfer flow:

```text
Student
→ Transfer
→ Select Destination Branch
→ Select Batch
→ Confirm
```

Before confirmation show:

- Current branch
- Destination branch
- Current batch
- New batch
- Impact

After transfer:

Future records use destination branch.

Historical records remain with the original branch.

---

# 36. BRANCH DEACTIVATION

Do not delete a branch containing historical data.

When deactivating:

Show:

- Active students
- Active faculty
- Active batches
- Pending fees
- Upcoming tests

Require a resolution plan where necessary.

Options:

- Transfer students
- Transfer faculty
- Close batches
- Archive branch

Then deactivate.

Historical records remain accessible to authorized organization users.

---

# 37. BRANCH CREATION EDGE CASES

Handle:

- Duplicate branch code
- Duplicate branch name
- Same city with multiple branches
- Branch created without admin
- Admin invitation not accepted
- Admin already belongs to another branch
- Branch creation beyond plan limit
- Branch suspended
- Branch archived
- Branch reactivated

---

# ============================================================
# PHASE 2 — CORE PEOPLE & ADMISSIONS
# ============================================================

# 38. ADMISSIONS

Manage:

- Enquiries
- Counselling
- Follow-ups
- Entrance tests
- Admission conversion

Pipeline:

```text
New
→ Contacted
→ Counselling
→ Trial
→ Follow-up
→ Admission
→ Lost
```

Every admission must belong to:

- Organization
- Branch
- Course
- Batch where applicable

---

# 39. STUDENTS

Student fields:

- Student ID
- Name
- Photo
- Date of birth
- Gender where required
- Phone
- Parent
- Academic background
- Target exam
- Course
- Branch
- Batch
- Admission date
- Status

Student detail:

```text
Overview
Academic
Branch
Batch
Attendance
Tests
Results
Performance
Homework
Doubts
Fees
Materials
Communication
Documents
```

A student should have one current operational branch but retain historical branch assignments.

---

# 40. FACULTY

Faculty should belong to the organization and have branch assignments.

Support:

- Single branch faculty
- Multi-branch faculty
- Temporary branch assignment
- Faculty transfer

Do not force multi-branch faculty into a single branch-only relationship.

Use an assignment model where necessary.

---

# 41. BATCHES

Every batch must belong to:

- Organization
- Branch
- Course
- Academic year

Support:

- Capacity
- Faculty
- Subjects
- Room
- Timetable
- Students

---

# ============================================================
# PHASE 3 — ACADEMICS & TIMETABLE
# ============================================================

# 42. ACADEMIC STRUCTURE

```text
Course
→ Subject
→ Chapter
→ Topic
```

Courses can be organization-level.

Batch execution is branch-specific.

---

# 43. SYLLABUS

Support:

- Course syllabus
- Branch-specific syllabus overrides where necessary
- Batch syllabus
- Completion tracking

---

# 44. ACADEMIC PLANNING

Support:

- Lesson plans
- Revision plans
- Practice plans
- Test plans

---

# 45. FACULTY ASSIGNMENT

Support:

- Branch assignment
- Batch assignment
- Subject assignment
- Multi-branch teaching

Warn about conflicts.

---

# 46. TIMETABLE

Every timetable entry should include:

- Organization
- Branch
- Batch
- Faculty
- Room
- Subject
- Date/time

Detect:

- Faculty conflicts
- Room conflicts
- Batch conflicts
- Cross-branch faculty conflicts

---

# ============================================================
# PHASE 4 — ATTENDANCE & COMMUNICATION
# ============================================================

# 47. ATTENDANCE

Attendance must respect:

- Organization
- Branch
- Batch
- Student

Branch Admin sees only branch attendance.

Organization Admin can see cross-branch attendance.

Support:

- Present
- Absent
- Late
- Half Day
- Excused

Reports:

- Student
- Batch
- Branch
- Organization

---

# 48. LEAVE

Support student and faculty leave.

Branch Admin approves branch-level requests.

Organization-level users can have configurable approval rights.

---

# 49. COMMUNICATION

Communication can target:

- Branch
- Batch
- Course
- Student
- Parent
- Faculty
- All branches

Example:

Organization Admin:

"All branches: Mock test scheduled for Sunday."

Branch Admin:

"Chennai branch: Tomorrow's Physics class is rescheduled."

---

# 50. NOTIFICATIONS

Notifications must respect branch and user permissions.

---

# ============================================================
# PHASE 5 — TESTS & ASSESSMENT
# ============================================================

# 51. QUESTION BANK

Question bank can be:

- Organization-wide
- Branch-specific

Allow organization-level question libraries to be reused across branches.

Questions used in historical tests cannot be destructively modified.

---

# 52. TEST MANAGEMENT

Tests can be:

- Branch-specific
- Multi-branch
- Organization-wide

Example:

"All India Mock Test #4"

can be assigned to:

- Chennai
- Salem
- Bangalore
- All branches

---

# 53. ONLINE TEST

Support:

- Timer
- Auto-save
- Reconnect
- Submission
- Auto-submit

Ensure branch and organization access is validated.

---

# 54. RESULTS

Results should support:

- Batch rank
- Branch rank
- Organization rank
- Multi-branch test rank
- Percentile

Example:

```text
Student:
Arun

Batch Rank:
3

Chennai Branch Rank:
12

Organization Rank:
48
```

---

# ============================================================
# PHASE 6 — PERFORMANCE & REPORTING
# ============================================================

# 55. PERFORMANCE ANALYTICS

Support:

- Student
- Batch
- Branch
- Organization

Metrics:

- Score
- Rank
- Percentile
- Accuracy
- Subject
- Chapter
- Trend

---

# 56. CROSS-BRANCH ANALYTICS

Organization Admin should compare:

```text
Chennai
Salem
Bangalore
```

Metrics:

- Students
- Attendance
- Average score
- Top performers
- Fee collection
- Admission conversion
- Faculty performance

Branch Admin should NOT see other branches unless explicitly permitted.

---

# 57. REPORTS

Reports should support branch filters.

Examples:

```text
Branch:
All Branches ▼

Chennai
Salem
Bangalore
```

Every report must respect user permissions.

---

# ============================================================
# PHASE 7 — LEARNING MANAGEMENT
# ============================================================

# 58. HOMEWORK

Homework can be assigned to:

- Batch
- Branch
- Multiple branches
- Individual students

---

# 59. DOUBTS

Doubts should route to:

- Branch faculty
- Assigned faculty
- Organization faculty pool where configured

---

# 60. STUDY MATERIALS

Materials can be:

- Organization-wide
- Branch-specific
- Batch-specific
- Student-specific

Permissions must control access.

---

# ============================================================
# PHASE 8 — FINANCE
# ============================================================

# 61. FEES

Fees must support:

- Organization-level fee structure
- Branch-specific fee structures
- Course-specific fees
- Scholarship
- Installments
- Discounts

---

# 62. PAYMENTS

Every payment must identify:

- Organization
- Branch
- Student
- Fee account
- Payment method
- Amount
- Date

Branch Admin can see branch payments.

Organization Admin can see all branch payments.

---

# 63. EXPENSES

Expenses should support:

- Branch expenses
- Organization-level expenses

Example:

```text
Chennai Branch
→ Rent

Salem Branch
→ Electricity

Organization
→ Central Marketing
```

---

# 64. FINANCE ANALYTICS

Compare:

- Branch revenue
- Branch expenses
- Collections
- Outstanding
- Net contribution

---

# ============================================================
# PHASE 9 — PARENT + ADVANCED OPERATIONS
# ============================================================

# 65. PARENT PORTAL

Parent can see only their child's permitted information.

If parent has children in different branches:

```text
Child 1
Chennai

Child 2
Salem
```

Allow child switching.

Do not expose unrelated branch data.

---

# 66. HOSTEL

Hostel may be:

- Branch-specific
- Centralized

Students can be allocated according to branch/location.

---

# 67. TRANSPORT

Support:

- Branch routes
- Vehicles
- Stops
- Students
- Drivers

---

# 68. MESS

Support branch-specific or centralized mess operations.

---

# ============================================================
# PHASE 10 — AI + PRODUCTION HARDENING
# ============================================================

# 69. AI STUDENT INSIGHTS

Analyze:

- Attendance
- Tests
- Performance
- Rank
- Subject weakness

---

# 70. AI BATCH / BRANCH INSIGHTS

Identify:

- Weak batches
- Weak subjects
- Attendance risks
- Faculty workload
- Branch performance

---

# 71. ORGANIZATION AI ANALYTICS

Organization Admin can compare branches using AI-generated insights.

Example:

"Chennai branch has the highest average Physics score, while Salem branch has the lowest attendance consistency."

AI output is advisory.

---

# 72. AUDIT LOGGING

Track:

- Organization actions
- Branch actions
- Student transfers
- Faculty transfers
- Permission changes
- Fee changes
- Result publication
- Super Admin actions
- Subscription actions

---

# 73. SECURITY

Implement:

- Authentication
- Authorization
- RBAC
- Tenant isolation
- Branch isolation
- Input validation
- Rate limiting
- Secure headers
- CORS
- Secure sessions
- File validation
- Audit logging

Backend must independently validate:

```text
User
→ Organization
→ Branch
→ Role
→ Permission
→ Resource
```

---

# 74. DATABASE CORE RELATIONSHIPS

Important relationships:

```text
organizations
    ↓
branches
    ↓
users
students
faculty
batches
attendance
fees
tests
expenses
```

Example:

```text
organizations
  └── branches
       ├── branch_users
       ├── students
       ├── faculty
       ├── batches
       ├── attendance
       ├── payments
       └── expenses
```

Create appropriate entities such as:

```text
organizations
branches
organization_users
branch_users
branch_admins
branch_transfers
students
student_branch_history
faculty
faculty_branch_assignments
batches
batch_students
batch_faculty
```

Do not rely on a single `branch_id` column when historical/multi-branch relationships require an assignment/history table.

---

# 75. BRANCH HISTORY

Maintain history for:

- Student branch transfers
- Faculty branch transfers
- Batch transfers
- Branch closure
- Branch reactivation

Example:

```text
Student
│
├── 2026-04 → Chennai
├── 2026-07 → Salem
└── Current → Salem
```

Historical reports must remain accurate.

---

# 76. BRANCH SWITCHING SECURITY

When a user switches branch:

Backend must validate:

```text
User belongs to organization
↓
User has access to selected branch
↓
Session/context updated
↓
Queries scoped to selected branch
```

Never trust a client-supplied `branch_id` without authorization validation.

---

# 77. ORGANIZATION-WIDE VS BRANCH-WIDE DATA

Clearly classify every module.

## Organization-wide

Examples:

- Academic structure
- Question bank
- Organization settings
- Subscription
- Plans
- Global reports

## Branch-specific

Examples:

- Students
- Admissions
- Batches
- Attendance
- Faculty operations
- Branch fees
- Branch expenses

## Configurable

Examples:

- Study materials
- Tests
- Communication
- Hostel
- Transport

Every module must explicitly define its scope.

---

# 78. BRANCH-LEVEL DASHBOARD

Branch Admin dashboard:

```text
Students
Faculty
Batches
Today's Classes
Attendance
Admissions
Tests
Fees
Expenses
Alerts
```

All metrics must be branch-scoped.

---

# 79. ORGANIZATION DASHBOARD

Organization Admin dashboard:

```text
Total Students
Total Branches
Total Faculty
Total Batches
Today's Attendance
Admissions
Revenue
Expenses
Test Performance
Branch Comparison
```

Allow branch filtering.

---

# 80. SUPER ADMIN ORGANIZATION VIEW

Super Admin should see:

```text
Organization
│
├── Branches
│   ├── Chennai
│   ├── Salem
│   └── Bangalore
│
├── Subscription
├── Usage
├── Billing
└── Activity
```

Usage should show branch breakdown.

Example:

```text
Total Students: 8,420

Chennai: 3,200
Salem: 2,100
Bangalore: 3,120
```

---

# 81. PLAN ENFORCEMENT FOR BRANCHES

When creating a branch:

```text
Current:
4 / 5 branches

Create branch
↓
Check entitlement
↓
Allowed
↓
Create
```

If exceeded:

```text
Branch limit reached.

Your Professional plan allows 5 branches.

[Upgrade Plan]
```

Super Admin may override where appropriate.

---

# 82. BRANCH CLOSURE FLOW

Never delete a branch.

Flow:

```text
Branch
→ Close Branch
→ Review active students
→ Review active faculty
→ Review batches
→ Review fees
→ Transfer/archive required data
→ Confirm
→ Branch archived
```

Historical data remains.

---

# 83. IMPLEMENTATION ORDER

Implement exactly in this order:

### PHASE 0
SaaS Super Admin

### PHASE 1
Organization + Multi-Branch Foundation

### PHASE 2
Admissions + Students + Faculty + Batches

### PHASE 3
Academics + Syllabus + Timetable

### PHASE 4
Attendance + Leave + Communication

### PHASE 5
Question Bank + Tests + Online Tests + Results

### PHASE 6
Performance Analytics + Cross-Branch Reports

### PHASE 7
Homework + Doubts + Study Materials + Student Portal

### PHASE 8
Fees + Payments + Scholarships + Expenses + Finance

### PHASE 9
Parent Portal + Hostel + Transport + Mess

### PHASE 10
AI Intelligence + Security + Audit + Performance + Production Hardening

---

# 84. DEVELOPMENT RULE

Do NOT implement all phases at once.

For each phase:

```text
Requirements
↓
Database design
↓
Migration
↓
Backend module
↓
API
↓
Validation
↓
Authorization
↓
Tenant isolation
↓
Branch isolation
↓
Frontend
↓
Responsive UX
↓
Edge cases
↓
Testing
↓
Production review
```

Only after the phase is complete should the next phase begin.

---

# 85. DEFINITION OF DONE

A module is complete only when:

- Database exists
- Migration exists
- API exists
- Authentication works
- Authorization works
- Organization isolation works
- Branch isolation works
- CRUD works
- Validation works
- Duplicate handling works
- Dependency handling works
- Archive/delete behaviour works
- Historical data works
- Search works
- Filtering works
- Pagination works where necessary
- Loading state works
- Empty state works
- Error state works
- Success feedback works
- Responsive desktop works
- Responsive tablet works
- Responsive mobile works
- Permissions are tested
- Related modules are integrated
- No mock functionality remains

---

# 86. MOST IMPORTANT BUSINESS RULE

Always understand the difference between:

**Platform**

**Organization**

**Branch**

**User**

**Resource**

Example:

```text
Super Admin
↓
Organization
↓
Chennai Branch
↓
Branch Admin
↓
Batch
↓
Student
```

A Branch Admin should never be able to escape their branch scope through:

- URL manipulation
- API requests
- query parameters
- frontend state
- branch switcher
- direct database access through APIs

All authorization must happen server-side.

---

# 87. FINAL PRODUCT VISION

The final platform should operate like:

```text
                        SAAS PLATFORM
                              │
                    ┌─────────┴─────────┐
                    │                   │
              SUPER ADMIN         ORGANIZATIONS
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                 CHENNAI           SALEM           BANGALORE
                    │                 │                 │
               Branch Admin      Branch Admin      Branch Admin
                    │                 │                 │
              Faculty/Staff     Faculty/Staff     Faculty/Staff
                    │                 │                 │
                Batches           Batches           Batches
                    │                 │                 │
               Students          Students          Students
```

The Organization Admin operates across the organization.

The Branch Admin operates within their branch.

Faculty and staff operate according to their branch/user permissions.

Students and parents access only their authorized information.

Super Admin controls the SaaS platform itself.

The platform must support organizations growing from:

```text
1 branch
→ 2 branches
→ 5 branches
→ 20 branches
→ 100+ branches
```

without requiring architectural restructuring.

Build the platform as a **real multi-tenant, multi-branch SaaS product**, not as a single coaching-centre application with a branch dropdown added later.

Start implementation with **PHASE 0**, then complete **PHASE 1 Multi-Branch Foundation** before implementing the operational ERP modules.