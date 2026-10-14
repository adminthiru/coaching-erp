/**
 * Demo data — every module, every interesting state.
 *
 * `seed.ts` creates the minimum to sign in and look around. This layers on top
 * of it and fills the 26 modules that otherwise render empty, deliberately
 * including the awkward cases rather than only the happy path: a student below
 * the attendance threshold, a part-paid fee with an overdue installment, a
 * refunded receipt, a full hostel room, a locked question, a parent with
 * children at two different branches.
 *
 * Re-runnable: it removes what it previously created for the organization
 * before inserting, so running it twice does not double anything.
 *
 *   npm run db:seed:demo
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/** Demo parents share the owner's password so the portal is actually openable. */
const DEMO_PASSWORD = 'ChangeMe!2026';

/* ── Deterministic randomness ────────────────────────────────────────────
   A fixed seed means two runs produce the same database, so a screenshot or a
   bug report still matches what the next person sees. */
let rngState = 20260826;
const rnd = () => {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
};
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const chance = (p: number) => rnd() < p;

const DAY = 864e5;
const today = new Date('2026-08-26T00:00:00.000Z');
const dayFrom = (offset: number) => new Date(today.getTime() + offset * DAY);
const dateOnly = (d: Date) => new Date(d.toISOString().slice(0, 10) + 'T00:00:00.000Z');

async function main() {
  const org = await prisma.organization.findFirstOrThrow({
    where: { slug: 'abc-academy' },
    select: { id: true, name: true },
  });
  const orgId = org.id;
  console.log(`Seeding demo data into ${org.name}\n`);

  await wipe(orgId);

  const branches = await prisma.branch.findMany({ where: { organizationId: orgId }, orderBy: { code: 'asc' } });
  const subjects = await prisma.subject.findMany({ where: { organizationId: orgId } });
  const courses = await prisma.course.findMany({ where: { organizationId: orgId } });
  const year = await prisma.academicYear.findFirstOrThrow({ where: { organizationId: orgId } });
  const rooms = await prisma.room.findMany({ where: { organizationId: orgId } });
  const owner = await prisma.orgUser.findFirstOrThrow({ where: { organizationId: orgId, role: 'ORG_OWNER' } });

  const staff = await seedStaff(orgId, branches);
  const batches = await prisma.batch.findMany({ where: { organizationId: orgId }, include: { students: true } });
  const students = await prisma.student.findMany({
    where: { organizationId: orgId, deletedAt: null },
    include: { batches: { where: { status: 'ENROLLED' } } },
  });

  await seedAdmissions(orgId, branches, courses, staff.counsellors, students);
  await seedAcademics(orgId, batches, subjects, staff.faculty);
  const sessions = await seedTimetableAndSessions(orgId, batches, subjects, rooms, staff.faculty);
  await seedAttendance(orgId, sessions, students, owner.id);
  await seedLeave(orgId, branches, students, staff.faculty, owner.id);
  await seedAnnouncements(orgId, branches, batches, owner.id);
  await seedAssessment(orgId, branches, batches, subjects, students, owner.id);
  await seedLearning(orgId, branches, batches, subjects, students, staff.faculty, owner.id);
  await seedFinance(orgId, branches, courses, year.id, students, owner.id);
  await seedPortal(orgId, students);
  await seedFacilities(orgId, branches, students);

  console.log('\nDemo data complete.');
}

/** Removes anything a previous run created, child-first so FKs never block. */
async function wipe(organizationId: string) {
  const where = { organizationId };
  await prisma.$transaction([
    prisma.attendance.deleteMany({ where }),
    prisma.classSession.deleteMany({ where }),
    // After the sessions that reference them, never before.
    prisma.timetableSlot.deleteMany({ where }),
    prisma.leaveRequest.deleteMany({ where }),
    prisma.announcementTarget.deleteMany({ where: { announcement: { organizationId } } }),
    prisma.announcement.deleteMany({ where }),
    prisma.syllabusProgress.deleteMany({ where }),
    prisma.lessonPlanTopic.deleteMany({ where: { plan: { organizationId } } }),
    prisma.lessonPlan.deleteMany({ where }),
  ]);
  await prisma.$transaction([
    prisma.testAnswer.deleteMany({ where: { attempt: { organizationId } } }),
    prisma.testAttempt.deleteMany({ where }),
    prisma.testQuestion.deleteMany({ where: { test: { organizationId } } }),
    prisma.testBatch.deleteMany({ where: { test: { organizationId } } }),
    prisma.testBranch.deleteMany({ where: { test: { organizationId } } }),
    prisma.test.deleteMany({ where }),
    prisma.homeworkSubmission.deleteMany({ where }),
    prisma.homeworkStudent.deleteMany({ where: { homework: { organizationId } } }),
    prisma.homeworkTarget.deleteMany({ where: { homework: { organizationId } } }),
    prisma.homework.deleteMany({ where }),
    prisma.studyMaterialStudent.deleteMany({ where: { material: { organizationId } } }),
    prisma.studyMaterialTarget.deleteMany({ where: { material: { organizationId } } }),
    prisma.studyMaterial.deleteMany({ where }),
    prisma.doubtMessage.deleteMany({ where: { doubt: { organizationId } } }),
    prisma.doubt.deleteMany({ where }),
  ]);
  await prisma.$transaction([
    prisma.feeRefund.deleteMany({ where: { feePayment: { organizationId } } }),
    prisma.feePayment.deleteMany({ where }),
    prisma.feeConcession.deleteMany({ where: { studentFee: { organizationId } } }),
    prisma.feeInstallment.deleteMany({ where: { studentFee: { organizationId } } }),
    prisma.studentFee.deleteMany({ where }),
    prisma.feeComponent.deleteMany({ where: { feeStructure: { organizationId } } }),
    prisma.feeStructure.deleteMany({ where }),
    prisma.expense.deleteMany({ where }),
  ]);
  await prisma.$transaction([
    prisma.hostelAllocation.deleteMany({ where }),
    prisma.hostelRoom.deleteMany({ where: { hostel: { organizationId } } }),
    prisma.hostel.deleteMany({ where }),
    prisma.transportAllocation.deleteMany({ where }),
    prisma.routeStop.deleteMany({ where: { route: { organizationId } } }),
    prisma.transportRoute.deleteMany({ where }),
    prisma.vehicle.deleteMany({ where }),
    prisma.messSubscription.deleteMany({ where }),
    prisma.messPlan.deleteMany({ where }),
    prisma.guardian.deleteMany({ where }),
    prisma.enquiryActivity.deleteMany({ where: { enquiry: { organizationId } } }),
    prisma.enquiry.deleteMany({ where }),
  ]);
  console.log('  cleared previous demo data');
}

/* ── Staff ───────────────────────────────────────────────────────────────── */

const FACULTY_NAMES = ['Meera Krishnan', 'Arjun Nair', 'Priya Venkatesh', 'Rahul Menon', 'Divya Raghavan'];

async function seedStaff(organizationId: string, branches: { id: string; code: string }[]) {
  const faculty: { id: string; name: string; branchId: string }[] = [];

  for (const [i, name] of FACULTY_NAMES.entries()) {
    const branch = branches[i % branches.length];
    const email = `${name.split(' ')[0].toLowerCase()}.${i}@abcacademy.in`;
    const user = await prisma.orgUser.upsert({
      where: { organizationId_email: { organizationId, email } },
      update: {},
      create: {
        organizationId, name, email, role: 'FACULTY',
        phone: `+91 9${int(100000000, 999999999)}`,
        acceptedAt: dayFrom(-int(60, 300)),
        branches: { create: { branchId: branch.id, isPrimary: true } },
      },
      select: { id: true, name: true },
    });
    faculty.push({ ...user, branchId: branch.id });
  }

  const counsellors: { id: string; name: string; branchId: string }[] = [];
  for (const [i, name] of ['Lakshmi Raman', 'Vikram Das'].entries()) {
    const branch = branches[i % branches.length];
    const email = `${name.split(' ')[0].toLowerCase()}.counsel@abcacademy.in`;
    const user = await prisma.orgUser.upsert({
      where: { organizationId_email: { organizationId, email } },
      update: {},
      create: {
        organizationId, name, email, role: 'COUNSELLOR',
        acceptedAt: dayFrom(-int(60, 200)),
        branches: { create: { branchId: branch.id, isPrimary: true } },
      },
      select: { id: true, name: true },
    });
    counsellors.push({ ...user, branchId: branch.id });
  }

  // An accountant, so the finance screens have a non-owner actor.
  await prisma.orgUser.upsert({
    where: { organizationId_email: { organizationId, email: 'accounts@abcacademy.in' } },
    update: {},
    create: {
      organizationId, name: 'Ganesh Subramanian', email: 'accounts@abcacademy.in', role: 'ACCOUNTANT',
      acceptedAt: dayFrom(-120),
      branches: { create: { branchId: branches[0].id, isPrimary: true } },
    },
  });

  // One invitation left unaccepted — the "pending invites" tile needs a subject.
  await prisma.orgUser.upsert({
    where: { organizationId_email: { organizationId, email: 'pending.faculty@abcacademy.in' } },
    update: {},
    create: {
      organizationId, name: 'Anita Joseph', email: 'pending.faculty@abcacademy.in', role: 'FACULTY',
      invitedAt: dayFrom(-4), invitationToken: 'demo-pending-invite', invitationExpiry: dayFrom(10),
      branches: { create: { branchId: branches[0].id, isPrimary: true } },
    },
  });

  console.log(`  staff: ${faculty.length} faculty, ${counsellors.length} counsellors, 1 accountant, 1 pending invite`);
  return { faculty, counsellors };
}

/* ── Admissions (spec §38) — every pipeline stage, including overdue ─────── */

const ENQUIRY_NAMES = [
  'Kavya Balakrishnan', 'Rohan Pillai', 'Sneha Ramesh', 'Aditya Varma', 'Ishita Menon',
  'Karthik Suresh', 'Anjali Nambiar', 'Vivek Chandran', 'Nithya Sharma', 'Sanjay Kumar',
  'Deepa Iyer', 'Manish Gupta',
  // These five converted; each is linked to a real student row below.
  'Harini Selvam', 'Aravind Raghavan', 'Pooja Venkatesh', 'Nikhil Bose', 'Shruti Kulkarni',
];

async function seedAdmissions(
  organizationId: string,
  branches: { id: string }[],
  courses: { id: string }[],
  counsellors: { id: string }[],
  students: { id: string; name: string }[],
) {
  // Every stage the enum defines, including ADMITTED — without a won stage the
  // pipeline's conversion rate is structurally 0% and `convertedStudentId` /
  // `admittedAt` (the audit link back to the student) never get exercised.
  const stages = ['NEW', 'NEW', 'CONTACTED', 'CONTACTED', 'COUNSELLING', 'TRIAL', 'FOLLOW_UP', 'FOLLOW_UP', 'LOST', 'LOST', 'CONTACTED', 'COUNSELLING', 'ADMITTED', 'ADMITTED', 'ADMITTED', 'ADMITTED', 'ADMITTED'] as const;
  const sources = ['WALK_IN', 'PHONE', 'WEBSITE', 'REFERRAL', 'SOCIAL_MEDIA'] as const;
  let made = 0;
  let admitted = 0;

  for (const [i, studentName] of ENQUIRY_NAMES.entries()) {
    const stage = stages[i];
    const branch = branches[i % branches.length];
    // A third of open enquiries are deliberately overdue, so the "follow-ups
    // overdue" alert has something real to point at.
    // ADMITTED and LOST are both closed: no follow-up is due on either, which is
    // also what the "overdue" count in the pipeline assumes.
    const open = stage !== 'LOST' && stage !== 'ADMITTED';
    const followUp = open ? dayFrom(chance(0.35) ? -int(1, 12) : int(1, 14)) : null;
    // `convertedStudentId` is @unique, so each admitted enquiry takes a distinct
    // student — walking backwards keeps them clear of the earlier fixtures.
    const converted = stage === 'ADMITTED' ? students[students.length - 1 - admitted] : null;

    const enquiry = await prisma.enquiry.create({
      data: {
        organizationId,
        branchId: branch.id,
        enquiryCode: `ENQ-D${String(i + 100).padStart(4, '0')}`,
        stage,
        source: pick(sources),
        studentName,
        phone: `+91 9${int(100000000, 999999999)}`,
        email: `${studentName.split(' ')[0].toLowerCase()}@example.com`,
        parentName: `${studentName.split(' ')[1]} (parent)`,
        parentPhone: `+91 9${int(100000000, 999999999)}`,
        targetExam: pick(['NEET', 'JEE_MAIN', 'JEE_ADVANCED', 'FOUNDATION'] as const),
        courseId: chance(0.7) ? pick(courses).id : null,
        assignedToId: chance(0.8) ? pick(counsellors).id : null,
        nextFollowUpAt: followUp,
        lostReason: stage === 'LOST' ? pick(['Chose another institute', 'Fees too high', 'Relocating']) : null,
        convertedStudentId: converted?.id ?? null,
        admittedAt: converted ? dayFrom(-int(2, 40)) : null,
        notes: 'Demo enquiry.',
        createdAt: dayFrom(-int(3, 60)),
      },
    });
    if (converted) admitted += 1;

    // Every enquiry starts at NEW; anything further along gets the stage change
    // that moved it, so the detail timeline reads as a history rather than
    // claiming the enquiry was born at its current stage.
    await prisma.enquiryActivity.create({
      data: {
        enquiryId: enquiry.id,
        type: 'NOTE',
        note: 'Initial enquiry logged at the front desk.',
        toStage: 'NEW',
      },
    });
    if (stage !== 'NEW') {
      await prisma.enquiryActivity.create({
        data: {
          enquiryId: enquiry.id,
          type: 'STAGE_CHANGE',
          fromStage: 'NEW',
          toStage: stage,
          note: converted
            ? `Admitted — enrolled as ${converted.name}.`
            : stage === 'LOST'
              ? 'Closed as lost after follow-up.'
              : `Moved to ${stage.toLowerCase().replace('_', ' ')}.`,
        },
      });
    }
    made += 1;
  }
  console.log(`  admissions: ${made} enquiries across every stage (${admitted} admitted, linked to students)`);
}

/* ── Academics (spec §§43–44) ────────────────────────────────────────────── */

async function seedAcademics(
  organizationId: string,
  batches: { id: string; branchId: string }[],
  subjects: { id: string; name: string }[],
  faculty: { id: string }[],
) {
  const topics = await prisma.topic.findMany({
    where: { organizationId },
    include: { chapter: { select: { subjectId: true } } },
  });

  const progress: Prisma.SyllabusProgressCreateManyInput[] = [];
  for (const batch of batches) {
    for (const [i, topic] of topics.entries()) {
      // A believable curve: earlier topics done, middle in progress, later planned.
      const ratio = i / topics.length;
      const status = ratio < 0.45 ? 'COMPLETED' : ratio < 0.6 ? 'IN_PROGRESS' : chance(0.06) ? 'SKIPPED' : 'PLANNED';
      progress.push({
        organizationId,
        branchId: batch.branchId,
        batchId: batch.id,
        topicId: topic.id,
        status,
        plannedDate: dateOnly(dayFrom(-60 + i * 3)),
        completedDate: status === 'COMPLETED' ? dateOnly(dayFrom(-60 + i * 3)) : null,
        facultyId: pick(faculty).id,
      });
    }
  }
  await prisma.syllabusProgress.createMany({ data: progress, skipDuplicates: true });

  const plans: Prisma.LessonPlanCreateManyInput[] = [];
  for (const batch of batches) {
    for (const [i, type] of (['LESSON', 'REVISION', 'PRACTICE', 'TEST'] as const).entries()) {
      plans.push({
        organizationId,
        branchId: batch.branchId,
        batchId: batch.id,
        subjectId: pick(subjects).id,
        facultyId: pick(faculty).id,
        type,
        status: i === 0 ? 'COMPLETED' : i === 1 ? 'PUBLISHED' : i === 2 ? 'PUBLISHED' : 'DRAFT',
        title: `${type[0]}${type.slice(1).toLowerCase()} plan — week ${i + 1}`,
        description: 'Demo plan.',
        plannedDate: dateOnly(dayFrom(-14 + i * 7)),
        durationMinutes: 90,
      });
    }
  }
  await prisma.lessonPlan.createMany({ data: plans, skipDuplicates: true });

  const done = progress.filter((p) => p.status === 'COMPLETED').length;
  console.log(`  academics: ${progress.length} syllabus rows (${done} completed), ${plans.length} lesson plans`);
}

/* ── Timetable & class sessions (spec §46) ───────────────────────────────── */

async function seedTimetableAndSessions(
  organizationId: string,
  batches: { id: string; branchId: string }[],
  subjects: { id: string }[],
  rooms: { id: string; branchId: string }[],
  faculty: { id: string; branchId: string }[],
) {
  const created: { id: string; batchId: string; branchId: string; date: Date }[] = [];
  let slotCount = 0;

  for (const batch of batches) {
    const branchRooms = rooms.filter((r) => r.branchId === batch.branchId);
    const branchFaculty = faculty.filter((f) => f.branchId === batch.branchId);
    if (!branchFaculty.length) continue;

    // The recurring weekly grid the Timetable screen actually draws: two periods
    // a day, Monday–Saturday. Sessions below are generated *from* these slots
    // rather than invented independently, so the grid and the session history
    // describe the same timetable and `slotId` links a session to its origin.
    const slots: { id: string; dayOfWeek: number; startMinute: number; subjectId: string; facultyId: string; roomId: string | null }[] = [];
    for (let day = 1; day <= 6; day++) {
      for (const [period, start] of [[0, 540], [1, 660]] as const) {
        const subject = subjects[(day + period) % subjects.length];
        const teacher = branchFaculty[(day + period) % branchFaculty.length];
        const roomId = branchRooms.length ? branchRooms[(day + period) % branchRooms.length].id : null;
        const slot = await prisma.timetableSlot.create({
          data: {
            organizationId,
            branchId: batch.branchId,
            batchId: batch.id,
            subjectId: subject.id,
            facultyId: teacher.id,
            roomId,
            dayOfWeek: day,
            startMinute: start,
            endMinute: start + 90,
            status: 'ACTIVE',
            effectiveFrom: dateOnly(dayFrom(-70)),
          },
          select: { id: true },
        });
        slots.push({ id: slot.id, dayOfWeek: day, startMinute: start, subjectId: subject.id, facultyId: teacher.id, roomId });
        slotCount += 1;
      }
    }

    // Eight weeks of history, one session per slot occurrence.
    for (let d = -56; d <= 0; d++) {
      const date = dayFrom(d);
      const weekday = date.getUTCDay();
      if (weekday === 0) continue; // no Sunday classes
      for (const slot of slots.filter((s) => s.dayOfWeek === weekday)) {
        const session = await prisma.classSession.create({
          data: {
            organizationId,
            branchId: batch.branchId,
            batchId: batch.id,
            subjectId: slot.subjectId,
            facultyId: slot.facultyId,
            roomId: slot.roomId,
            slotId: slot.id,
            date: dateOnly(date),
            startMinute: slot.startMinute,
            endMinute: slot.startMinute + 90,
            // A couple of cancellations, so the timetable is not unrealistically perfect.
            status: chance(0.03) ? 'CANCELLED' : 'COMPLETED',
            cancelReason: null,
          },
          select: { id: true, batchId: true, branchId: true, date: true, status: true },
        });
        if (session.status === 'COMPLETED') created.push(session);
      }
    }
  }
  console.log(`  timetable: ${slotCount} weekly slots, ${created.length} completed class sessions over 8 weeks`);
  return created;
}

/* ── Attendance (spec §47) — including students genuinely at risk ────────── */

async function seedAttendance(
  organizationId: string,
  sessions: { id: string; batchId: string; branchId: string; date: Date }[],
  students: { id: string; branchId: string; batches: { batchId: string }[] }[],
  markedById: string,
) {
  const byBatch = new Map<string, typeof students>();
  for (const s of students) {
    for (const b of s.batches) byBatch.set(b.batchId, [...(byBatch.get(b.batchId) ?? []), s]);
  }

  // Three named students sit below the 60% threshold so the "needs attention"
  // lists and the AI insight findings have real subjects. They have to be drawn
  // from students who actually sit in a batch — an unenrolled student attends no
  // session, so marking them at-risk produces no attendance rows at all and the
  // threshold case silently goes missing from the report.
  const atRisk = new Set(
    students.filter((s) => byBatch.has(s.batches[0]?.batchId ?? '')).slice(0, 3).map((s) => s.id),
  );

  const rows: Prisma.AttendanceCreateManyInput[] = [];
  for (const session of sessions) {
    for (const student of byBatch.get(session.batchId) ?? []) {
      const roll = rnd();
      let status: 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'EXCUSED';
      if (atRisk.has(student.id)) {
        status = roll < 0.5 ? 'ABSENT' : roll < 0.75 ? 'PRESENT' : roll < 0.9 ? 'LATE' : 'EXCUSED';
      } else {
        status = roll < 0.84 ? 'PRESENT' : roll < 0.9 ? 'LATE' : roll < 0.94 ? 'ABSENT' : roll < 0.97 ? 'HALF_DAY' : 'EXCUSED';
      }
      rows.push({
        organizationId,
        branchId: session.branchId,
        batchId: session.batchId,
        sessionId: session.id,
        studentId: student.id,
        date: session.date,
        status,
        minutesLate: status === 'LATE' ? int(5, 25) : null,
        markedById,
      });
    }
  }

  for (let i = 0; i < rows.length; i += 2000) {
    await prisma.attendance.createMany({ data: rows.slice(i, i + 2000), skipDuplicates: true });
  }
  console.log(`  attendance: ${rows.length} records (3 students deliberately below 60%)`);
}

/* ── Leave (spec §48) ────────────────────────────────────────────────────── */

async function seedLeave(
  organizationId: string,
  branches: { id: string }[],
  students: { id: string; branchId: string }[],
  faculty: { id: string; branchId: string }[],
  reviewerId: string,
) {
  const rows: Prisma.LeaveRequestCreateManyInput[] = [];
  const reasons = ['Family wedding', 'Medical — viral fever', 'Out of station', 'Sibling’s exam', 'Religious observance'];

  for (const [i, status] of (['PENDING', 'PENDING', 'APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED'] as const).entries()) {
    const student = students[i * 3 % students.length];
    const from = dayFrom(status === 'PENDING' ? int(2, 10) : -int(5, 30));
    rows.push({
      organizationId,
      branchId: student.branchId,
      subjectType: 'STUDENT',
      studentId: student.id,
      fromDate: dateOnly(from),
      toDate: dateOnly(new Date(from.getTime() + int(0, 3) * DAY)),
      reason: pick(reasons),
      status,
      reviewedById: status === 'PENDING' ? null : reviewerId,
      reviewedAt: status === 'PENDING' ? null : dayFrom(-int(1, 20)),
      reviewNote: status === 'REJECTED' ? 'Too close to the mock test.' : null,
    });
  }

  for (const [i, status] of (['PENDING', 'APPROVED'] as const).entries()) {
    const f = faculty[i % faculty.length];
    const from = dayFrom(status === 'PENDING' ? int(3, 9) : -int(4, 18));
    rows.push({
      organizationId,
      branchId: f.branchId,
      subjectType: 'FACULTY',
      facultyId: f.id,
      fromDate: dateOnly(from),
      toDate: dateOnly(new Date(from.getTime() + DAY)),
      reason: 'Personal',
      status,
      reviewedById: status === 'PENDING' ? null : reviewerId,
      reviewedAt: status === 'PENDING' ? null : dayFrom(-int(1, 10)),
    });
  }

  await prisma.leaveRequest.createMany({ data: rows });
  console.log(`  leave: ${rows.length} requests (pending, approved, rejected, cancelled; student + faculty)`);
}

/* ── Communication (spec §49) ────────────────────────────────────────────── */

async function seedAnnouncements(
  organizationId: string,
  branches: { id: string; name: string }[],
  batches: { id: string }[],
  publishedById: string,
) {
  const specs = [
    { title: 'All India Mock Test #5 on Sunday', body: 'Report by 8:30 am with your hall ticket and a photo ID.', audience: 'ALL_BRANCHES' as const, status: 'PUBLISHED' as const, pinned: true, targets: [] as string[] },
    { title: 'Independence Day holiday', body: 'All branches remain closed on 15 August.', audience: 'ALL_BRANCHES' as const, status: 'PUBLISHED' as const, pinned: false, targets: [] },
    { title: `${branches[0].name}: Physics class rescheduled`, body: 'Tomorrow’s 9:00 am Physics class moves to 11:00 am.', audience: 'BRANCH' as const, status: 'PUBLISHED' as const, pinned: false, targets: [branches[0].id] },
    { title: 'Parent–teacher meeting', body: 'Scheduled for the first Saturday of next month.', audience: 'BRANCH' as const, status: 'PUBLISHED' as const, pinned: false, targets: branches.slice(0, 2).map((b) => b.id) },
    { title: 'Fee reminder — second installment', body: 'The second installment is due at the end of this month.', audience: 'PARENTS' as const, status: 'PUBLISHED' as const, pinned: false, targets: [branches[0].id] },
    { title: 'Draft: revised timetable', body: 'Not published yet — pending the head of academics.', audience: 'BRANCH' as const, status: 'DRAFT' as const, pinned: false, targets: [branches[0].id] },
    { title: 'Archived: old exam schedule', body: 'Superseded by the current schedule.', audience: 'ALL_BRANCHES' as const, status: 'ARCHIVED' as const, pinned: false, targets: [] },
  ];

  for (const s of specs) {
    await prisma.announcement.create({
      data: {
        organizationId,
        title: s.title,
        body: s.body,
        audience: s.audience,
        status: s.status,
        batchId: null,
        publishedAt: s.status === 'PUBLISHED' ? dayFrom(-int(1, 14)) : null,
        publishedById: s.status === 'PUBLISHED' ? publishedById : null,
        pinnedUntil: s.pinned ? dayFrom(10) : null,
        targets: { create: s.targets.map((branchId) => ({ branchId })) },
      },
    });
  }
  console.log(`  communication: ${specs.length} announcements (published, draft, archived, pinned)`);
}

/* ── Assessment (spec §§51–54) — a test in every status ──────────────────── */

async function seedAssessment(
  organizationId: string,
  branches: { id: string }[],
  batches: { id: string; branchId: string }[],
  subjects: { id: string; name: string }[],
  students: { id: string; branchId: string; batches: { batchId: string }[] }[],
  createdById: string,
) {
  const bank = await prisma.question.findMany({ where: { organizationId, isActive: true }, include: { options: true } });
  if (!bank.length) { console.log('  assessment: skipped, question bank empty'); return; }

  const specs = [
    { title: 'Weekly Test — Mechanics', status: 'DRAFT' as const, days: 7 },
    { title: 'Unit Test — Organic Chemistry', status: 'SCHEDULED' as const, days: 3 },
    { title: 'All India Mock Test #5', status: 'LIVE' as const, days: 0 },
    { title: 'All India Mock Test #4', status: 'CLOSED' as const, days: -6 },
    { title: 'All India Mock Test #3', status: 'RESULTS_PUBLISHED' as const, days: -20 },
    { title: 'All India Mock Test #2', status: 'RESULTS_PUBLISHED' as const, days: -45 },
  ];

  let attemptCount = 0;
  for (const [i, spec] of specs.entries()) {
    const paper = bank.slice(0, Math.min(10, bank.length));
    const totalMarks = paper.reduce((s, q) => s + q.marks, 0);
    const start = dayFrom(spec.days);

    const test = await prisma.test.create({
      data: {
        organizationId,
        title: spec.title,
        code: `DEMO-T${i + 1}`,
        description: 'Demo paper.',
        scope: 'ORGANIZATION',
        mode: 'ONLINE',
        status: spec.status,
        durationMinutes: 180,
        startAt: start,
        endAt: new Date(start.getTime() + 4 * 3600e3),
        totalMarks,
        negativeMarking: true,
        createdById,
        resultsPublishedAt: spec.status === 'RESULTS_PUBLISHED' ? dayFrom(spec.days + 2) : null,
        branches: { create: branches.map((b) => ({ branchId: b.id })) },
        batches: { create: batches.map((b) => ({ batchId: b.id })) },
        questions: {
          create: paper.map((q, seq) => ({ questionId: q.id, sequence: seq, marks: q.marks, negativeMarks: q.negativeMarks })),
        },
      },
    });

    // Going live freezes the paper's questions (spec §51) — mirror that here so
    // the question bank shows genuinely locked rows.
    if (['LIVE', 'CLOSED', 'RESULTS_PUBLISHED'].includes(spec.status)) {
      await prisma.question.updateMany({
        where: { id: { in: paper.map((q) => q.id) }, lockedAt: null },
        data: { lockedAt: start },
      });
    }

    // Attempts only exist for tests that have actually been sat.
    if (!['CLOSED', 'RESULTS_PUBLISHED'].includes(spec.status)) continue;

    const sitting = students.filter((s) => s.batches.length > 0).slice(0, 34);
    const scored: { id: string; score: number; branchId: string; studentId: string }[] = [];

    for (const student of sitting) {
      const correct = int(2, paper.length);
      const wrong = Math.min(paper.length - correct, int(0, 4));
      const score = Math.max(0, paper.slice(0, correct).reduce((s, q) => s + q.marks, 0) - wrong * 1);
      const attempt = await prisma.testAttempt.create({
        data: {
          organizationId,
          branchId: student.branchId,
          testId: test.id,
          studentId: student.id,
          status: 'EVALUATED',
          startedAt: start,
          expiresAt: new Date(start.getTime() + 180 * 60e3),
          submittedAt: new Date(start.getTime() + int(90, 175) * 60e3),
          score,
          maxScore: totalMarks,
          correctCount: correct,
          wrongCount: wrong,
          unattemptedCount: paper.length - correct - wrong,
          percentage: totalMarks === 0 ? 0 : (score / totalMarks) * 100,
        },
        select: { id: true, score: true, branchId: true, studentId: true },
      });

      // Per-question answers, so subject-accuracy analytics has something to read.
      await prisma.testAnswer.createMany({
        data: paper.map((q, idx) => ({
          attemptId: attempt.id,
          questionId: q.id,
          selectedOptionIds: q.options.length ? [q.options[0].id] : [],
          isCorrect: idx < correct ? true : idx < correct + wrong ? false : null,
          marksAwarded: idx < correct ? q.marks : idx < correct + wrong ? -q.negativeMarks : 0,
        })),
      });
      scored.push(attempt);
      attemptCount += 1;
    }

    // Ranks are only meaningful once results are published (spec §54).
    if (spec.status !== 'RESULTS_PUBLISHED') continue;
    const total = scored.length;
    for (const a of scored) {
      const branchPool = scored.filter((x) => x.branchId === a.branchId);
      const below = scored.filter((x) => x.score < a.score).length;
      await prisma.testAttempt.update({
        where: { id: a.id },
        data: {
          organizationRank: scored.filter((x) => x.score > a.score).length + 1,
          branchRank: branchPool.filter((x) => x.score > a.score).length + 1,
          batchRank: branchPool.filter((x) => x.score > a.score).length + 1,
          percentile: total <= 1 ? 100 : (below / (total - 1)) * 100,
        },
      });
    }
  }
  console.log(`  assessment: ${specs.length} tests (draft→published), ${attemptCount} scored attempts with ranks`);
}

/* ── Learning (spec §§58–60) ─────────────────────────────────────────────── */

async function seedLearning(
  organizationId: string,
  branches: { id: string }[],
  batches: { id: string; branchId: string }[],
  subjects: { id: string; name: string }[],
  students: { id: string; branchId: string; batches: { batchId: string }[] }[],
  faculty: { id: string; branchId: string }[],
  createdById: string,
) {
  /* Homework — draft, published with a full roster, and closed. */
  const hwSpecs = [
    { title: 'Thermodynamics — problem set 3', status: 'DRAFT' as const, due: 6 },
    { title: 'Organic reactions — worksheet 7', status: 'PUBLISHED' as const, due: 4 },
    { title: 'Rotational motion — past paper', status: 'PUBLISHED' as const, due: -2 },
    { title: 'Coordination compounds — revision', status: 'CLOSED' as const, due: -12 },
  ];

  // Homework is per-batch, so every batch gets the whole set rather than one
  // spec each — otherwise whichever batch drew the DRAFT spec has no homework
  // at all, and its students' portal shows an empty Homework tab.
  let submissions = 0;
  let homeworkCount = 0;
  for (const spec of hwSpecs) {
    for (const batch of batches) {
      const hw = await prisma.homework.create({
        data: {
          organizationId,
          title: spec.title,
          instructions: 'Attempt every question. Show your working for the numericals.',
          subjectId: pick(subjects).id,
          audience: 'BATCH',
          status: spec.status,
          batchId: batch.id,
          dueAt: dayFrom(spec.due),
          maxMarks: 20,
          publishedAt: spec.status === 'DRAFT' ? null : dayFrom(spec.due - 7),
          createdById,
        },
      });
      homeworkCount += 1;
      if (spec.status === 'DRAFT') continue;

      const roster = students.filter((s) => s.batches.some((b) => b.batchId === batch.id));
      for (const student of roster) {
        const roll = rnd();
        // An overdue assignment leaves some genuinely unsubmitted.
        const status = spec.due < 0
          ? (roll < 0.7 ? 'SUBMITTED' : roll < 0.85 ? 'LATE' : 'PENDING')
          : (roll < 0.4 ? 'SUBMITTED' : 'PENDING');
        const graded = status !== 'PENDING' && chance(0.65);
        await prisma.homeworkSubmission.create({
          data: {
            organizationId,
            homeworkId: hw.id,
            studentId: student.id,
            branchId: student.branchId,
            status,
            submittedAt: status === 'PENDING' ? null : dayFrom(spec.due - int(0, 3)),
            marksAwarded: graded ? int(8, 20) : null,
            feedback: graded ? pick(['Well presented.', 'Check your units in Q4.', 'Good improvement.']) : null,
            gradedAt: graded ? dayFrom(spec.due + 1) : null,
            gradedById: graded ? createdById : null,
          },
        });
        submissions += 1;
    }
    }
  }

  /* Study materials — every visibility tier (spec §60). */
  const matSpecs = [
    { title: 'NEET Physics formula sheet', audience: 'ORGANIZATION' as const, branchIds: [] as string[], batchId: null as string | null, studentIds: [] as string[] },
    { title: 'Chemistry NCERT highlights', audience: 'ORGANIZATION' as const, branchIds: [], batchId: null, studentIds: [] },
    { title: 'Chennai branch — lab safety rules', audience: 'BRANCH' as const, branchIds: [branches[0].id], batchId: null, studentIds: [] },
    { title: 'Batch XII-A — extra practice set', audience: 'BATCH' as const, branchIds: [], batchId: batches[0].id, studentIds: [] },
    { title: 'Remedial pack — algebra', audience: 'STUDENTS' as const, branchIds: [], batchId: null, studentIds: students.slice(0, 3).map((s) => s.id) },
  ];
  for (const m of matSpecs) {
    await prisma.studyMaterial.create({
      data: {
        organizationId,
        title: m.title,
        description: 'Demo material.',
        subjectId: pick(subjects).id,
        audience: m.audience,
        fileUrl: 'https://example.com/demo-material.pdf',
        batchId: m.batchId,
        createdById,
        targets: { create: m.branchIds.map((branchId) => ({ branchId })) },
        students: { create: m.studentIds.map((studentId) => ({ studentId })) },
      },
    });
  }

  /* Doubts — open, answered, closed; assigned and unassigned (spec §59). */
  const questions = [
    'Why does the anti product dominate in this elimination?',
    'How do I decide the sign convention for a concave mirror?',
    'Can you explain the difference between molarity and molality once more?',
    'For projectile motion, when is the range maximum?',
    'I keep getting the oxidation state wrong in permanganate.',
  ];
  const statuses = ['OPEN', 'OPEN', 'ANSWERED', 'ANSWERED', 'CLOSED'] as const;

  for (const [i, q] of questions.entries()) {
    const student = students[i * 5 % students.length];
    const assigned = i % 3 !== 0 ? pick(faculty).id : null; // some left to the branch pool
    const doubt = await prisma.doubt.create({
      data: {
        organizationId,
        branchId: student.branchId,
        studentId: student.id,
        subjectId: pick(subjects).id,
        question: q,
        status: statuses[i],
        assignedToId: assigned,
        raisedById: createdById,
        closedAt: statuses[i] === 'CLOSED' ? dayFrom(-int(1, 8)) : null,
        createdAt: dayFrom(-int(1, 20)),
      },
    });
    if (statuses[i] !== 'OPEN' && assigned) {
      await prisma.doubtMessage.create({
        data: { doubtId: doubt.id, authorId: assigned, body: 'Look at the mechanism step by step — the stability of the intermediate decides it. Worked example attached in class notes.' },
      });
    }
  }

  console.log(`  learning: ${homeworkCount} homework across ${batches.length} batches (+${submissions} submissions), ${matSpecs.length} materials, ${questions.length} doubts`);
}

/* ── Finance (spec §§61–64) ──────────────────────────────────────────────── */

async function seedFinance(
  organizationId: string,
  branches: { id: string; name: string }[],
  courses: { id: string; name: string }[],
  academicYearId: string,
  students: { id: string; branchId: string; name: string }[],
  actorId: string,
) {
  /* Structures — one shared across the organization, one branch-specific. */
  const shared = await prisma.feeStructure.create({
    data: {
      organizationId, branchId: null, courseId: courses[0]?.id ?? null, academicYearId,
      name: 'NEET Two-Year Programme 2026–27',
      description: 'Tuition, study material and test series.',
      totalMinor: 18500000, // ₹1,85,000
      components: {
        create: [
          { name: 'Tuition', amountMinor: 15000000, sequence: 0 },
          { name: 'Study material', amountMinor: 2500000, sequence: 1 },
          { name: 'Test series', amountMinor: 1000000, sequence: 2 },
        ],
      },
    },
  });
  const branchOnly = await prisma.feeStructure.create({
    data: {
      organizationId, branchId: branches[0].id, courseId: courses[1]?.id ?? null, academicYearId,
      name: `${branches[0].name} — Crash Course`,
      totalMinor: 6500000, // ₹65,000
      components: {
        create: [
          { name: 'Tuition', amountMinor: 5500000, sequence: 0 },
          { name: 'Material', amountMinor: 1000000, sequence: 1 },
        ],
      },
    },
  });

  let receipt = 0;
  const nextReceipt = () => `RCP-2026-${String(++receipt).padStart(6, '0')}`;
  let paid = 0, partial = 0, unpaid = 0, refunds = 0, concessions = 0;

  // Every student on the shared structure, in a realistic mix of states.
  for (const [i, student] of students.slice(0, 30).entries()) {
    const structure = i % 5 === 0 && student.branchId === branches[0].id ? branchOnly : shared;
    const gross = structure.totalMinor;

    // Roughly one in five gets a concession — scholarship, discount or waiver.
    let discount = 0;
    const kind = i % 7 === 0 ? 'SCHOLARSHIP' : i % 11 === 0 ? 'DISCOUNT' : null;
    if (kind) discount = kind === 'SCHOLARSHIP' ? Math.round(gross * 0.25) : 500000;
    const net = gross - discount;

    // Two installments, the first already due.
    const half = Math.floor(net / 2);
    const mode = i % 4; // 0 paid, 1 part-paid, 2 unpaid, 3 paid
    const paidMinor = mode === 0 || mode === 3 ? net : mode === 1 ? half : 0;
    const status = paidMinor >= net ? 'PAID' : paidMinor > 0 ? 'PARTIALLY_PAID' : 'PENDING';

    const fee = await prisma.studentFee.create({
      data: {
        organizationId,
        branchId: student.branchId,
        studentId: student.id,
        feeStructureId: structure.id,
        grossMinor: gross,
        discountMinor: discount,
        netMinor: net,
        paidMinor,
        status,
        assignedAt: dayFrom(-int(30, 120)),
        installments: {
          create: [
            {
              label: 'Installment 1', amountMinor: half, sequence: 0,
              dueDate: dateOnly(dayFrom(-20)),
              paidMinor: Math.min(paidMinor, half),
              status: paidMinor >= half ? 'PAID' : paidMinor > 0 ? 'PARTIALLY_PAID' : 'PENDING',
            },
            {
              label: 'Installment 2', amountMinor: net - half, sequence: 1,
              // Deliberately in the past for some, so overdue is visible.
              dueDate: dateOnly(dayFrom(mode === 2 ? -5 : 45)),
              paidMinor: Math.max(0, paidMinor - half),
              status: paidMinor >= net ? 'PAID' : 'PENDING',
            },
          ],
        },
      },
    });

    if (kind) {
      await prisma.feeConcession.create({
        data: {
          studentFeeId: fee.id, kind, amountMinor: discount, grantedById: actorId,
          reason: kind === 'SCHOLARSHIP' ? 'Merit scholarship — 95%+ in board exams' : 'Sibling discount',
        },
      });
      concessions += 1;
    }

    if (paidMinor > 0) {
      const payment = await prisma.feePayment.create({
        data: {
          organizationId, branchId: student.branchId, studentId: student.id, studentFeeId: fee.id,
          receiptNumber: nextReceipt(),
          amountMinor: paidMinor,
          method: pick(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'] as const),
          paidAt: dayFrom(-int(1, 40)),
          collectedById: actorId,
        },
      });

      // One refunded receipt, so the refund path is visible in the UI.
      if (i === 8) {
        const amount = Math.round(paidMinor * 0.2);
        await prisma.feeRefund.create({
          data: { feePaymentId: payment.id, amountMinor: amount, reason: 'Duplicate collection — refunded to parent', refundedById: actorId },
        });
        await prisma.feePayment.update({ where: { id: payment.id }, data: { refundedMinor: amount, status: 'PARTIALLY_REFUNDED' } });
        await prisma.studentFee.update({ where: { id: fee.id }, data: { paidMinor: paidMinor - amount, status: 'PARTIALLY_PAID' } });
        refunds += 1;
      }
    }

    if (status === 'PAID') paid += 1; else if (status === 'PARTIALLY_PAID') partial += 1; else unpaid += 1;
  }

  /* Expenses — every category and status, branch and central (spec §63). */
  const expenseSpecs = [
    { category: 'RENT' as const, title: 'Branch rent — August', amount: 12000000, status: 'PAID' as const, branch: 0 },
    { category: 'SALARY' as const, title: 'Faculty salaries — August', amount: 45000000, status: 'PAID' as const, branch: 0 },
    { category: 'UTILITIES' as const, title: 'Electricity — August', amount: 1850000, status: 'APPROVED' as const, branch: 1 },
    { category: 'MAINTENANCE' as const, title: 'Air-conditioning service', amount: 950000, status: 'PENDING' as const, branch: 1 },
    { category: 'SUPPLIES' as const, title: 'Stationery and printing', amount: 320000, status: 'PENDING' as const, branch: 2 },
    { category: 'EQUIPMENT' as const, title: 'Projector replacement', amount: 4200000, status: 'REJECTED' as const, branch: 2 },
    { category: 'TRANSPORT' as const, title: 'Bus diesel — August', amount: 2800000, status: 'PAID' as const, branch: 0 },
    { category: 'MARKETING' as const, title: 'Admission campaign — central', amount: 9500000, status: 'PAID' as const, branch: -1 },
    { category: 'OTHER' as const, title: 'Head office software licences', amount: 1500000, status: 'APPROVED' as const, branch: -1 },
  ];
  for (const e of expenseSpecs) {
    await prisma.expense.create({
      data: {
        organizationId,
        branchId: e.branch < 0 ? null : branches[e.branch].id,
        category: e.category,
        title: e.title,
        amountMinor: e.amount,
        incurredOn: dateOnly(dayFrom(-int(2, 40))),
        vendor: pick(['Sundaram Traders', 'KSEB', 'Ramesh & Co', 'Anand Services']),
        status: e.status,
        recordedById: actorId,
        approvedById: ['APPROVED', 'PAID'].includes(e.status) ? actorId : null,
        approvedAt: ['APPROVED', 'PAID'].includes(e.status) ? dayFrom(-int(1, 20)) : null,
        paidAt: e.status === 'PAID' ? dayFrom(-int(1, 15)) : null,
      },
    });
  }

  console.log(`  finance: 2 structures, 30 accounts (${paid} paid / ${partial} part / ${unpaid} unpaid), ${concessions} concessions, ${refunds} refund, ${expenseSpecs.length} expenses`);
}

/* ── Portal (spec §65) ───────────────────────────────────────────────────── */

async function seedPortal(
  organizationId: string,
  allStudents: { id: string; branchId: string; name: string; batches: { batchId: string }[] }[],
) {
  let links = 0;
  // Without a password the seeded parents exist but cannot sign in, which
  // leaves the whole portal unreachable from demo data. Hashed once — argon2 is
  // deliberately slow, and these all share the same password.
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  // Guardians are only attached to students who sit in a batch. An unenrolled
  // student has no attendance, homework or results, so linking a parent to one
  // produces a portal that is empty on every tab — which looks like a bug in
  // the portal rather than the absence of enrolment it actually is.
  const students = allStudents.filter((s) => s.batches.length > 0);

  // Ordinary case: one parent, one child.
  for (const student of students.slice(0, 6)) {
    const surname = student.name.split(' ').slice(-1)[0];
    const email = `parent.${student.id.slice(0, 8)}@example.com`;
    const user = await prisma.orgUser.upsert({
      where: { organizationId_email: { organizationId, email } },
      update: { passwordHash },
      create: {
        organizationId, name: `${surname} (parent)`, email, role: 'PARENT',
        acceptedAt: dayFrom(-int(10, 90)), passwordHash,
      },
      select: { id: true },
    });
    await prisma.guardian.create({
      data: { organizationId, userId: user.id, studentId: student.id, relation: 'Father', isPrimary: true },
    });
    links += 1;
  }

  // The case spec §65 actually calls out: one parent, two children, different
  // branches — which is what makes the child switcher necessary.
  const a = students[0];
  const b = students.find((s) => s.branchId !== a.branchId);
  if (b) {
    const email = 'shared.parent@example.com';
    const user = await prisma.orgUser.upsert({
      where: { organizationId_email: { organizationId, email } },
      update: { passwordHash },
      create: { organizationId, name: 'Sunita Rao', email, role: 'PARENT', acceptedAt: dayFrom(-40), passwordHash },
      select: { id: true },
    });
    for (const child of [a, b]) {
      await prisma.guardian.upsert({
        where: { userId_studentId: { userId: user.id, studentId: child.id } },
        update: {},
        create: { organizationId, userId: user.id, studentId: child.id, relation: 'Mother', isPrimary: false },
      });
      links += 1;
    }
  }
  console.log(`  portal: ${links} guardian links (incl. one parent with children at two branches)`);
}

/* ── Facilities (spec §§66–68) ───────────────────────────────────────────── */

async function seedFacilities(
  organizationId: string,
  branches: { id: string; name: string }[],
  students: { id: string; branchId: string }[],
) {
  /* Hostel — boys and girls, with one room deliberately full. */
  let beds = 0, allocated = 0;
  for (const [i, occupancy] of (['BOYS', 'GIRLS'] as const).entries()) {
    const hostel = await prisma.hostel.create({
      data: {
        organizationId,
        branchId: branches[0].id,
        name: `${occupancy === 'BOYS' ? 'Ganga' : 'Yamuna'} ${occupancy === 'BOYS' ? 'Boys' : 'Girls'} Hostel`,
        code: `HST-${occupancy.slice(0, 1)}${i + 1}`,
        occupancy,
        wardenName: occupancy === 'BOYS' ? 'Mohan Das' : 'Latha Pillai',
        wardenPhone: `+91 9${int(100000000, 999999999)}`,
        address: `${branches[0].name} campus`,
        rooms: {
          create: Array.from({ length: 6 }, (_, r) => ({
            roomNumber: `${i + 1}0${r + 1}`,
            floor: r < 3 ? 'Ground' : 'First',
            capacity: r === 0 ? 1 : 3, // room 1 holds one bed, so it fills immediately
          })),
        },
      },
      include: { rooms: true },
    });
    beds += hostel.rooms.reduce((s, r) => s + r.capacity, 0);

    const pool = students.filter((s) => s.branchId === branches[0].id).slice(i * 6, i * 6 + 6);
    for (const [j, student] of pool.entries()) {
      const room = hostel.rooms[j % hostel.rooms.length];
      const fresh = await prisma.hostelRoom.findUniqueOrThrow({ where: { id: room.id } });
      if (fresh.occupied >= fresh.capacity) continue;
      await prisma.hostelAllocation.create({
        data: { organizationId, roomId: room.id, studentId: student.id, allocatedAt: dayFrom(-int(20, 200)) },
      });
      await prisma.hostelRoom.update({ where: { id: room.id }, data: { occupied: { increment: 1 } } });
      allocated += 1;
    }
  }

  // An ended stay, so history is visible rather than only current occupancy.
  const past = await prisma.hostelAllocation.findFirst({ where: { organizationId, status: 'ACTIVE' } });
  if (past) {
    await prisma.hostelAllocation.update({
      where: { id: past.id },
      data: { status: 'ENDED', endedAt: dayFrom(-10), endReason: 'Moved to a day-scholar arrangement' },
    });
    await prisma.hostelRoom.update({ where: { id: past.roomId }, data: { occupied: { decrement: 1 } } });
    allocated -= 1;
  }

  /* Transport — vehicles, routes with stops, riders (spec §67). */
  const vehicles = [];
  for (const [i, spec] of [
    { reg: 'TN 09 AB 1234', model: 'Tata Starbus', capacity: 40, status: 'ACTIVE' as const, driver: 'Selvam R' },
    { reg: 'TN 09 CD 5678', model: 'Force Traveller', capacity: 20, status: 'ACTIVE' as const, driver: 'Prakash M' },
    { reg: 'TN 09 EF 9012', model: 'Ashok Leyland', capacity: 45, status: 'MAINTENANCE' as const, driver: 'Ibrahim K' },
  ].entries()) {
    vehicles.push(await prisma.vehicle.create({
      data: {
        organizationId, branchId: branches[i % branches.length].id,
        registration: spec.reg, model: spec.model, capacity: spec.capacity, status: spec.status,
        driverName: spec.driver, driverPhone: `+91 9${int(100000000, 999999999)}`,
        driverLicence: `TN${int(10, 99)}${int(10000000, 99999999)}`,
      },
    }));
  }

  let riders = 0;
  const routeSpecs = [
    { name: 'Velachery — Adyar', code: 'RT-VEL', fare: 900000, stops: ['Velachery signal', 'Guindy', 'Saidapet', 'Adyar depot'] },
    { name: 'Tambaram — Chromepet', code: 'RT-TAM', fare: 1100000, stops: ['Tambaram station', 'Chromepet', 'Pallavaram'] },
  ];
  for (const [i, spec] of routeSpecs.entries()) {
    const route = await prisma.transportRoute.create({
      data: {
        organizationId, branchId: branches[0].id, vehicleId: vehicles[i].id,
        name: spec.name, code: spec.code, fareMinor: spec.fare,
        stops: {
          create: spec.stops.map((name, seq) => ({
            name, sequence: seq, pickupMinute: 420 + seq * 12, dropMinute: 1020 + seq * 12,
          })),
        },
      },
      include: { stops: true },
    });
    for (const student of students.filter((s) => s.branchId === branches[0].id).slice(i * 5, i * 5 + 5)) {
      await prisma.transportAllocation.create({
        data: {
          organizationId, routeId: route.id, stopId: pick(route.stops).id,
          studentId: student.id, allocatedAt: dayFrom(-int(10, 150)),
        },
      });
      riders += 1;
    }
  }

  /* Mess — a centralised plan and a branch one (spec §68). */
  const plans = [];
  plans.push(await prisma.messPlan.create({
    data: { organizationId, branchId: null, name: 'Full board — vegetarian', description: 'Breakfast, lunch and dinner.', monthlyFareMinor: 450000 },
  }));
  plans.push(await prisma.messPlan.create({
    data: { organizationId, branchId: branches[0].id, name: 'Lunch only', description: 'Weekday lunch.', monthlyFareMinor: 220000 },
  }));

  let subs = 0;
  for (const [i, student] of students.slice(0, 10).entries()) {
    await prisma.messSubscription.create({
      data: {
        organizationId, messPlanId: plans[i % plans.length].id, studentId: student.id,
        startedAt: dayFrom(-int(20, 120)),
        status: i === 9 ? 'ENDED' : 'ACTIVE',
        endedAt: i === 9 ? dayFrom(-5) : null,
        endReason: i === 9 ? 'Moved to day scholar' : null,
      },
    });
    subs += 1;
  }

  console.log(`  facilities: 2 hostels (${beds} beds, ${allocated} occupied), ${vehicles.length} vehicles, ${routeSpecs.length} routes (${riders} riders), ${plans.length} mess plans (${subs} subscriptions)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
