import { z } from "zod";
import {
  ALL_FEATURES, ALL_LIMITS, BillingCycle, BranchStatus, CouponDuration, CouponType, OrganizationStatus,
  PlanStatus, PlatformRole, TicketPriority, TicketStatus,
  BatchStatus, EnquirySource, EnquiryStage, Gender, StudentStatus, TargetExam,
  PlanStatusKind, PlanType, SessionStatus, SlotStatus, SyllabusStatus,
  AnnouncementAudience, AnnouncementStatus, AttendanceStatus, LeaveStatus, LeaveSubject,
  Difficulty, QuestionType, TestMode, TestScope, TestStatus,
  HomeworkAudience, HomeworkStatus, MaterialAudience, SubmissionStatus, DoubtStatus,
  ConcessionKind, ExpenseCategory, ExpenseStatus, PaymentMethod,
  HostelOccupancy, VehicleStatus,
} from "@acadia/types";

/**
 * One schema per operation, shared by the API and the browser.
 *
 * The API is the enforcement point — the frontends import these purely so a user
 * sees a field-level error before a round trip. Never assume client validation ran.
 */

/**
 * Preserves the literal union so `z.infer` yields e.g. `PlanStatus`, not `string`
 * — the API assigns these straight into Prisma, which rejects a widened `string`.
 */
const enumOf = <T extends Record<string, string>>(o: T) => z.nativeEnum(o);

/* ── Primitives ─────────────────────────────────────────────────────────── */

export const idSchema = z.string().uuid("Not a valid id");
export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(180);

/** E.164-ish, tolerant of the local Indian formats admins actually paste. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s-]{6,17}$/, "Enter a valid phone number")
  .transform((v) => v.replace(/[\s-]/g, ""));

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Too long")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

/**
 * Uppercase human-readable identifier: branch, coupon, course, subject, batch and
 * student codes.
 *
 * Hyphens are allowed because real batch codes read like "XII-A-NEET" — excluding
 * them made the API reject the exact codes coaching centres already use. Leading
 * and trailing separators are not, so a code always starts and ends with content.
 */
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, "Too short")
  .max(24, "Too long")
  .regex(/^[A-Z0-9][A-Z0-9_-]*[A-Z0-9]$/, "Use letters, numbers, hyphens and underscores");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Use lowercase letters, numbers and hyphens");

/** Money is stored in the minor unit (paise) as an integer — never a float. */
export const minorAmountSchema = z.number().int("Amount must be a whole number").min(0).max(1_000_000_00_000);

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/* ── Pagination & listing ───────────────────────────────────────────────── */

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  sortBy: z.string().trim().max(40).optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type PaginationQuery = z.infer<typeof paginationSchema>;

export const dateRangeSchema = z
  .object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "The start date must fall on or before the end date",
    path: ["from"],
  });

/* ── Platform auth (spec §9) ────────────────────────────────────────────── */

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
  /** Reserved for the MFA-ready architecture the spec requires. */
  mfaCode: z.string().trim().regex(/^\d{6}$/).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const createPlatformUserSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  email: emailSchema,
  phone: phoneSchema.optional(),
  role: enumOf(PlatformRole),
  password: passwordSchema,
});

/* ── Plans (spec §13) ───────────────────────────────────────────────────── */

const limitsShape = Object.fromEntries(
  ALL_LIMITS.map((k) => [k, z.number().int().min(0).nullable().optional()])
) as Record<(typeof ALL_LIMITS)[number], z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;

export const planLimitsSchema = z.object(limitsShape);

export const upsertPlanSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    slug: slugSchema,
    description: z.string().trim().max(400).optional().or(z.literal("")),
    currency: z.string().trim().length(3).toUpperCase().default("INR"),
    monthlyPriceMinor: minorAmountSchema,
    annualPriceMinor: minorAmountSchema,
    trialDays: z.number().int().min(0).max(365).default(14),
    features: z.array(z.enum(ALL_FEATURES as [string, ...string[]])).default([]),
    limits: planLimitsSchema.default({}),
    status: enumOf(PlanStatus).default(PlanStatus.DRAFT),
    sortOrder: z.number().int().min(0).default(0),
  })
  .refine((v) => v.annualPriceMinor === 0 || v.annualPriceMinor <= v.monthlyPriceMinor * 12, {
    message: "The annual price should not exceed twelve monthly payments",
    path: ["annualPriceMinor"],
  });
export type UpsertPlanInput = z.infer<typeof upsertPlanSchema>;

/* ── Organizations (spec §§11, 26) ──────────────────────────────────────── */

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Enter the organization name").max(140),
  slug: slugSchema,
  ownerName: z.string().trim().min(2, "Enter the owner's name").max(120),
  ownerEmail: emailSchema,
  ownerPhone: phoneSchema,
  /** Omit to start the organization on the plan's default trial. */
  planId: idSchema.optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  country: z.string().trim().min(2).max(60).default("India"),
  timezone: z.string().trim().min(3).max(60).default("Asia/Kolkata"),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  website: z.string().trim().url("Enter a valid URL").max(200).optional().or(z.literal("")),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  addressLine: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  country: z.string().trim().max(60).optional(),
  pincode: z.string().trim().max(12).optional().or(z.literal("")),
  timezone: z.string().trim().max(60).optional(),
  logoUrl: z.string().trim().url().max(400).optional().or(z.literal("")),
});

/** Destructive status transitions always carry a reason — it lands in the audit log. */
export const organizationStatusSchema = z.object({
  status: enumOf(OrganizationStatus),
  reason: z.string().trim().min(4, "Give a reason — it is recorded in the audit log").max(400),
});

export const extendTrialSchema = z.object({
  days: z.number().int().min(1, "Extend by at least a day").max(180, "Extend by at most 180 days"),
  reason: z.string().trim().min(4, "Give a reason — it is recorded in the audit log").max(400),
});

export const changePlanSchema = z.object({
  planId: idSchema,
  billingCycle: enumOf(BillingCycle),
  /** Skip proration and start the new plan at the next renewal instead. */
  effectiveAtPeriodEnd: z.boolean().default(false),
  reason: z.string().trim().max(400).optional(),
});

/** Spec §15/§81 — a Super Admin may raise a single organization above its plan. */
export const overrideLimitsSchema = z.object({
  limits: planLimitsSchema,
  reason: z.string().trim().min(4).max(400),
});

export const featureAccessSchema = z.object({
  features: z.array(z.enum(ALL_FEATURES as [string, ...string[]])),
  reason: z.string().trim().max(400).optional(),
});

/* ── Coupons (spec §18) ─────────────────────────────────────────────────── */

export const upsertCouponSchema = z
  .object({
    code: codeSchema,
    description: z.string().trim().max(240).optional().or(z.literal("")),
    type: enumOf(CouponType),
    duration: enumOf(CouponDuration).default(CouponDuration.ONE_TIME),
    /** Percent when type=PERCENTAGE, minor units when FIXED, days when TRIAL_EXTENSION. */
    value: z.number().min(1, "Enter a value"),
    maxRedemptions: z.number().int().min(1).nullable().default(null),
    validFrom: isoDateSchema.optional(),
    validUntil: isoDateSchema.optional(),
    /** Empty means the coupon applies to every plan. */
    planIds: z.array(idSchema).default([]),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.type !== CouponType.PERCENTAGE || v.value <= 100, {
    message: "A percentage discount cannot exceed 100",
    path: ["value"],
  })
  .refine((v) => v.type !== CouponType.TRIAL_EXTENSION || Number.isInteger(v.value), {
    message: "Trial extensions are counted in whole days",
    path: ["value"],
  })
  .refine((v) => !v.validFrom || !v.validUntil || v.validFrom <= v.validUntil, {
    message: "The start date must fall on or before the end date",
    path: ["validUntil"],
  });
export type UpsertCouponInput = z.infer<typeof upsertCouponSchema>;

export const applyCouponSchema = z.object({ code: codeSchema });

/* ── Subscriptions (spec §19) ───────────────────────────────────────────── */

export const createSubscriptionSchema = z.object({
  planId: idSchema,
  billingCycle: enumOf(BillingCycle),
  couponCode: codeSchema.optional(),
  startAt: isoDateSchema.optional(),
});

export const cancelSubscriptionSchema = z.object({
  /** Keep service until the paid period ends — the usual, humane default. */
  atPeriodEnd: z.boolean().default(true),
  reason: z.string().trim().min(4).max(400),
});

/* ── Payments & invoices (spec §20) ─────────────────────────────────────── */

export const recordPaymentSchema = z.object({
  invoiceId: idSchema,
  amountMinor: minorAmountSchema.refine((v) => v > 0, "Enter an amount"),
  method: z.enum(["CARD", "UPI", "NETBANKING", "BANK_TRANSFER", "CASH", "CHEQUE", "MANUAL"]),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
  paidAt: isoDateSchema.optional(),
  note: z.string().trim().max(400).optional().or(z.literal("")),
});

export const refundPaymentSchema = z.object({
  amountMinor: minorAmountSchema.refine((v) => v > 0, "Enter an amount"),
  reason: z.string().trim().min(4, "Give a reason — it is recorded in the audit log").max(400),
});

/* ── Support & flags (spec §§22–23) ─────────────────────────────────────── */

export const createTicketSchema = z.object({
  organizationId: idSchema,
  subject: z.string().trim().min(4).max(160),
  description: z.string().trim().min(4).max(4000),
  priority: enumOf(TicketPriority).default(TicketPriority.MEDIUM),
});

export const updateTicketSchema = z.object({
  status: enumOf(TicketStatus).optional(),
  priority: enumOf(TicketPriority).optional(),
  assignedToId: idSchema.nullable().optional(),
});

export const supportNoteSchema = z.object({
  body: z.string().trim().min(1, "Write a note").max(4000),
  /** Internal notes are never shown to the tenant. */
  isInternal: z.boolean().default(true),
});

export const upsertFeatureFlagSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_.-]+$/, "Use lowercase letters, numbers, dots, dashes and underscores"),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  enabledGlobally: z.boolean().default(false),
  enabledPlanIds: z.array(idSchema).default([]),
  enabledOrganizationIds: z.array(idSchema).default([]),
});

/* ── Tenant auth (spec §§25, 29) ────────────────────────────────────────── */

export const tenantLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const acceptInvitationSchema = z
  .object({
    token: z.string().min(20),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/** `null` selects the all-branch view, which only a cross-branch role may use. */
export const switchBranchSchema = z.object({
  branchId: idSchema.nullable(),
});

/* ── Branches (spec §§27–28, 37) ────────────────────────────────────────── */

/** ISO-8601 weekday numbers, 1 = Monday. */
const workingDaysSchema = z
  .array(z.number().int().min(1).max(7))
  .min(1, "Pick at least one working day")
  .max(7)
  .refine((d) => new Set(d).size === d.length, "Days must be unique");

export const createBranchSchema = z.object({
  name: z.string().trim().min(2, "Enter the branch name").max(140),
  code: codeSchema,
  addressLine: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(2, "Enter the city").max(80),
  state: z.string().trim().min(2, "Enter the state").max(80),
  country: z.string().trim().min(2).max(60).default("India"),
  pincode: z.string().trim().max(12).optional().or(z.literal("")),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  timezone: z.string().trim().min(3).max(60).default("Asia/Kolkata"),
  workingDays: workingDaysSchema.default([1, 2, 3, 4, 5, 6]),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial();

export const branchStatusSchema = z.object({
  status: enumOf(BranchStatus),
  reason: z.string().trim().min(4, "Give a reason — it is recorded in the audit log").max(400),
});

/* ── Branch admins & staff (spec §§29–30) ───────────────────────────────── */

export const createBranchAdminSchema = z.object({
  name: z.string().trim().min(2, "Enter their full name").max(120),
  email: emailSchema,
  phone: phoneSchema.optional(),
  employeeId: z.string().trim().max(40).optional().or(z.literal("")),
  branchId: idSchema,
});
export type CreateBranchAdminInput = z.infer<typeof createBranchAdminSchema>;

export const assignBranchSchema = z.object({
  userId: idSchema,
  branchId: idSchema,
  /** Marks this as the user's operational home branch. */
  isPrimary: z.boolean().default(false),
});

/* ── Transfers (spec §§35, 75) ──────────────────────────────────────────── */

export const transferSchema = z.object({
  entityType: z.enum(["USER"]),
  entityId: idSchema,
  toBranchId: idSchema,
  reason: z.string().trim().min(4, "Give a reason — it is recorded in the audit log").max(400),
});

/* ── Organization profile, tenant side (spec §26) ───────────────────────── */

export const orgProfileSchema = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  website: z.string().trim().url("Enter a valid URL").max(200).optional().or(z.literal("")),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  addressLine: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  country: z.string().trim().max(60).optional(),
  pincode: z.string().trim().max(12).optional().or(z.literal("")),
  timezone: z.string().trim().max(60).optional(),
  logoUrl: z.string().trim().url().max(400).optional().or(z.literal("")),
});

/* ── Academic structure (spec §42, prerequisite for batches) ────────────── */

export const upsertCourseSchema = z.object({
  name: z.string().trim().min(2, "Enter the course name").max(140),
  code: codeSchema,
  targetExam: enumOf(TargetExam).default(TargetExam.NEET),
  durationMonths: z.number().int().min(1).max(120).default(12),
  description: z.string().trim().max(400).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export const upsertSubjectSchema = z.object({
  name: z.string().trim().min(2, "Enter the subject name").max(120),
  code: codeSchema,
  courseId: idSchema.nullable().optional(),
  isActive: z.boolean().default(true),
});

export const upsertAcademicYearSchema = z
  .object({
    name: z.string().trim().min(4, "e.g. 2026-27").max(20),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    isCurrent: z.boolean().default(false),
  })
  .refine((v) => v.startDate < v.endDate, {
    message: "The academic year must end after it starts",
    path: ["endDate"],
  });

/* ── Batches (spec §41) ─────────────────────────────────────────────────── */

export const createBatchSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the batch name").max(120),
    code: codeSchema,
    courseId: idSchema,
    academicYearId: idSchema,
    /** Omitted means the caller's active branch; the API resolves and validates it. */
    branchId: idSchema.optional(),
    capacity: z.number().int().min(1, "Capacity must be at least 1").max(500).default(60),
    room: z.string().trim().max(60).optional().or(z.literal("")),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
  })
  .refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, {
    message: "The batch must end on or after it starts",
    path: ["endDate"],
  });
export type CreateBatchInput = z.infer<typeof createBatchSchema>;

export const updateBatchSchema = createBatchSchema.innerType().partial().omit({ branchId: true });

export const batchStatusSchema = z.object({
  status: enumOf(BatchStatus),
  reason: z.string().trim().max(400).optional(),
});

export const enrolStudentsSchema = z.object({
  studentIds: z.array(idSchema).min(1, "Pick at least one student").max(200),
});

export const assignBatchFacultySchema = z.object({
  facultyId: idSchema,
  subjectId: idSchema,
  isClassTeacher: z.boolean().default(false),
});

/* ── Students (spec §39) ────────────────────────────────────────────────── */

const parentFields = {
  parentName: z.string().trim().max(120).optional().or(z.literal("")),
  parentPhone: phoneSchema.optional(),
  parentEmail: emailSchema.optional(),
  parentRelation: z.string().trim().max(20).optional().or(z.literal("")),
};

export const createStudentSchema = z.object({
  name: z.string().trim().min(2, "Enter the student's name").max(140),
  /** Left blank, the API allocates the next code for the branch. */
  studentCode: codeSchema.optional(),
  dateOfBirth: isoDateSchema.optional(),
  gender: enumOf(Gender).default(Gender.UNDISCLOSED),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  ...parentFields,
  previousSchool: z.string().trim().max(160).optional().or(z.literal("")),
  previousClass: z.string().trim().max(40).optional().or(z.literal("")),
  previousMarks: z.string().trim().max(40).optional().or(z.literal("")),
  targetExam: enumOf(TargetExam).default(TargetExam.NEET),
  courseId: idSchema.nullable().optional(),
  branchId: idSchema.optional(),
  batchId: idSchema.optional(),
  admissionDate: isoDateSchema.optional(),
  addressLine: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  state: z.string().trim().max(80).optional().or(z.literal("")),
  pincode: z.string().trim().max(12).optional().or(z.literal("")),
  photoUrl: z.string().trim().url().max(400).optional().or(z.literal("")),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = createStudentSchema.partial().omit({ branchId: true, batchId: true });

export const studentStatusSchema = z.object({
  status: enumOf(StudentStatus),
  reason: z.string().trim().min(4, "Give a reason — it is recorded in the audit log").max(400),
});

/** Spec §35 — the student transfer flow. */
export const transferStudentSchema = z.object({
  toBranchId: idSchema,
  /** The batch at the destination. Omitted leaves the student unbatched there. */
  toBatchId: idSchema.optional(),
  reason: z.string().trim().min(4, "Give a reason — it is recorded in the audit log").max(400),
});

/* ── Admissions (spec §38) ──────────────────────────────────────────────── */

export const createEnquirySchema = z.object({
  studentName: z.string().trim().min(2, "Enter the student's name").max(140),
  phone: phoneSchema,
  email: emailSchema.optional(),
  parentName: z.string().trim().max(120).optional().or(z.literal("")),
  parentPhone: phoneSchema.optional(),
  targetExam: enumOf(TargetExam).default(TargetExam.NEET),
  courseId: idSchema.nullable().optional(),
  source: enumOf(EnquirySource).default(EnquirySource.WALK_IN),
  branchId: idSchema.optional(),
  assignedToId: idSchema.nullable().optional(),
  nextFollowUpAt: isoDateSchema.optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type CreateEnquiryInput = z.infer<typeof createEnquirySchema>;

export const updateEnquirySchema = createEnquirySchema.partial().omit({ branchId: true });

/** Stage moves carry a note; LOST additionally requires a reason. */
export const moveEnquiryStageSchema = z
  .object({
    stage: enumOf(EnquiryStage),
    note: z.string().trim().max(1000).optional().or(z.literal("")),
    lostReason: z.string().trim().max(400).optional().or(z.literal("")),
    nextFollowUpAt: isoDateSchema.optional(),
  })
  .refine((v) => v.stage !== EnquiryStage.LOST || (v.lostReason && v.lostReason.length >= 4), {
    message: "Say why this enquiry was lost",
    path: ["lostReason"],
  });

export const enquiryActivitySchema = z.object({
  type: z.enum(["NOTE", "CALL", "VISIT", "COUNSELLING", "TRIAL_CLASS", "FOLLOW_UP"]),
  note: z.string().trim().min(1, "Write a note").max(1000),
  scheduledAt: isoDateSchema.optional(),
});

/** Spec §38 — converting an enquiry into a student. */
export const convertEnquirySchema = z.object({
  studentCode: codeSchema.optional(),
  batchId: idSchema.optional(),
  admissionDate: isoDateSchema.optional(),
  dateOfBirth: isoDateSchema.optional(),
  gender: enumOf(Gender).default(Gender.UNDISCLOSED),
});

/* ── Academic tree (spec §42) ───────────────────────────────────────────── */

export const upsertChapterSchema = z.object({
  subjectId: idSchema,
  name: z.string().trim().min(2, "Enter the chapter name").max(160),
  sequence: z.number().int().min(0).max(999).default(0),
  description: z.string().trim().max(400).optional().or(z.literal("")),
  estimatedHours: z.number().int().min(0).max(500).default(0),
  isActive: z.boolean().default(true),
});

export const upsertTopicSchema = z.object({
  chapterId: idSchema,
  name: z.string().trim().min(2, "Enter the topic name").max(160),
  sequence: z.number().int().min(0).max(999).default(0),
  estimatedHours: z.number().int().min(0).max(200).default(1),
  isActive: z.boolean().default(true),
});

/** Reordering sends the whole ordered list, so no index can be skipped or duplicated. */
export const reorderSchema = z.object({
  ids: z.array(idSchema).min(1).max(500),
});

/* ── Syllabus tracking (spec §43) ───────────────────────────────────────── */

export const updateSyllabusProgressSchema = z.object({
  status: enumOf(SyllabusStatus),
  plannedDate: isoDateSchema.nullable().optional(),
  completedDate: isoDateSchema.nullable().optional(),
  facultyId: idSchema.nullable().optional(),
  notes: z.string().trim().max(400).optional().or(z.literal("")),
});

/** Seeds a batch's tracker from its course syllabus. */
export const initSyllabusSchema = z.object({
  subjectIds: z.array(idSchema).optional(),
});

/* ── Academic planning (spec §44) ───────────────────────────────────────── */

export const upsertLessonPlanSchema = z.object({
  batchId: idSchema,
  subjectId: idSchema,
  facultyId: idSchema.nullable().optional(),
  type: enumOf(PlanType).default(PlanType.LESSON),
  status: enumOf(PlanStatusKind).default(PlanStatusKind.DRAFT),
  title: z.string().trim().min(2, "Enter a title").max(160),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  plannedDate: isoDateSchema,
  durationMinutes: z.number().int().min(5).max(600).default(60),
  topicIds: z.array(idSchema).max(50).default([]),
});

/* ── Rooms & timetable (spec §46) ───────────────────────────────────────── */

export const upsertRoomSchema = z.object({
  name: z.string().trim().min(1, "Enter the room name").max(80),
  code: codeSchema,
  capacity: z.number().int().min(1).max(1000).default(60),
  branchId: idSchema.optional(),
  isActive: z.boolean().default(true),
});

/** HH:MM, 24-hour. Converted to minutes-from-midnight by the API. */
export const clockSchema = z
  .string()
  .trim()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 09:30");

const slotBase = {
  batchId: idSchema,
  subjectId: idSchema,
  facultyId: idSchema,
  roomId: idSchema.nullable().optional(),
  /** ISO-8601 weekday, 1 = Monday. */
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: clockSchema,
  endTime: clockSchema,
  effectiveFrom: isoDateSchema,
  effectiveTo: isoDateSchema.nullable().optional(),
};

const withTimeOrder = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .refine((v: any) => !v.startTime || !v.endTime || v.startTime < v.endTime, {
      message: "The class must end after it starts",
      path: ["endTime"],
    })
    .refine((v: any) => !v.effectiveFrom || !v.effectiveTo || v.effectiveFrom <= v.effectiveTo, {
      message: "The end date must fall on or after the start date",
      path: ["effectiveTo"],
    });

export const createTimetableSlotSchema = withTimeOrder(z.object(slotBase));
export const updateTimetableSlotSchema = withTimeOrder(z.object(slotBase).partial());

export const slotStatusSchema = z.object({ status: enumOf(SlotStatus) });

/**
 * Materialises dated sessions from the weekly grid. Bounded to a term-sized
 * window so one call cannot generate an unbounded number of rows.
 */
export const generateSessionsSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    batchId: idSchema.optional(),
    /** Replace existing generated sessions in the window instead of skipping them. */
    replace: z.boolean().default(false),
  })
  .refine((v) => v.from <= v.to, {
    message: "The end date must fall on or after the start date",
    path: ["to"],
  });

export const updateSessionSchema = z.object({
  status: enumOf(SessionStatus).optional(),
  facultyId: idSchema.optional(),
  roomId: idSchema.nullable().optional(),
  date: isoDateSchema.optional(),
  startTime: clockSchema.optional(),
  endTime: clockSchema.optional(),
  cancelReason: z.string().trim().max(400).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

/* ── Attendance (spec §47) ──────────────────────────────────────────────── */

export const markAttendanceSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: idSchema,
        status: enumOf(AttendanceStatus),
        minutesLate: z.number().int().min(0).max(600).nullable().optional(),
        note: z.string().trim().max(300).optional().or(z.literal("")),
      }),
    )
    .min(1, "Mark at least one student")
    .max(500),
});

export const attendanceRangeSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    batchId: idSchema.optional(),
    studentId: idSchema.optional(),
  })
  .refine((v) => v.from <= v.to, {
    message: "The end date must fall on or after the start date",
    path: ["to"],
  });

/* ── Leave (spec §48) ───────────────────────────────────────────────────── */

export const createLeaveSchema = z
  .object({
    subjectType: enumOf(LeaveSubject),
    /** Exactly one of these, matching subjectType. */
    studentId: idSchema.optional(),
    facultyId: idSchema.optional(),
    fromDate: isoDateSchema,
    toDate: isoDateSchema,
    reason: z.string().trim().min(4, "Give a reason").max(600),
  })
  .refine((v) => v.fromDate <= v.toDate, {
    message: "The end date must fall on or after the start date",
    path: ["toDate"],
  })
  .refine((v) => (v.subjectType === "STUDENT" ? Boolean(v.studentId) : Boolean(v.facultyId)), {
    message: "Pick who the leave is for",
    path: ["studentId"],
  });

export const reviewLeaveSchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED"]),
    reviewNote: z.string().trim().max(400).optional().or(z.literal("")),
  })
  .refine((v) => v.status !== "REJECTED" || (v.reviewNote && v.reviewNote.length >= 4), {
    message: "Say why the request was rejected",
    path: ["reviewNote"],
  });

/* ── Communication (spec §49) ───────────────────────────────────────────── */

export const upsertAnnouncementSchema = z
  .object({
    title: z.string().trim().min(3, "Enter a title").max(160),
    body: z.string().trim().min(3, "Write the message").max(4000),
    audience: enumOf(AnnouncementAudience).default(AnnouncementAudience.BRANCH),
    /** Required for BRANCH; ignored for ALL_BRANCHES. */
    branchIds: z.array(idSchema).max(100).default([]),
    batchId: idSchema.nullable().optional(),
    courseId: idSchema.nullable().optional(),
    pinnedUntil: isoDateSchema.nullable().optional(),
  })
  .refine((v) => v.audience !== "BATCH" || Boolean(v.batchId), {
    message: "Pick the batch this is for",
    path: ["batchId"],
  })
  .refine((v) => v.audience !== "COURSE" || Boolean(v.courseId), {
    message: "Pick the course this is for",
    path: ["courseId"],
  });

export const publishAnnouncementSchema = z.object({
  status: enumOf(AnnouncementStatus),
});

/* ── Question bank (spec §51) ───────────────────────────────────────────── */

const optionSchema = z.object({
  label: z.string().trim().min(1).max(4),
  body: z.string().trim().min(1, "Enter the option text").max(2000),
  isCorrect: z.boolean().default(false),
});

export const upsertQuestionSchema = z
  .object({
    subjectId: idSchema,
    chapterId: idSchema.nullable().optional(),
    topicId: idSchema.nullable().optional(),
    /** Omit for an organization-wide question; set for a branch-private one. */
    branchId: idSchema.nullable().optional(),
    type: enumOf(QuestionType).default(QuestionType.SINGLE_CHOICE),
    difficulty: enumOf(Difficulty).default(Difficulty.MEDIUM),
    body: z.string().trim().min(3, "Write the question").max(4000),
    explanation: z.string().trim().max(4000).optional().or(z.literal("")),
    marks: z.number().min(0.25).max(100).default(4),
    negativeMarks: z.number().min(0).max(100).default(1),
    options: z.array(optionSchema).max(8).default([]),
    numericAnswer: z.number().nullable().optional(),
    numericTolerance: z.number().min(0).max(1000).default(0),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.type === "NUMERIC") {
      if (v.numericAnswer === null || v.numericAnswer === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["numericAnswer"], message: "Enter the correct value" });
      }
      return;
    }

    // Choice questions need enough options and exactly the right number of keys.
    if (v.options.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Add at least two options" });
      return;
    }
    const correct = v.options.filter((o) => o.isCorrect).length;
    if (correct === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Mark the correct option" });
    }
    if (v.type !== "MULTIPLE_CHOICE" && correct > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Only one option can be correct for this question type",
      });
    }
    if (v.type === "TRUE_FALSE" && v.options.length !== 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "A true/false question needs exactly two options" });
    }
  });
export type UpsertQuestionInput = z.infer<typeof upsertQuestionSchema>;

/* ── Tests (spec §52) ───────────────────────────────────────────────────── */

export const createTestSchema = z
  .object({
    title: z.string().trim().min(3, "Enter a title").max(180),
    code: codeSchema,
    description: z.string().trim().max(1000).optional().or(z.literal("")),
    scope: enumOf(TestScope).default(TestScope.BRANCH),
    mode: enumOf(TestMode).default(TestMode.ONLINE),
    courseId: idSchema.nullable().optional(),
    /** Required for MULTI_BRANCH and BRANCH; ignored for ORGANIZATION. */
    branchIds: z.array(idSchema).max(100).default([]),
    batchIds: z.array(idSchema).min(1, "Pick at least one batch").max(100),
    durationMinutes: z.number().int().min(5).max(600).default(180),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    negativeMarking: z.boolean().default(true),
    shuffleQuestions: z.boolean().default(false),
    instantResults: z.boolean().default(false),
  })
  .refine((v) => v.startAt < v.endAt, {
    message: "The test must close after it opens",
    path: ["endAt"],
  })
  .refine((v) => v.scope === "ORGANIZATION" || v.branchIds.length > 0, {
    message: "Pick at least one branch",
    path: ["branchIds"],
  })
  .refine((v) => v.scope !== "BRANCH" || v.branchIds.length === 1, {
    message: "A single-branch test targets exactly one branch",
    path: ["branchIds"],
  });
export type CreateTestInput = z.infer<typeof createTestSchema>;

export const updateTestSchema = createTestSchema.innerType().innerType().innerType().partial();

export const testStatusSchema = z.object({
  status: enumOf(TestStatus),
  reason: z.string().trim().max(400).optional().or(z.literal("")),
});

export const setTestQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        questionId: idSchema,
        marks: z.number().min(0.25).max(100),
        negativeMarks: z.number().min(0).max(100).default(0),
      }),
    )
    .min(1, "Add at least one question")
    .max(300),
});

/* ── Attempts (spec §53) ────────────────────────────────────────────────── */

export const startAttemptSchema = z.object({ studentId: idSchema });

/**
 * Auto-save payload. Sent repeatedly while the student works, so it must be
 * cheap and idempotent — the server overwrites the answer for each question.
 */
export const saveAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: idSchema,
        selectedOptionIds: z.array(idSchema).max(8).default([]),
        numericAnswer: z.number().nullable().optional(),
        timeSpentSeconds: z.number().int().min(0).max(86_400).default(0),
      }),
    )
    .max(300),
});

/**
 * Manual score entry for an OFFLINE (OMR / paper) test — there is no attempt
 * engine to compute these, so a staff member enters the outcome directly.
 */
export const recordOfflineScoresSchema = z.object({
  scores: z
    .array(
      z.object({
        studentId: idSchema,
        score: z.number().min(0),
        correctCount: z.number().int().min(0).default(0),
        wrongCount: z.number().int().min(0).default(0),
        unattemptedCount: z.number().int().min(0).default(0),
      }),
    )
    .min(1, "Enter at least one score")
    .max(500),
});

/* ── Homework (spec §58) ────────────────────────────────────────────────── */

export const createHomeworkSchema = z
  .object({
    title: z.string().trim().min(3, "Enter a title").max(160),
    instructions: z.string().trim().min(3, "Enter instructions").max(4000),
    subjectId: idSchema.nullable().optional(),
    audience: enumOf(HomeworkAudience).default(HomeworkAudience.BATCH),
    branchIds: z.array(idSchema).max(100).default([]),
    batchId: idSchema.nullable().optional(),
    studentIds: z.array(idSchema).max(500).default([]),
    dueAt: z.string().datetime({ offset: true }),
    maxMarks: z.number().min(0).max(1000).nullable().optional(),
    attachmentUrl: z.string().trim().url("Enter a valid URL").max(400).optional().or(z.literal("")),
  })
  .refine((v) => v.audience !== "BATCH" || v.batchId, { message: "Pick a batch", path: ["batchId"] })
  .refine((v) => v.audience !== "STUDENTS" || v.studentIds.length > 0, {
    message: "Pick at least one student",
    path: ["studentIds"],
  })
  .refine((v) => !["BRANCH", "MULTI_BRANCH"].includes(v.audience) || v.branchIds.length > 0, {
    message: "Pick at least one branch",
    path: ["branchIds"],
  });
export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;

export const homeworkStatusSchema = z.object({ status: enumOf(HomeworkStatus) });

export const markSubmissionSchema = z.object({
  status: enumOf(SubmissionStatus),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const gradeSubmissionSchema = z.object({
  marksAwarded: z.number().min(0).max(1000).nullable(),
  feedback: z.string().trim().max(2000).optional().or(z.literal("")),
});

/* ── Study materials (spec §60) ─────────────────────────────────────────── */

export const createStudyMaterialSchema = z
  .object({
    title: z.string().trim().min(3, "Enter a title").max(160),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    subjectId: idSchema.nullable().optional(),
    audience: enumOf(MaterialAudience).default(MaterialAudience.BATCH),
    branchIds: z.array(idSchema).max(100).default([]),
    batchId: idSchema.nullable().optional(),
    studentIds: z.array(idSchema).max(500).default([]),
    fileUrl: z.string().trim().url("Enter a valid URL").max(400),
  })
  .refine((v) => v.audience !== "BATCH" || v.batchId, { message: "Pick a batch", path: ["batchId"] })
  .refine((v) => v.audience !== "STUDENTS" || v.studentIds.length > 0, {
    message: "Pick at least one student",
    path: ["studentIds"],
  })
  .refine((v) => !["BRANCH", "MULTI_BRANCH"].includes(v.audience) || v.branchIds.length > 0, {
    message: "Pick at least one branch",
    path: ["branchIds"],
  });
export type CreateStudyMaterialInput = z.infer<typeof createStudyMaterialSchema>;

/* ── Doubts (spec §59) ──────────────────────────────────────────────────── */

export const createDoubtSchema = z.object({
  studentId: idSchema,
  subjectId: idSchema,
  question: z.string().trim().min(3, "Describe the doubt").max(2000),
  assignedToId: idSchema.nullable().optional(),
});

export const replyDoubtSchema = z.object({
  body: z.string().trim().min(1, "Enter a reply").max(2000),
  /** Answering a doubt via a reply is optional — a reply can also just be a follow-up question. */
  resolve: z.boolean().default(false),
});

export const assignDoubtSchema = z.object({ assignedToId: idSchema.nullable() });

export const doubtStatusSchema = z.object({ status: enumOf(DoubtStatus) });

/* ── Fees (spec §61) ────────────────────────────────────────────────────── */

export const createFeeStructureSchema = z.object({
  name: z.string().trim().min(3, "Enter a name").max(120),
  description: z.string().trim().max(600).optional().or(z.literal("")),
  /** Null is organization-wide — reusable by every branch. */
  branchId: idSchema.nullable().optional(),
  courseId: idSchema.nullable().optional(),
  academicYearId: idSchema.nullable().optional(),
  components: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Name the component").max(120),
        amountMinor: minorAmountSchema.refine((v) => v > 0, "Enter an amount"),
        isOptional: z.boolean().default(false),
      }),
    )
    .min(1, "Add at least one component")
    .max(40),
});
export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>;

/**
 * Assigning a structure copies its numbers onto the student, so later edits to
 * the template never restate what an existing student already owes.
 */
export const assignFeeSchema = z.object({
  studentId: idSchema,
  feeStructureId: idSchema,
  note: z.string().trim().max(600).optional().or(z.literal("")),
  /** Optional schedule; omitted means the whole amount is due at once. */
  installments: z
    .array(
      z.object({
        label: z.string().trim().min(1, "Name the installment").max(80),
        amountMinor: minorAmountSchema.refine((v) => v > 0, "Enter an amount"),
        dueDate: isoDateSchema,
      }),
    )
    .max(24)
    .default([]),
});
export type AssignFeeInput = z.infer<typeof assignFeeSchema>;

export const grantConcessionSchema = z.object({
  kind: enumOf(ConcessionKind).default(ConcessionKind.DISCOUNT),
  amountMinor: minorAmountSchema.refine((v) => v > 0, "Enter an amount"),
  reason: z.string().trim().min(3, "Say why").max(400),
});

/* ── Payments (spec §62) ────────────────────────────────────────────────── */

export const recordFeePaymentSchema = z.object({
  studentFeeId: idSchema,
  amountMinor: minorAmountSchema.refine((v) => v > 0, "Enter an amount"),
  method: enumOf(PaymentMethod).default(PaymentMethod.CASH),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
  note: z.string().trim().max(400).optional().or(z.literal("")),
  paidAt: z.string().datetime({ offset: true }).optional(),
});
export type RecordFeePaymentInput = z.infer<typeof recordFeePaymentSchema>;

export const refundFeePaymentSchema = z.object({
  amountMinor: minorAmountSchema.refine((v) => v > 0, "Enter an amount"),
  reason: z.string().trim().min(3, "Say why").max(400),
});

/* ── Expenses (spec §63) ────────────────────────────────────────────────── */

export const createExpenseSchema = z.object({
  /** Null is a central organization cost, not a branch's. */
  branchId: idSchema.nullable().optional(),
  category: enumOf(ExpenseCategory).default(ExpenseCategory.OTHER),
  title: z.string().trim().min(3, "Enter a title").max(160),
  description: z.string().trim().max(600).optional().or(z.literal("")),
  amountMinor: minorAmountSchema.refine((v) => v > 0, "Enter an amount"),
  incurredOn: isoDateSchema,
  vendor: z.string().trim().max(160).optional().or(z.literal("")),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const expenseStatusSchema = z.object({
  status: enumOf(ExpenseStatus),
  reason: z.string().trim().max(400).optional().or(z.literal("")),
});

/* ── Portal access (spec §65) ───────────────────────────────────────────── */

/**
 * Inviting a guardian. If the email already belongs to a PARENT in this
 * organization the existing login is reused, so one parent with two children
 * here is one account with two links — which is what the child switcher needs.
 */
export const inviteGuardianSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  email: emailSchema,
  phone: phoneSchema.optional().or(z.literal("")),
  relation: z.string().trim().min(2, "Say how they are related").max(40),
  isPrimary: z.boolean().default(false),
});
export type InviteGuardianInput = z.infer<typeof inviteGuardianSchema>;

/* ── Hostel (spec §66) ──────────────────────────────────────────────────── */

export const createHostelSchema = z.object({
  /** Null is a centralised hostel serving every branch. */
  branchId: idSchema.nullable().optional(),
  name: z.string().trim().min(2, "Enter a name").max(120),
  code: codeSchema,
  occupancy: enumOf(HostelOccupancy).default(HostelOccupancy.MIXED),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  wardenName: z.string().trim().max(120).optional().or(z.literal("")),
  wardenPhone: phoneSchema.optional().or(z.literal("")),
  rooms: z
    .array(
      z.object({
        roomNumber: z.string().trim().min(1, "Number the room").max(24),
        floor: z.string().trim().max(24).optional().or(z.literal("")),
        capacity: z.number().int().min(1).max(20).default(2),
      }),
    )
    .max(200)
    .default([]),
});
export type CreateHostelInput = z.infer<typeof createHostelSchema>;

export const addHostelRoomSchema = z.object({
  roomNumber: z.string().trim().min(1, "Number the room").max(24),
  floor: z.string().trim().max(24).optional().or(z.literal("")),
  capacity: z.number().int().min(1).max(20).default(2),
});

export const allocateHostelSchema = z.object({
  studentId: idSchema,
  roomId: idSchema,
});

export const endAllocationSchema = z.object({
  reason: z.string().trim().max(300).optional().or(z.literal("")),
});

/* ── Transport (spec §67) ───────────────────────────────────────────────── */

export const createVehicleSchema = z.object({
  branchId: idSchema.nullable().optional(),
  registration: z.string().trim().min(4, "Enter the registration").max(24).toUpperCase(),
  model: z.string().trim().max(80).optional().or(z.literal("")),
  capacity: z.number().int().min(1).max(120).default(30),
  driverName: z.string().trim().max(120).optional().or(z.literal("")),
  driverPhone: phoneSchema.optional().or(z.literal("")),
  driverLicence: z.string().trim().max(40).optional().or(z.literal("")),
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const vehicleStatusSchema = z.object({ status: enumOf(VehicleStatus) });

export const createRouteSchema = z.object({
  branchId: idSchema.nullable().optional(),
  vehicleId: idSchema.nullable().optional(),
  name: z.string().trim().min(2, "Enter a name").max(120),
  code: codeSchema,
  fareMinor: minorAmountSchema.default(0),
  stops: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Name the stop").max(120),
        landmark: z.string().trim().max(160).optional().or(z.literal("")),
        pickupTime: clockSchema,
        dropTime: clockSchema.nullable().optional(),
      }),
    )
    .min(1, "Add at least one stop")
    .max(60),
});
export type CreateRouteInput = z.infer<typeof createRouteSchema>;

export const allocateTransportSchema = z.object({
  studentId: idSchema,
  routeId: idSchema,
  stopId: idSchema,
});

/* ── Mess (spec §68) ────────────────────────────────────────────────────── */

export const createMessPlanSchema = z.object({
  branchId: idSchema.nullable().optional(),
  name: z.string().trim().min(2, "Enter a name").max(120),
  description: z.string().trim().max(600).optional().or(z.literal("")),
  monthlyFareMinor: minorAmountSchema.default(0),
});
export type CreateMessPlanInput = z.infer<typeof createMessPlanSchema>;

export const subscribeMessSchema = z.object({
  studentId: idSchema,
  messPlanId: idSchema,
});

export { z };
