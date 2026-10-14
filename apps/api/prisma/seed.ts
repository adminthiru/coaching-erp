/**
 * Seeds the platform with the four plans from spec §13, a Platform Owner, and a
 * small set of demo organizations spanning the statuses the console must render.
 *
 * Idempotent: re-running updates rather than duplicating, so it is safe against a
 * database that already holds data.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? 'owner@acadia.dev';
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? 'ChangeMe!2026';

const day = 864e5;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * day);

const PLANS: Array<Prisma.PlanCreateInput & { slug: string }> = [
  {
    name: 'Free', slug: 'free', description: 'Evaluate Acadia with a single branch.',
    monthlyPriceMinor: 0, annualPriceMinor: 0, trialDays: 0, status: 'ACTIVE', sortOrder: 0,
    features: ['students', 'attendance', 'fees'],
    limits: { students: 50, branches: 1, faculty: 5, admin_users: 2, storage_mb: 512, messages: 100, tests: 10, questions: 200 },
  },
  {
    name: 'Starter', slug: 'starter', description: 'A single branch running day-to-day operations.',
    monthlyPriceMinor: 299_00, annualPriceMinor: 2_990_00, trialDays: 14, status: 'ACTIVE', sortOrder: 1,
    features: ['students', 'attendance', 'fees', 'tests', 'homework', 'communication', 'study_materials'],
    limits: { students: 300, branches: 1, faculty: 20, admin_users: 3, storage_mb: 5_120, messages: 2_000, tests: 100, questions: 5_000 },
  },
  {
    name: 'Professional', slug: 'professional', description: 'Multi-branch coaching with analytics and online tests.',
    monthlyPriceMinor: 999_00, annualPriceMinor: 9_990_00, trialDays: 14, status: 'ACTIVE', sortOrder: 2,
    features: [
      'students', 'branches', 'attendance', 'fees', 'tests', 'question_bank', 'online_tests',
      'analytics', 'communication', 'sms', 'study_materials', 'homework', 'doubts', 'advanced_reports',
    ],
    limits: { students: 2_000, branches: 5, faculty: 100, admin_users: 10, storage_mb: 51_200, messages: 20_000, tests: 1_000, questions: 50_000 },
  },
  {
    name: 'Enterprise', slug: 'enterprise', description: 'Unlimited branches, every module, AI insights.',
    monthlyPriceMinor: 2_499_00, annualPriceMinor: 24_990_00, trialDays: 30, status: 'ACTIVE', sortOrder: 3,
    features: [
      'students', 'branches', 'attendance', 'fees', 'tests', 'question_bank', 'online_tests',
      'analytics', 'communication', 'whatsapp', 'sms', 'study_materials', 'homework', 'doubts',
      'hostel', 'transport', 'ai_insights', 'advanced_reports',
    ],
    // null = unlimited
    limits: { students: null, branches: null, faculty: null, admin_users: null, storage_mb: 512_000, messages: null, tests: null, questions: null },
  },
];

async function main() {
  console.log('Seeding platform…');

  /* Plans */
  const plans = new Map<string, string>();
  for (const p of PLANS) {
    const plan = await prisma.plan.upsert({
      where: { slug: p.slug },
      create: p,
      update: {
        name: p.name, description: p.description, monthlyPriceMinor: p.monthlyPriceMinor,
        annualPriceMinor: p.annualPriceMinor, trialDays: p.trialDays, features: p.features,
        limits: p.limits, status: p.status, sortOrder: p.sortOrder,
      },
    });
    plans.set(p.slug, plan.id);
  }
  console.log(`  ${plans.size} plans`);

  /* Platform owner */
  const owner = await prisma.platformUser.upsert({
    where: { email: OWNER_EMAIL },
    create: {
      name: 'Platform Owner',
      email: OWNER_EMAIL,
      role: 'PLATFORM_OWNER',
      passwordHash: await argon2.hash(OWNER_PASSWORD, { type: argon2.argon2id }),
    },
    update: {},
  });
  console.log(`  owner ${owner.email}`);

  /* Support admin, so role restrictions are exercisable */
  await prisma.platformUser.upsert({
    where: { email: 'support@acadia.dev' },
    create: {
      name: 'Sana Iqbal',
      email: 'support@acadia.dev',
      role: 'SUPPORT_ADMIN',
      passwordHash: await argon2.hash(OWNER_PASSWORD, { type: argon2.argon2id }),
    },
    update: {},
  });

  /* Coupons */
  await prisma.coupon.upsert({
    where: { code: 'LAUNCH25' },
    create: { code: 'LAUNCH25', description: '25% off the first payment', type: 'PERCENTAGE', duration: 'FIRST_PAYMENT', value: 25, maxRedemptions: 100, isActive: true },
    update: {},
  });
  await prisma.coupon.upsert({
    where: { code: 'EXTEND14' },
    create: { code: 'EXTEND14', description: 'Adds 14 trial days', type: 'TRIAL_EXTENSION', duration: 'ONE_TIME', value: 14, maxRedemptions: null, isActive: true },
    update: {},
  });

  /* Feature flags */
  await prisma.featureFlag.upsert({
    where: { key: 'ai_insights_v2' },
    create: { key: 'ai_insights_v2', description: 'Next-generation AI student insights', enabledGlobally: false },
    update: {},
  });

  /* Demo organizations across the status spectrum */
  const now = new Date();
  const demos = [
    { name: 'ABC NEET & JEE Academy', slug: 'abc-academy', plan: 'professional', status: 'ACTIVE' as const, owner: 'Ramesh Iyer', city: 'Chennai', state: 'Tamil Nadu', branches: 3, students: 1_842, faculty: 64 },
    { name: 'Vidya Classes', slug: 'vidya-classes', plan: 'starter', status: 'TRIAL' as const, owner: 'Anil Kulkarni', city: 'Pune', state: 'Maharashtra', branches: 1, students: 214, faculty: 11, trialDays: 6 },
    { name: 'Pinnacle Foundation', slug: 'pinnacle-foundation', plan: 'enterprise', status: 'ACTIVE' as const, owner: 'Meera Nair', city: 'Kochi', state: 'Kerala', branches: 8, students: 6_310, faculty: 190 },
    { name: 'Sunrise Tutorials', slug: 'sunrise-tutorials', plan: 'starter', status: 'PAYMENT_DUE' as const, owner: 'Vikram Shah', city: 'Ahmedabad', state: 'Gujarat', branches: 1, students: 288, faculty: 14 },
    { name: 'Apex Medical Coaching', slug: 'apex-medical', plan: 'professional', status: 'SUSPENDED' as const, owner: 'Priya Menon', city: 'Hyderabad', state: 'Telangana', branches: 2, students: 940, faculty: 33 },
    { name: 'Nova Learning Hub', slug: 'nova-learning', plan: 'free', status: 'TRIAL' as const, owner: 'Deepak Rao', city: 'Bengaluru', state: 'Karnataka', branches: 1, students: 38, faculty: 3, trialDays: 12 },
  ];

  for (const [i, d] of demos.entries()) {
    const planId = plans.get(d.plan)!;
    const createdAt = addDays(now, -(90 - i * 12));
    const trialEndsAt = d.status === 'TRIAL' ? addDays(now, d.trialDays ?? 10) : null;

    const org = await prisma.organization.upsert({
      where: { slug: d.slug },
      create: {
        name: d.name, slug: d.slug, status: d.status,
        ownerName: d.owner,
        ownerEmail: `${d.slug.split('-')[0]}@example.com`,
        ownerPhone: `+9198${String(40000000 + i * 111111).slice(0, 8)}`,
        city: d.city, state: d.state, createdAt, lastActiveAt: addDays(now, -i),
        trialEndsAt,
      },
      update: { status: d.status, trialEndsAt },
    });

    // Real Branch rows, not just a counter: the platform dashboard counts the
    // branches table while per-organization usage reads the counter, and the two
    // must agree. Phase 1 creates these through the onboarding flow instead.
    const cities: [string, string][] = [
      [d.city, d.state], ['Salem', 'Tamil Nadu'], ['Bengaluru', 'Karnataka'],
      ['Coimbatore', 'Tamil Nadu'], ['Madurai', 'Tamil Nadu'], ['Trichy', 'Tamil Nadu'],
      ['Vellore', 'Tamil Nadu'], ['Erode', 'Tamil Nadu'],
    ];
    for (let b = 0; b < d.branches; b++) {
      const [city, state] = cities[b % cities.length];
      const code = `${d.slug.split('-')[0].toUpperCase().slice(0, 6)}${b + 1}`;
      await prisma.branch.upsert({
        where: { organizationId_code: { organizationId: org.id, code } },
        create: {
          organizationId: org.id,
          name: b === 0 ? `${city} (Main)` : `${city} Branch`,
          code,
          city,
          state,
          status: 'ACTIVE',
          openedAt: createdAt,
        },
        update: {},
      });
    }

    await prisma.organizationUsage.upsert({
      where: { organizationId: org.id },
      create: { organizationId: org.id, branches: d.branches, students: d.students, faculty: d.faculty, adminUsers: 1 + d.branches },
      update: { branches: d.branches, students: d.students, faculty: d.faculty, adminUsers: 1 + d.branches },
    });

    await prisma.orgUser.upsert({
      where: { organizationId_email: { organizationId: org.id, email: `${d.slug.split('-')[0]}@example.com` } },
      create: {
        organizationId: org.id, name: d.owner, email: `${d.slug.split('-')[0]}@example.com`,
        role: 'ORG_OWNER', invitedAt: createdAt, acceptedAt: createdAt,
      },
      update: {},
    });

    const existing = await prisma.subscription.findFirst({ where: { organizationId: org.id } });
    if (!existing) {
      const sub = await prisma.subscription.create({
        data: {
          organizationId: org.id, planId,
          status: d.status === 'TRIAL' ? 'TRIAL' : d.status === 'PAYMENT_DUE' ? 'PAYMENT_DUE' : d.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
          billingCycle: 'MONTHLY',
          currentPeriodStart: createdAt,
          currentPeriodEnd: trialEndsAt ?? addDays(now, 30 - i),
          trialEndsAt,
        },
      });
      await prisma.subscriptionEvent.create({
        data: { subscriptionId: sub.id, type: 'created', toStatus: sub.status, metadata: { seeded: true } },
      });

      // Paying organizations get a short invoice + payment history so revenue
      // charts and the MRR figure have something real to render.
      if (d.status === 'ACTIVE') {
        const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
        for (let m = 3; m >= 1; m--) {
          const periodStart = addDays(now, -30 * m);
          const periodEnd = addDays(now, -30 * (m - 1));
          const count = await prisma.invoice.count();
          const invoice = await prisma.invoice.create({
            data: {
              number: `ACD-${now.getUTCFullYear()}-${String(count + 1).padStart(6, '0')}`,
              organizationId: org.id, subscriptionId: sub.id, planId,
              billingCycle: 'MONTHLY', periodStart, periodEnd,
              subtotalMinor: plan.monthlyPriceMinor,
              totalMinor: plan.monthlyPriceMinor,
              amountPaidMinor: plan.monthlyPriceMinor,
              status: 'PAID', issuedAt: periodStart, dueAt: periodEnd, paidAt: addDays(periodStart, 2),
            },
          });
          await prisma.payment.create({
            data: {
              organizationId: org.id, invoiceId: invoice.id,
              amountMinor: plan.monthlyPriceMinor, method: 'UPI', status: 'SUCCEEDED',
              reference: `UPI${Date.now().toString().slice(-8)}${m}`, paidAt: addDays(periodStart, 2),
            },
          });
        }
      }
    }

    if (trialEndsAt) {
      const hasTrialEvent = await prisma.trialEvent.findFirst({ where: { organizationId: org.id, type: 'START' } });
      if (!hasTrialEvent) {
        await prisma.trialEvent.create({
          data: { organizationId: org.id, type: 'START', days: d.trialDays ?? 10, newEndsAt: trialEndsAt },
        });
      }
    }
  }
  console.log(`  ${demos.length} demo organizations`);

  /* Tenant sign-ins — Phase 1 needs real people with passwords.
     ABC Academy gets an owner (cross-branch) and a Chennai-only branch admin, so
     branch isolation is demonstrable rather than theoretical. */
  const tenantPassword = await argon2.hash(OWNER_PASSWORD, { type: argon2.argon2id });
  const abcOrg = await prisma.organization.findUnique({ where: { slug: 'abc-academy' } });

  if (abcOrg) {
    await prisma.orgUser.update({
      where: { organizationId_email: { organizationId: abcOrg.id, email: 'abc@example.com' } },
      data: { passwordHash: tenantPassword, acceptedAt: now, isActive: true },
    });

    const abcBranches = await prisma.branch.findMany({
      where: { organizationId: abcOrg.id },
      orderBy: { code: 'asc' },
    });
    const chennai = abcBranches.find((b) => b.code === 'ABC1');

    if (chennai) {
      const admin = await prisma.orgUser.upsert({
        where: { organizationId_email: { organizationId: abcOrg.id, email: 'chennai.admin@example.com' } },
        create: {
          organizationId: abcOrg.id,
          name: 'Lakshmi Raman',
          email: 'chennai.admin@example.com',
          phone: '+919876500001',
          employeeId: 'EMP-0001',
          role: 'BRANCH_ADMIN',
          passwordHash: tenantPassword,
          invitedAt: now,
          acceptedAt: now,
        },
        update: { passwordHash: tenantPassword, acceptedAt: now },
      });

      await prisma.branchUser.upsert({
        where: { userId_branchId: { userId: admin.id, branchId: chennai.id } },
        create: { userId: admin.id, branchId: chennai.id, isPrimary: true },
        update: { endedAt: null, isPrimary: true },
      });

      // A faculty member spanning two branches (spec §40).
      const salem = abcBranches.find((b) => b.code === 'ABC2');
      if (salem) {
        const faculty = await prisma.orgUser.upsert({
          where: { organizationId_email: { organizationId: abcOrg.id, email: 'physics@example.com' } },
          create: {
            organizationId: abcOrg.id,
            name: 'Suresh Babu',
            email: 'physics@example.com',
            employeeId: 'EMP-0002',
            role: 'FACULTY',
            passwordHash: tenantPassword,
            invitedAt: now,
            acceptedAt: now,
          },
          update: {},
        });
        for (const [i, b] of [chennai, salem].entries()) {
          await prisma.branchUser.upsert({
            where: { userId_branchId: { userId: faculty.id, branchId: b.id } },
            create: { userId: faculty.id, branchId: b.id, isPrimary: i === 0 },
            update: { endedAt: null },
          });
        }
      }
    }

    // Branches with an admin are operational.
    await prisma.branch.updateMany({
      where: { organizationId: abcOrg.id, status: 'SETUP_REQUIRED' },
      data: { status: 'ACTIVE' },
    });
  }

  /* Phase 2 — academic structure, batches, students and a live admissions pipeline
     for ABC Academy, so the ERP has something real to operate on. */
  if (abcOrg) {
    const year = await prisma.academicYear.upsert({
      where: { organizationId_name: { organizationId: abcOrg.id, name: '2026-27' } },
      create: {
        organizationId: abcOrg.id, name: '2026-27',
        startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), isCurrent: true,
      },
      update: { isCurrent: true },
    });

    const courseSpecs = [
      { name: 'NEET Two-Year', code: 'NEET2Y', targetExam: 'NEET' as const, durationMonths: 24 },
      { name: 'JEE Two-Year', code: 'JEE2Y', targetExam: 'JEE_MAIN' as const, durationMonths: 24 },
      { name: 'Foundation IX-X', code: 'FND910', targetExam: 'FOUNDATION' as const, durationMonths: 12 },
    ];
    const courses = new Map<string, string>();
    for (const c of courseSpecs) {
      const row = await prisma.course.upsert({
        where: { organizationId_code: { organizationId: abcOrg.id, code: c.code } },
        create: { organizationId: abcOrg.id, ...c },
        update: {},
      });
      courses.set(c.code, row.id);
    }

    for (const sub of [
      { name: 'Physics', code: 'PHY' }, { name: 'Chemistry', code: 'CHEM' },
      { name: 'Biology', code: 'BIO' }, { name: 'Mathematics', code: 'MATH' },
    ]) {
      await prisma.subject.upsert({
        where: { organizationId_code: { organizationId: abcOrg.id, code: sub.code } },
        create: { organizationId: abcOrg.id, ...sub },
        update: {},
      });
    }

    const abcBranchRows = await prisma.branch.findMany({
      where: { organizationId: abcOrg.id }, orderBy: { code: 'asc' },
    });
    const chennaiB = abcBranchRows.find((b) => b.code === 'ABC1')!;
    const salemB = abcBranchRows.find((b) => b.code === 'ABC2')!;

    const batchSpecs = [
      { code: 'XII-A-NEET', name: 'XII-A · NEET', branch: chennaiB, course: 'NEET2Y', capacity: 60 },
      { code: 'XII-B-JEE', name: 'XII-B · JEE', branch: chennaiB, course: 'JEE2Y', capacity: 50 },
      { code: 'X-C-FND', name: 'X-C · Foundation', branch: chennaiB, course: 'FND910', capacity: 40 },
      { code: 'SLM-XII-NEET', name: 'XII · NEET', branch: salemB, course: 'NEET2Y', capacity: 45 },
    ];
    const batches = new Map<string, { id: string; branchId: string }>();
    for (const b of batchSpecs) {
      const row = await prisma.batch.upsert({
        where: { organizationId_code: { organizationId: abcOrg.id, code: b.code } },
        create: {
          organizationId: abcOrg.id, branchId: b.branch.id, courseId: courses.get(b.course)!,
          academicYearId: year.id, name: b.name, code: b.code, capacity: b.capacity,
          status: 'ACTIVE', room: `Room ${b.code.slice(0, 3)}`, startDate: new Date('2026-04-15'),
        },
        update: { status: 'ACTIVE' },
      });
      batches.set(b.code, { id: row.id, branchId: b.branch.id });
    }

    // Faculty teaching assignments (spec §45).
    const physics = await prisma.orgUser.findFirst({
      where: { organizationId: abcOrg.id, email: 'physics@example.com' },
    });
    const phySubject = await prisma.subject.findFirst({
      where: { organizationId: abcOrg.id, code: 'PHY' },
    });
    if (physics && phySubject) {
      for (const code of ['XII-A-NEET', 'XII-B-JEE']) {
        const b = batches.get(code)!;
        await prisma.batchFaculty.upsert({
          where: { batchId_facultyId_subjectId: { batchId: b.id, facultyId: physics.id, subjectId: phySubject.id } },
          create: { batchId: b.id, facultyId: physics.id, subjectId: phySubject.id, isClassTeacher: code === 'XII-A-NEET' },
          update: { endedAt: null },
        });
      }
    }

    const firstNames = ['Riya', 'Arjun', 'Kavya', 'Aditya', 'Meera', 'Rohan', 'Ananya', 'Vikram', 'Divya', 'Karthik',
      'Sneha', 'Aravind', 'Nithya', 'Pranav', 'Ishita', 'Sanjay', 'Lakshmi', 'Harish', 'Deepika', 'Manoj'];
    const lastNames = ['Sharma', 'Mehta', 'Iyer', 'Nair', 'Rao', 'Reddy', 'Patel', 'Krishnan', 'Menon', 'Pillai'];

    const existingStudents = await prisma.student.count({ where: { organizationId: abcOrg.id } });
    if (existingStudents === 0) {
      const batchList = [...batches.values()];
      for (let i = 0; i < 48; i++) {
        const batch = batchList[i % batchList.length];
        // Stride the surname list by a co-prime step so 48 students get 48
        // distinct names — repeated names make a ranked result sheet unreadable.
        const name = `${firstNames[i % firstNames.length]} ${lastNames[(i * 7 + Math.floor(i / firstNames.length)) % lastNames.length]}`;
        const admissionDate = addDays(now, -(200 - i * 3));
        const student = await prisma.student.create({
          data: {
            organizationId: abcOrg.id,
            branchId: batch.branchId,
            studentCode: `STU${String(i + 1).padStart(5, '0')}`,
            name,
            gender: i % 2 === 0 ? 'FEMALE' : 'MALE',
            phone: `+9198${String(76000000 + i * 137).slice(0, 8)}`,
            parentName: `${lastNames[i % lastNames.length]} (parent)`,
            parentPhone: `+9198${String(76500000 + i * 91).slice(0, 8)}`,
            parentRelation: i % 2 === 0 ? 'Mother' : 'Father',
            targetExam: i % 3 === 0 ? 'NEET' : i % 3 === 1 ? 'JEE_MAIN' : 'FOUNDATION',
            admissionDate,
            previousSchool: 'St. Xavier\'s Higher Secondary',
            previousClass: 'XI',
            previousMarks: `${78 + (i % 18)}%`,
            city: batch.branchId === chennaiB.id ? 'Chennai' : 'Salem',
            state: 'Tamil Nadu',
            status: i % 17 === 0 ? 'INACTIVE' : 'ACTIVE',
          },
        });
        await prisma.studentBranchHistory.create({
          data: { studentId: student.id, branchId: batch.branchId, fromDate: admissionDate, reason: 'Admission' },
        });
        if (student.status === 'ACTIVE') {
          await prisma.batchStudent.create({ data: { batchId: batch.id, studentId: student.id, joinedAt: admissionDate } });
        }
      }
    }

    const activeStudents = await prisma.student.count({
      where: { organizationId: abcOrg.id, status: 'ACTIVE', deletedAt: null },
    });
    await prisma.organizationUsage.update({
      where: { organizationId: abcOrg.id }, data: { students: activeStudents },
    });

    // A pipeline spread across the stages (spec §38).
    if ((await prisma.enquiry.count({ where: { organizationId: abcOrg.id } })) === 0) {
      const counsellor = await prisma.orgUser.findFirst({
        where: { organizationId: abcOrg.id, email: 'chennai.admin@example.com' },
      });
      const stages = ['NEW', 'NEW', 'CONTACTED', 'CONTACTED', 'COUNSELLING', 'TRIAL', 'FOLLOW_UP', 'LOST'] as const;
      const sources = ['WALK_IN', 'PHONE', 'WEBSITE', 'REFERRAL', 'SOCIAL_MEDIA'] as const;
      for (const [i, stage] of stages.entries()) {
        const enquiry = await prisma.enquiry.create({
          data: {
            organizationId: abcOrg.id,
            branchId: i % 4 === 3 ? salemB.id : chennaiB.id,
            enquiryCode: `ENQ${String(i + 1).padStart(5, '0')}`,
            studentName: `${firstNames[(i + 5) % firstNames.length]} ${lastNames[(i + 3) % lastNames.length]}`,
            phone: `+9199${String(40000000 + i * 733).slice(0, 8)}`,
            parentName: 'Parent contact',
            parentPhone: `+9199${String(41000000 + i * 733).slice(0, 8)}`,
            targetExam: i % 2 === 0 ? 'NEET' : 'JEE_MAIN',
            courseId: courses.get(i % 2 === 0 ? 'NEET2Y' : 'JEE2Y')!,
            source: sources[i % sources.length],
            stage,
            assignedToId: counsellor?.id ?? null,
            // Two are deliberately overdue so the follow-up alert has something to show.
            nextFollowUpAt: stage === 'LOST' ? null : addDays(now, i < 2 ? -3 + i : 2 + i),
            lostReason: stage === 'LOST' ? 'Joined a competitor closer to home' : null,
            createdAt: addDays(now, -(20 - i * 2)),
          },
        });
        await prisma.enquiryActivity.create({
          data: { enquiryId: enquiry.id, type: 'STAGE_CHANGE', toStage: 'NEW', note: 'Enquiry logged', actorName: 'Seed' },
        });
      }
    }
  }

  /* Phase 3 — chapters, topics, rooms and a working weekly timetable. */
  if (abcOrg) {
    const abcSubjects = await prisma.subject.findMany({ where: { organizationId: abcOrg.id } });
    // [chapter name, topic names] pairs, keyed by subject code.
    const CHAPTERS: Record<string, Array<[string, string[]]>> = {
      PHY: [
        ['Kinematics', ['Motion in a straight line', 'Motion in a plane', 'Relative velocity']],
        ['Laws of Motion', ['Newton\'s laws', 'Friction', 'Circular motion']],
        ['Work, Energy & Power', ['Work-energy theorem', 'Conservation of energy', 'Collisions']],
      ],
      CHEM: [
        ['Some Basic Concepts', ['Mole concept', 'Stoichiometry', 'Empirical formula']],
        ['Atomic Structure', ['Bohr model', 'Quantum numbers', 'Electronic configuration']],
        ['Chemical Bonding', ['Ionic bonding', 'Covalent bonding', 'VSEPR theory']],
      ],
      BIO: [
        ['Cell Biology', ['Cell theory', 'Cell organelles', 'Cell division']],
        ['Human Physiology', ['Digestion', 'Respiration', 'Circulation']],
      ],
      MATH: [
        ['Sets & Relations', ['Sets', 'Relations', 'Functions']],
        ['Trigonometry', ['Trigonometric ratios', 'Identities', 'Equations']],
        ['Calculus', ['Limits', 'Derivatives', 'Integration']],
      ],
    };

    for (const subject of abcSubjects) {
      const spec = CHAPTERS[subject.code];
      if (!spec) continue;
      for (const [ci, [chapterName, topics]] of spec.entries()) {
        const existing = await prisma.chapter.findFirst({
          where: { organizationId: abcOrg.id, subjectId: subject.id, name: chapterName },
        });
        const chapter = existing ?? await prisma.chapter.create({
          data: {
            organizationId: abcOrg.id, subjectId: subject.id,
            name: chapterName, sequence: ci, estimatedHours: 12,
          },
        });
        for (const [ti, topicName] of topics.entries()) {
          const t = await prisma.topic.findFirst({
            where: { organizationId: abcOrg.id, chapterId: chapter.id, name: topicName },
          });
          if (!t) {
            await prisma.topic.create({
              data: { organizationId: abcOrg.id, chapterId: chapter.id, name: topicName, sequence: ti, estimatedHours: 4 },
            });
          }
        }
      }
    }

    const abcBranchList = await prisma.branch.findMany({ where: { organizationId: abcOrg.id }, orderBy: { code: 'asc' } });
    for (const branch of abcBranchList) {
      for (const [i, name] of ['Hall A', 'Hall B', 'Lab 1'].entries()) {
        const code = `${branch.code}-R${i + 1}`;
        await prisma.room.upsert({
          where: { branchId_code: { branchId: branch.id, code } },
          create: {
            organizationId: abcOrg.id, branchId: branch.id, name,
            code, capacity: i === 2 ? 30 : 60,
          },
          update: {},
        });
      }
    }

    // A small weekly grid for the Chennai NEET batch — enough for the timetable
    // view to render and for conflict detection to have something to collide with.
    const neetBatch = await prisma.batch.findFirst({
      where: { organizationId: abcOrg.id, code: 'XII-A-NEET' },
    });
    const physicsFaculty = await prisma.orgUser.findFirst({
      where: { organizationId: abcOrg.id, email: 'physics@example.com' },
    });
    const hallA = await prisma.room.findFirst({
      where: { organizationId: abcOrg.id, branchId: neetBatch?.branchId, code: 'ABC1-R1' },
    });

    if (neetBatch && physicsFaculty && hallA && (await prisma.timetableSlot.count({ where: { batchId: neetBatch.id } })) === 0) {
      const byCode = new Map(abcSubjects.map((s) => [s.code, s.id]));
      const grid: Array<[number, string, number, number]> = [
        [1, 'PHY', 9 * 60, 10 * 60 + 30],
        [2, 'CHEM', 9 * 60, 10 * 60 + 30],
        [3, 'BIO', 9 * 60, 10 * 60 + 30],
        [4, 'PHY', 11 * 60, 12 * 60 + 30],
        [5, 'CHEM', 11 * 60, 12 * 60 + 30],
      ];
      for (const [day, code, start, end] of grid) {
        const subjectId = byCode.get(code);
        if (!subjectId) continue;
        await prisma.timetableSlot.create({
          data: {
            organizationId: abcOrg.id,
            branchId: neetBatch.branchId,
            batchId: neetBatch.id,
            subjectId,
            facultyId: physicsFaculty.id,
            roomId: hallA.id,
            dayOfWeek: day,
            startMinute: start,
            endMinute: end,
            effectiveFrom: new Date('2026-04-15'),
          },
        });
      }
    }
  }

  /* Phase 5 — a question bank and a live multi-branch mock test. */
  if (abcOrg) {
    const subj = await prisma.subject.findMany({ where: { organizationId: abcOrg.id } });
    const byCode = new Map(subj.map((x) => [x.code, x]));
    // Re-read here: the Phase 3 lookup is scoped to its own block.
    const author = await prisma.orgUser.findFirst({
      where: { organizationId: abcOrg.id, email: 'physics@example.com' },
    });

    // Four questions per subject, spread across difficulties.
    const STEMS: Record<string, [string, string[], number][]> = {
      PHY: [
        ['A body moves 20 m north then 20 m east. What is its displacement?', ['28.3 m', '40 m', '20 m', '0 m'], 0],
        ['The SI unit of impulse is:', ['N·s', 'N/s', 'J·s', 'J/m'], 0],
        ['Work done by a centripetal force in uniform circular motion is:', ['Zero', 'Positive', 'Negative', 'Infinite'], 0],
        ['Which quantity is conserved in an elastic collision?', ['Both momentum and kinetic energy', 'Momentum only', 'Kinetic energy only', 'Neither'], 0],
      ],
      CHEM: [
        ['The number of moles in 44 g of CO2 is:', ['1', '2', '0.5', '4'], 0],
        ['Which quantum number determines orbital orientation?', ['Magnetic', 'Principal', 'Azimuthal', 'Spin'], 0],
        ['The shape of a molecule with sp3 hybridisation is:', ['Tetrahedral', 'Linear', 'Trigonal planar', 'Octahedral'], 0],
        ['Avogadro number is approximately:', ['6.022 × 10^23', '6.022 × 10^22', '3.011 × 10^23', '1.602 × 10^19'], 0],
      ],
      BIO: [
        ['The powerhouse of the cell is the:', ['Mitochondrion', 'Ribosome', 'Nucleus', 'Golgi body'], 0],
        ['Which phase of mitosis involves chromosome alignment at the equator?', ['Metaphase', 'Prophase', 'Anaphase', 'Telophase'], 0],
        ['Absorption of digested food mainly occurs in the:', ['Small intestine', 'Stomach', 'Large intestine', 'Oesophagus'], 0],
        ['Haemoglobin is primarily responsible for transporting:', ['Oxygen', 'Glucose', 'Urea', 'Hormones'], 0],
      ],
      MATH: [
        ['If f(x) = x², then f\'(3) equals:', ['6', '9', '3', '1'], 0],
        ['The value of sin²θ + cos²θ is:', ['1', '0', '2', 'sin 2θ'], 0],
        ['The limit of (sin x)/x as x → 0 is:', ['1', '0', '∞', 'Undefined'], 0],
        ['A set with 3 elements has how many subsets?', ['8', '6', '3', '9'], 0],
      ],
    };
    const DIFFS = ['EASY', 'MEDIUM', 'MEDIUM', 'HARD'] as const;

    if ((await prisma.question.count({ where: { organizationId: abcOrg.id } })) === 0) {
      for (const [code, stems] of Object.entries(STEMS)) {
        const subject = byCode.get(code);
        if (!subject) continue;
        const chapters = await prisma.chapter.findMany({
          where: { organizationId: abcOrg.id, subjectId: subject.id },
          orderBy: { sequence: 'asc' },
        });
        for (const [i, [body, options, correct]] of stems.entries()) {
          await prisma.question.create({
            data: {
              organizationId: abcOrg.id,
              // Organization-wide library — reusable by every branch (spec §51).
              branchId: null,
              subjectId: subject.id,
              chapterId: chapters[i % Math.max(1, chapters.length)]?.id ?? null,
              type: 'SINGLE_CHOICE',
              difficulty: DIFFS[i],
              body,
              explanation: 'Refer to the chapter summary for the full derivation.',
              marks: 4,
              negativeMarks: 1,
              createdById: author?.id ?? null,
              options: {
                create: options.map((text, oi) => ({
                  label: String.fromCharCode(65 + oi),
                  body: text,
                  isCorrect: oi === correct,
                  sequence: oi,
                })),
              },
            },
          });
        }
      }
    }

    // "All India Mock Test #4" across Chennai and Salem (spec §52).
    if ((await prisma.test.count({ where: { organizationId: abcOrg.id } })) === 0) {
      const neetBatches = await prisma.batch.findMany({
        where: { organizationId: abcOrg.id, code: { in: ['XII-A-NEET', 'SLM-XII-NEET'] } },
      });
      const targetBranches = [...new Set(neetBatches.map((b) => b.branchId))];
      const bankQuestions = await prisma.question.findMany({
        where: {
          organizationId: abcOrg.id,
          subject: { code: { in: ['PHY', 'CHEM', 'BIO'] } },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (neetBatches.length && bankQuestions.length) {
        const opensAt = addDays(now, -1);
        const closesAt = addDays(now, 6);
        const test = await prisma.test.create({
          data: {
            organizationId: abcOrg.id,
            title: 'All India Mock Test #4',
            code: 'AIMT-04',
            description: 'Full-syllabus NEET mock across Physics, Chemistry and Biology.',
            scope: 'MULTI_BRANCH',
            mode: 'ONLINE',
            status: 'LIVE',
            durationMinutes: 180,
            startAt: opensAt,
            endAt: closesAt,
            negativeMarking: true,
            totalMarks: bankQuestions.length * 4,
            createdById: author?.id ?? null,
            branches: { create: targetBranches.map((branchId) => ({ branchId })) },
            batches: { create: neetBatches.map((b) => ({ batchId: b.id })) },
            questions: {
              create: bankQuestions.map((q, i) => ({
                questionId: q.id,
                sequence: i,
                marks: 4,
                negativeMarks: 1,
              })),
            },
          },
        });

        // Live means the paper is historical record from here on (spec §51).
        await prisma.question.updateMany({
          where: { id: { in: bankQuestions.map((q) => q.id) } },
          data: { lockedAt: now, usageCount: { increment: 1 } },
        });
        console.log(`  test ${test.code} · ${bankQuestions.length} questions · ${targetBranches.length} branches`);
      }
    }
  }

  /* One open support ticket */
  const abc = await prisma.organization.findUnique({ where: { slug: 'abc-academy' } });
  if (abc && !(await prisma.supportTicket.findFirst({ where: { organizationId: abc.id } }))) {
    await prisma.supportTicket.create({
      data: {
        reference: 'TKT-000001', organizationId: abc.id,
        subject: 'Bulk student import fails past 500 rows',
        description: 'The CSV import stalls when the file exceeds roughly 500 students. Smaller batches succeed.',
        priority: 'HIGH', status: 'OPEN',
      },
    });
  }

  console.log('\nSeed complete.');
  console.log(`  Platform console : ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  console.log(`  ERP org owner    : abc@example.com / ${OWNER_PASSWORD}   (all branches)`);
  console.log(`  ERP branch admin : chennai.admin@example.com / ${OWNER_PASSWORD}   (Chennai only)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
