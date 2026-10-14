/**
 * Shared domain vocabulary for the whole platform.
 *
 * These enums are mirrored by name in `apps/api/prisma/schema.prisma`. They are
 * declared here rather than imported from the Prisma client because the browser
 * bundles must never pull in Prisma. If you change one, change both.
 */

/**
 * `const` type parameter is load-bearing: without it TS widens the literal values
 * to `string` (the constraint's property type), and every derived union — OrgRole,
 * LimitKey, Feature — collapses to `string`, silently defeating Prisma's enums.
 */
export const asEnum = <const T extends Record<string, string>>(o: T) => Object.freeze(o);
export type ValueOf<T> = T[keyof T];

/* ── Platform (Super Admin) ─────────────────────────────────────────────── */

/** Spec §9. Ordered most- to least-privileged; see `PLATFORM_ROLE_RANK`. */
export const PlatformRole = asEnum({
  PLATFORM_OWNER: "PLATFORM_OWNER",
  PLATFORM_ADMIN: "PLATFORM_ADMIN",
  FINANCE_ADMIN: "FINANCE_ADMIN",
  SUPPORT_ADMIN: "SUPPORT_ADMIN",
  READONLY_ADMIN: "READONLY_ADMIN",
});
export type PlatformRole = ValueOf<typeof PlatformRole>;

export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  PLATFORM_OWNER: "Platform Owner",
  PLATFORM_ADMIN: "Platform Admin",
  FINANCE_ADMIN: "Finance Admin",
  SUPPORT_ADMIN: "Support Admin",
  READONLY_ADMIN: "Read-only Admin",
};

/* ── Organization / tenant ──────────────────────────────────────────────── */

/** Spec §11. */
export const OrganizationStatus = asEnum({
  TRIAL: "TRIAL",
  ACTIVE: "ACTIVE",
  PAYMENT_DUE: "PAYMENT_DUE",
  SUSPENDED: "SUSPENDED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  ARCHIVED: "ARCHIVED",
});
export type OrganizationStatus = ValueOf<typeof OrganizationStatus>;

/** Spec §27. A branch is never deleted, only archived. */
export const BranchStatus = asEnum({
  SETUP_REQUIRED: "SETUP_REQUIRED",
  ACTIVE: "ACTIVE",
  TEMPORARILY_CLOSED: "TEMPORARILY_CLOSED",
  SUSPENDED: "SUSPENDED",
  ARCHIVED: "ARCHIVED",
});
export type BranchStatus = ValueOf<typeof BranchStatus>;

/** Spec §§29–31. Tenant-side roles, distinct from PlatformRole. */
export const OrgRole = asEnum({
  ORG_OWNER: "ORG_OWNER",
  ORG_ADMIN: "ORG_ADMIN",
  BRANCH_ADMIN: "BRANCH_ADMIN",
  FACULTY: "FACULTY",
  COUNSELLOR: "COUNSELLOR",
  ACCOUNTANT: "ACCOUNTANT",
  STUDENT: "STUDENT",
  PARENT: "PARENT",
});
export type OrgRole = ValueOf<typeof OrgRole>;

/** Roles that may hold cross-branch scope. Everyone else is pinned to their branches. */
export const CROSS_BRANCH_ROLES: readonly OrgRole[] = [OrgRole.ORG_OWNER, OrgRole.ORG_ADMIN];

/* ── Billing ────────────────────────────────────────────────────────────── */

/** Spec §19. */
export const SubscriptionStatus = asEnum({
  TRIAL: "TRIAL",
  ACTIVE: "ACTIVE",
  RENEWAL: "RENEWAL",
  PAYMENT_DUE: "PAYMENT_DUE",
  PAST_DUE: "PAST_DUE",
  SUSPENDED: "SUSPENDED",
  CANCELLED: "CANCELLED",
});
export type SubscriptionStatus = ValueOf<typeof SubscriptionStatus>;

export const BillingCycle = asEnum({ MONTHLY: "MONTHLY", ANNUAL: "ANNUAL" });
export type BillingCycle = ValueOf<typeof BillingCycle>;

export const PlanStatus = asEnum({ DRAFT: "DRAFT", ACTIVE: "ACTIVE", ARCHIVED: "ARCHIVED" });
export type PlanStatus = ValueOf<typeof PlanStatus>;

/** Spec §18. */
export const CouponType = asEnum({
  PERCENTAGE: "PERCENTAGE",
  FIXED: "FIXED",
  TRIAL_EXTENSION: "TRIAL_EXTENSION",
});
export type CouponType = ValueOf<typeof CouponType>;

export const CouponDuration = asEnum({
  ONE_TIME: "ONE_TIME",
  FIRST_PAYMENT: "FIRST_PAYMENT",
  RECURRING: "RECURRING",
});
export type CouponDuration = ValueOf<typeof CouponDuration>;

/** Spec §20. Financial history is append-only — there is no DELETED state. */
export const InvoiceStatus = asEnum({
  DRAFT: "DRAFT",
  OPEN: "OPEN",
  PAID: "PAID",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  OVERDUE: "OVERDUE",
  VOID: "VOID",
  REFUNDED: "REFUNDED",
});
export type InvoiceStatus = ValueOf<typeof InvoiceStatus>;

export const PaymentStatus = asEnum({
  PENDING: "PENDING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
});
export type PaymentStatus = ValueOf<typeof PaymentStatus>;

export const PaymentMethod = asEnum({
  CARD: "CARD",
  UPI: "UPI",
  NETBANKING: "NETBANKING",
  BANK_TRANSFER: "BANK_TRANSFER",
  CASH: "CASH",
  CHEQUE: "CHEQUE",
  MANUAL: "MANUAL",
});
export type PaymentMethod = ValueOf<typeof PaymentMethod>;

/* ── Entitlements & limits ──────────────────────────────────────────────── */

/** Spec §14. Boolean capability gates, enforced server-side. */
export const Feature = asEnum({
  students: "students",
  branches: "branches",
  attendance: "attendance",
  fees: "fees",
  tests: "tests",
  question_bank: "question_bank",
  online_tests: "online_tests",
  analytics: "analytics",
  communication: "communication",
  whatsapp: "whatsapp",
  sms: "sms",
  study_materials: "study_materials",
  homework: "homework",
  doubts: "doubts",
  hostel: "hostel",
  transport: "transport",
  ai_insights: "ai_insights",
  advanced_reports: "advanced_reports",
});
export type Feature = ValueOf<typeof Feature>;
export const ALL_FEATURES = Object.values(Feature) as Feature[];

export const FEATURE_LABEL: Record<Feature, string> = {
  students: "Students",
  branches: "Multi-branch",
  attendance: "Attendance",
  fees: "Fees & payments",
  tests: "Tests",
  question_bank: "Question bank",
  online_tests: "Online tests",
  analytics: "Analytics",
  communication: "Communication",
  whatsapp: "WhatsApp",
  sms: "SMS",
  study_materials: "Study materials",
  homework: "Homework",
  doubts: "Doubts",
  hostel: "Hostel",
  transport: "Transport",
  ai_insights: "AI insights",
  advanced_reports: "Advanced reports",
};

/** Spec §16. Numeric quotas. `null` on a plan means unlimited. */
export const LimitKey = asEnum({
  students: "students",
  branches: "branches",
  faculty: "faculty",
  admin_users: "admin_users",
  storage_mb: "storage_mb",
  messages: "messages",
  tests: "tests",
  questions: "questions",
});
export type LimitKey = ValueOf<typeof LimitKey>;
export const ALL_LIMITS = Object.values(LimitKey) as LimitKey[];

export const LIMIT_LABEL: Record<LimitKey, string> = {
  students: "Students",
  branches: "Branches",
  faculty: "Faculty",
  admin_users: "Admin users",
  storage_mb: "Storage",
  messages: "Messages",
  tests: "Tests",
  questions: "Questions",
};

export type PlanLimits = Partial<Record<LimitKey, number | null>>;

/* ── Support & platform ops ─────────────────────────────────────────────── */

export const TicketStatus = asEnum({
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  WAITING_ON_CUSTOMER: "WAITING_ON_CUSTOMER",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
});
export type TicketStatus = ValueOf<typeof TicketStatus>;

export const TicketPriority = asEnum({
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
});
export type TicketPriority = ValueOf<typeof TicketPriority>;

/** Spec §23. */
export const FeatureFlagScope = asEnum({
  GLOBAL: "GLOBAL",
  PLAN: "PLAN",
  ORGANIZATION: "ORGANIZATION",
});
export type FeatureFlagScope = ValueOf<typeof FeatureFlagScope>;

/* ── Phase 2 — people & admissions ──────────────────────────────────────── */

/** Spec §39. What the student is preparing for. */
export const TargetExam = asEnum({
  NEET: "NEET",
  JEE_MAIN: "JEE_MAIN",
  JEE_ADVANCED: "JEE_ADVANCED",
  NEET_JEE: "NEET_JEE",
  FOUNDATION: "FOUNDATION",
  OTHER: "OTHER",
});
export type TargetExam = ValueOf<typeof TargetExam>;

export const TARGET_EXAM_LABEL: Record<TargetExam, string> = {
  NEET: "NEET",
  JEE_MAIN: "JEE Main",
  JEE_ADVANCED: "JEE Advanced",
  NEET_JEE: "NEET + JEE",
  FOUNDATION: "Foundation",
  OTHER: "Other",
};

export const StudentStatus = asEnum({
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  DROPPED: "DROPPED",
  PASSED_OUT: "PASSED_OUT",
  ARCHIVED: "ARCHIVED",
});
export type StudentStatus = ValueOf<typeof StudentStatus>;

export const Gender = asEnum({
  MALE: "MALE",
  FEMALE: "FEMALE",
  OTHER: "OTHER",
  UNDISCLOSED: "UNDISCLOSED",
});
export type Gender = ValueOf<typeof Gender>;

export const GENDER_LABEL: Record<Gender, string> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
  UNDISCLOSED: "Prefer not to say",
};

export const BatchStatus = asEnum({
  PLANNED: "PLANNED",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  ARCHIVED: "ARCHIVED",
});
export type BatchStatus = ValueOf<typeof BatchStatus>;

export const BatchStudentStatus = asEnum({
  ENROLLED: "ENROLLED",
  LEFT: "LEFT",
  COMPLETED: "COMPLETED",
  TRANSFERRED: "TRANSFERRED",
});
export type BatchStudentStatus = ValueOf<typeof BatchStudentStatus>;

/** Spec §38. The admissions pipeline, in the order it is worked. */
export const EnquiryStage = asEnum({
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  COUNSELLING: "COUNSELLING",
  TRIAL: "TRIAL",
  FOLLOW_UP: "FOLLOW_UP",
  ADMITTED: "ADMITTED",
  LOST: "LOST",
});
export type EnquiryStage = ValueOf<typeof EnquiryStage>;

/** Pipeline order for the board. ADMITTED and LOST are terminal. */
export const ENQUIRY_PIPELINE: readonly EnquiryStage[] = [
  EnquiryStage.NEW,
  EnquiryStage.CONTACTED,
  EnquiryStage.COUNSELLING,
  EnquiryStage.TRIAL,
  EnquiryStage.FOLLOW_UP,
  EnquiryStage.ADMITTED,
  EnquiryStage.LOST,
];

export const ENQUIRY_STAGE_LABEL: Record<EnquiryStage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  COUNSELLING: "Counselling",
  TRIAL: "Trial",
  FOLLOW_UP: "Follow-up",
  ADMITTED: "Admitted",
  LOST: "Lost",
};

export const EnquirySource = asEnum({
  WALK_IN: "WALK_IN",
  PHONE: "PHONE",
  WEBSITE: "WEBSITE",
  REFERRAL: "REFERRAL",
  SOCIAL_MEDIA: "SOCIAL_MEDIA",
  CAMPAIGN: "CAMPAIGN",
  OTHER: "OTHER",
});
export type EnquirySource = ValueOf<typeof EnquirySource>;

export const ENQUIRY_SOURCE_LABEL: Record<EnquirySource, string> = {
  WALK_IN: "Walk-in",
  PHONE: "Phone",
  WEBSITE: "Website",
  REFERRAL: "Referral",
  SOCIAL_MEDIA: "Social media",
  CAMPAIGN: "Campaign",
  OTHER: "Other",
};

/* ── Phase 3 — academics, syllabus & timetable ──────────────────────────── */

export const SyllabusStatus = asEnum({
  PLANNED: "PLANNED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  SKIPPED: "SKIPPED",
});
export type SyllabusStatus = ValueOf<typeof SyllabusStatus>;

export const SYLLABUS_STATUS_LABEL: Record<SyllabusStatus, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  SKIPPED: "Skipped",
};

/** Spec §44. */
export const PlanType = asEnum({
  LESSON: "LESSON",
  REVISION: "REVISION",
  PRACTICE: "PRACTICE",
  TEST: "TEST",
});
export type PlanType = ValueOf<typeof PlanType>;

export const PLAN_TYPE_LABEL: Record<PlanType, string> = {
  LESSON: "Lesson",
  REVISION: "Revision",
  PRACTICE: "Practice",
  TEST: "Test",
};

export const PlanStatusKind = asEnum({
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
});
export type PlanStatusKind = ValueOf<typeof PlanStatusKind>;

export const SlotStatus = asEnum({
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  ENDED: "ENDED",
});
export type SlotStatus = ValueOf<typeof SlotStatus>;

export const SessionStatus = asEnum({
  SCHEDULED: "SCHEDULED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
});
export type SessionStatus = ValueOf<typeof SessionStatus>;

/** Spec §46 conflict kinds. Cross-branch faculty clashes are called out separately
 *  because they are the one kind a single-branch view cannot see. */
export const ConflictKind = asEnum({
  FACULTY: "FACULTY",
  FACULTY_CROSS_BRANCH: "FACULTY_CROSS_BRANCH",
  ROOM: "ROOM",
  BATCH: "BATCH",
});
export type ConflictKind = ValueOf<typeof ConflictKind>;

export interface ScheduleConflict {
  kind: ConflictKind;
  message: string;
  /** The slot or session already occupying the time. */
  conflictsWith: {
    id: string;
    batchName: string;
    branchName: string;
    subjectName: string;
    facultyName: string;
    roomName: string | null;
    dayOfWeek?: number;
    date?: string;
    startMinute: number;
    endMinute: number;
  };
}

/** ISO-8601 weekdays, 1 = Monday, matching Branch.workingDays. */
export const WEEKDAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 7, short: "Sun", label: "Sunday" },
] as const;

/* ── Phase 4 — attendance, leave & communication ────────────────────────── */

/** Spec §47. */
export const AttendanceStatus = asEnum({
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  LATE: "LATE",
  HALF_DAY: "HALF_DAY",
  EXCUSED: "EXCUSED",
});
export type AttendanceStatus = ValueOf<typeof AttendanceStatus>;

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  HALF_DAY: "Half day",
  EXCUSED: "Excused",
};

/**
 * How each status counts toward an attendance percentage.
 *
 * EXCUSED is deliberately excluded from the denominator: authorised absence is
 * not a mark against the student, and counting it as absent would penalise
 * exactly the people who followed the process.
 */
export const ATTENDANCE_WEIGHT: Record<AttendanceStatus, number | null> = {
  PRESENT: 1,
  LATE: 1,
  HALF_DAY: 0.5,
  ABSENT: 0,
  EXCUSED: null,
};

export const LeaveSubject = asEnum({ STUDENT: "STUDENT", FACULTY: "FACULTY" });
export type LeaveSubject = ValueOf<typeof LeaveSubject>;

export const LeaveStatus = asEnum({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
});
export type LeaveStatus = ValueOf<typeof LeaveStatus>;

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

/** Spec §49. */
export const AnnouncementAudience = asEnum({
  ALL_BRANCHES: "ALL_BRANCHES",
  BRANCH: "BRANCH",
  BATCH: "BATCH",
  COURSE: "COURSE",
  FACULTY: "FACULTY",
  STUDENTS: "STUDENTS",
  PARENTS: "PARENTS",
});
export type AnnouncementAudience = ValueOf<typeof AnnouncementAudience>;

export const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  ALL_BRANCHES: "All branches",
  BRANCH: "Selected branches",
  BATCH: "A batch",
  COURSE: "A course",
  FACULTY: "Faculty",
  STUDENTS: "Students",
  PARENTS: "Parents",
};

export const AnnouncementStatus = asEnum({
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
});
export type AnnouncementStatus = ValueOf<typeof AnnouncementStatus>;

/* ── Phase 5 — question bank, tests & results ───────────────────────────── */

export const QuestionType = asEnum({
  SINGLE_CHOICE: "SINGLE_CHOICE",
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
  NUMERIC: "NUMERIC",
  TRUE_FALSE: "TRUE_FALSE",
});
export type QuestionType = ValueOf<typeof QuestionType>;

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: "Single correct",
  MULTIPLE_CHOICE: "Multiple correct",
  NUMERIC: "Numeric answer",
  TRUE_FALSE: "True / false",
};

/** Choice questions carry options; NUMERIC carries a value and tolerance. */
export const isChoiceQuestion = (type: QuestionType) => type !== QuestionType.NUMERIC;

export const Difficulty = asEnum({ EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD" });
export type Difficulty = ValueOf<typeof Difficulty>;

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

/** Spec §52. */
export const TestScope = asEnum({
  ORGANIZATION: "ORGANIZATION",
  MULTI_BRANCH: "MULTI_BRANCH",
  BRANCH: "BRANCH",
});
export type TestScope = ValueOf<typeof TestScope>;

export const TEST_SCOPE_LABEL: Record<TestScope, string> = {
  ORGANIZATION: "Every branch",
  MULTI_BRANCH: "Selected branches",
  BRANCH: "One branch",
};

export const TestMode = asEnum({ ONLINE: "ONLINE", OFFLINE: "OFFLINE" });
export type TestMode = ValueOf<typeof TestMode>;

export const TestStatus = asEnum({
  DRAFT: "DRAFT",
  SCHEDULED: "SCHEDULED",
  LIVE: "LIVE",
  CLOSED: "CLOSED",
  RESULTS_PUBLISHED: "RESULTS_PUBLISHED",
  CANCELLED: "CANCELLED",
});
export type TestStatus = ValueOf<typeof TestStatus>;

export const TEST_STATUS_LABEL: Record<TestStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  LIVE: "Live",
  CLOSED: "Closed",
  RESULTS_PUBLISHED: "Results published",
  CANCELLED: "Cancelled",
};

export const AttemptStatus = asEnum({
  IN_PROGRESS: "IN_PROGRESS",
  SUBMITTED: "SUBMITTED",
  AUTO_SUBMITTED: "AUTO_SUBMITTED",
  EVALUATED: "EVALUATED",
  ABANDONED: "ABANDONED",
});
export type AttemptStatus = ValueOf<typeof AttemptStatus>;

export const ATTEMPT_STATUS_LABEL: Record<AttemptStatus, string> = {
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  AUTO_SUBMITTED: "Auto-submitted",
  EVALUATED: "Evaluated",
  ABANDONED: "Not attempted",
};

/**
 * Spec §54. Percentile is the share of candidates scoring **strictly below** this
 * one — the convention NEET and JEE use, so the number means what a student
 * expects it to mean. The topper is therefore never at 100 unless they are alone
 * at the top of the cohort.
 */
export function percentileOf(scoresBelow: number, totalCandidates: number) {
  if (totalCandidates <= 1) return 100;
  return (scoresBelow / (totalCandidates - 1)) * 100;
}

/* ── Phase 7 — homework, study materials & doubts ───────────────────────── */

export const HomeworkAudience = asEnum({
  BRANCH: "BRANCH",
  MULTI_BRANCH: "MULTI_BRANCH",
  BATCH: "BATCH",
  STUDENTS: "STUDENTS",
});
export type HomeworkAudience = ValueOf<typeof HomeworkAudience>;

export const HOMEWORK_AUDIENCE_LABEL: Record<HomeworkAudience, string> = {
  BRANCH: "One or more branches",
  MULTI_BRANCH: "Multiple branches",
  BATCH: "A batch",
  STUDENTS: "Individual students",
};

export const HomeworkStatus = asEnum({ DRAFT: "DRAFT", PUBLISHED: "PUBLISHED", CLOSED: "CLOSED" });
export type HomeworkStatus = ValueOf<typeof HomeworkStatus>;

export const HOMEWORK_STATUS_LABEL: Record<HomeworkStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CLOSED: "Closed",
};

/** Shared by homework and study-material rosters. */
export const SubmissionStatus = asEnum({ PENDING: "PENDING", SUBMITTED: "SUBMITTED", LATE: "LATE" });
export type SubmissionStatus = ValueOf<typeof SubmissionStatus>;

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  PENDING: "Pending",
  SUBMITTED: "Submitted",
  LATE: "Late",
};

export const MaterialAudience = asEnum({
  ORGANIZATION: "ORGANIZATION",
  BRANCH: "BRANCH",
  MULTI_BRANCH: "MULTI_BRANCH",
  BATCH: "BATCH",
  STUDENTS: "STUDENTS",
});
export type MaterialAudience = ValueOf<typeof MaterialAudience>;

export const MATERIAL_AUDIENCE_LABEL: Record<MaterialAudience, string> = {
  ORGANIZATION: "Every branch",
  BRANCH: "One or more branches",
  MULTI_BRANCH: "Multiple branches",
  BATCH: "A batch",
  STUDENTS: "Individual students",
};

/** Spec §59 — `assignedToId: null` on a Doubt means the organization-wide pool. */
export const DoubtStatus = asEnum({ OPEN: "OPEN", ANSWERED: "ANSWERED", CLOSED: "CLOSED" });
export type DoubtStatus = ValueOf<typeof DoubtStatus>;

export const DOUBT_STATUS_LABEL: Record<DoubtStatus, string> = {
  OPEN: "Open",
  ANSWERED: "Answered",
  CLOSED: "Closed",
};

/* ── Phase 8 — fees, payments & expenses ────────────────────────────────── */

export const StudentFeeStatus = asEnum({
  PENDING: "PENDING",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
});
export type StudentFeeStatus = ValueOf<typeof StudentFeeStatus>;

export const STUDENT_FEE_STATUS_LABEL: Record<StudentFeeStatus, string> = {
  PENDING: "Unpaid",
  PARTIALLY_PAID: "Part paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

export const InstallmentStatus = asEnum({
  PENDING: "PENDING",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  WAIVED: "WAIVED",
});
export type InstallmentStatus = ValueOf<typeof InstallmentStatus>;

export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  PENDING: "Due",
  PARTIALLY_PAID: "Part paid",
  PAID: "Paid",
  WAIVED: "Waived",
};

/**
 * Spec §61 lists scholarship and discount separately, but both do the same
 * thing to the arithmetic — reduce what is owed. The kind records *why*, which
 * is what a finance report actually needs to separate.
 */
export const ConcessionKind = asEnum({
  DISCOUNT: "DISCOUNT",
  SCHOLARSHIP: "SCHOLARSHIP",
  WAIVER: "WAIVER",
});
export type ConcessionKind = ValueOf<typeof ConcessionKind>;

export const CONCESSION_KIND_LABEL: Record<ConcessionKind, string> = {
  DISCOUNT: "Discount",
  SCHOLARSHIP: "Scholarship",
  WAIVER: "Waiver",
};

export const FeePaymentStatus = asEnum({
  SUCCEEDED: "SUCCEEDED",
  REFUNDED: "REFUNDED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
});
export type FeePaymentStatus = ValueOf<typeof FeePaymentStatus>;

export const FEE_PAYMENT_STATUS_LABEL: Record<FeePaymentStatus, string> = {
  SUCCEEDED: "Received",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Part refunded",
};

export const ExpenseCategory = asEnum({
  RENT: "RENT",
  SALARY: "SALARY",
  UTILITIES: "UTILITIES",
  MARKETING: "MARKETING",
  MAINTENANCE: "MAINTENANCE",
  SUPPLIES: "SUPPLIES",
  TRANSPORT: "TRANSPORT",
  EQUIPMENT: "EQUIPMENT",
  OTHER: "OTHER",
});
export type ExpenseCategory = ValueOf<typeof ExpenseCategory>;

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  RENT: "Rent",
  SALARY: "Salary",
  UTILITIES: "Utilities",
  MARKETING: "Marketing",
  MAINTENANCE: "Maintenance",
  SUPPLIES: "Supplies",
  TRANSPORT: "Transport",
  EQUIPMENT: "Equipment",
  OTHER: "Other",
};

export const ExpenseStatus = asEnum({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  PAID: "PAID",
});
export type ExpenseStatus = ValueOf<typeof ExpenseStatus>;

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  PENDING: "Awaiting approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PAID: "Paid",
};

/* ── Phase 9 — hostel, transport & mess ─────────────────────────────────── */

/** One lifecycle, shared by all three services — a student holds a place until they give it up. */
export const AllocationStatus = asEnum({ ACTIVE: "ACTIVE", ENDED: "ENDED", CANCELLED: "CANCELLED" });
export type AllocationStatus = ValueOf<typeof AllocationStatus>;

export const ALLOCATION_STATUS_LABEL: Record<AllocationStatus, string> = {
  ACTIVE: "Active",
  ENDED: "Ended",
  CANCELLED: "Cancelled",
};

export const HostelOccupancy = asEnum({ BOYS: "BOYS", GIRLS: "GIRLS", MIXED: "MIXED" });
export type HostelOccupancy = ValueOf<typeof HostelOccupancy>;

export const HOSTEL_OCCUPANCY_LABEL: Record<HostelOccupancy, string> = {
  BOYS: "Boys",
  GIRLS: "Girls",
  MIXED: "Mixed",
};

export const VehicleStatus = asEnum({ ACTIVE: "ACTIVE", MAINTENANCE: "MAINTENANCE", RETIRED: "RETIRED" });
export type VehicleStatus = ValueOf<typeof VehicleStatus>;

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  ACTIVE: "In service",
  MAINTENANCE: "In maintenance",
  RETIRED: "Retired",
};

/* ── Transport types ────────────────────────────────────────────────────── */

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; pageCount: number };
}

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

/** Resolved server-side per request; never trusted from the client. Spec §76. */
export interface AuthContext {
  userId: string;
  email: string;
  organizationId: string | null;
  role: OrgRole | PlatformRole;
  /** Branch ids this user may read. `null` means every branch in the org. */
  branchIds: string[] | null;
  isPlatform: boolean;
}
