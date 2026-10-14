-- CreateEnum
CREATE TYPE "TargetExam" AS ENUM ('NEET', 'JEE_MAIN', 'JEE_ADVANCED', 'NEET_JEE', 'FOUNDATION', 'OTHER');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BatchStudentStatus" AS ENUM ('ENROLLED', 'LEFT', 'COMPLETED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DROPPED', 'PASSED_OUT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EnquiryStage" AS ENUM ('NEW', 'CONTACTED', 'COUNSELLING', 'TRIAL', 'FOLLOW_UP', 'ADMITTED', 'LOST');

-- CreateEnum
CREATE TYPE "EnquirySource" AS ENUM ('WALK_IN', 'PHONE', 'WEBSITE', 'REFERRAL', 'SOCIAL_MEDIA', 'CAMPAIGN', 'OTHER');

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "targetExam" "TargetExam" NOT NULL DEFAULT 'NEET',
    "durationMonths" INTEGER NOT NULL DEFAULT 12,
    "description" VARCHAR(400),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "courseId" UUID,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PLANNED',
    "capacity" INTEGER NOT NULL DEFAULT 60,
    "room" VARCHAR(60),
    "startDate" DATE,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_students" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "BatchStudentStatus" NOT NULL DEFAULT 'ENROLLED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "note" VARCHAR(400),

    CONSTRAINT "batch_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_faculty" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "facultyId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "isClassTeacher" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "batch_faculty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "studentCode" VARCHAR(24) NOT NULL,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "name" VARCHAR(140) NOT NULL,
    "photoUrl" VARCHAR(400),
    "dateOfBirth" DATE,
    "gender" "Gender" NOT NULL DEFAULT 'UNDISCLOSED',
    "phone" VARCHAR(20),
    "email" VARCHAR(180),
    "parentName" VARCHAR(120),
    "parentPhone" VARCHAR(20),
    "parentEmail" VARCHAR(180),
    "parentRelation" VARCHAR(20),
    "previousSchool" VARCHAR(160),
    "previousClass" VARCHAR(40),
    "previousMarks" VARCHAR(40),
    "targetExam" "TargetExam" NOT NULL DEFAULT 'NEET',
    "courseId" UUID,
    "admissionDate" DATE NOT NULL,
    "addressLine" VARCHAR(200),
    "city" VARCHAR(80),
    "state" VARCHAR(80),
    "pincode" VARCHAR(12),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_branch_history" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toDate" TIMESTAMP(3),
    "reason" VARCHAR(400),
    "actorId" UUID,

    CONSTRAINT "student_branch_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiries" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "enquiryCode" VARCHAR(24) NOT NULL,
    "stage" "EnquiryStage" NOT NULL DEFAULT 'NEW',
    "source" "EnquirySource" NOT NULL DEFAULT 'WALK_IN',
    "studentName" VARCHAR(140) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(180),
    "parentName" VARCHAR(120),
    "parentPhone" VARCHAR(20),
    "targetExam" "TargetExam" NOT NULL DEFAULT 'NEET',
    "courseId" UUID,
    "assignedToId" UUID,
    "nextFollowUpAt" TIMESTAMP(3),
    "lostReason" VARCHAR(400),
    "notes" VARCHAR(1000),
    "convertedStudentId" UUID,
    "admittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_activities" (
    "id" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "type" VARCHAR(24) NOT NULL,
    "fromStage" "EnquiryStage",
    "toStage" "EnquiryStage",
    "note" VARCHAR(1000),
    "scheduledAt" TIMESTAMP(3),
    "actorId" UUID,
    "actorName" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courses_organizationId_isActive_idx" ON "courses"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "courses_organizationId_code_key" ON "courses"("organizationId", "code");

-- CreateIndex
CREATE INDEX "subjects_organizationId_courseId_idx" ON "subjects"("organizationId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_organizationId_code_key" ON "subjects"("organizationId", "code");

-- CreateIndex
CREATE INDEX "academic_years_organizationId_isCurrent_idx" ON "academic_years"("organizationId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_organizationId_name_key" ON "academic_years"("organizationId", "name");

-- CreateIndex
CREATE INDEX "batches_organizationId_branchId_status_idx" ON "batches"("organizationId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "batches_organizationId_code_key" ON "batches"("organizationId", "code");

-- CreateIndex
CREATE INDEX "batch_students_studentId_status_idx" ON "batch_students"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "batch_students_batchId_studentId_key" ON "batch_students"("batchId", "studentId");

-- CreateIndex
CREATE INDEX "batch_faculty_facultyId_endedAt_idx" ON "batch_faculty"("facultyId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "batch_faculty_batchId_facultyId_subjectId_key" ON "batch_faculty"("batchId", "facultyId", "subjectId");

-- CreateIndex
CREATE INDEX "students_organizationId_branchId_status_idx" ON "students"("organizationId", "branchId", "status");

-- CreateIndex
CREATE INDEX "students_organizationId_status_idx" ON "students"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "students_organizationId_studentCode_key" ON "students"("organizationId", "studentCode");

-- CreateIndex
CREATE INDEX "student_branch_history_studentId_fromDate_idx" ON "student_branch_history"("studentId", "fromDate");

-- CreateIndex
CREATE UNIQUE INDEX "enquiries_convertedStudentId_key" ON "enquiries"("convertedStudentId");

-- CreateIndex
CREATE INDEX "enquiries_organizationId_branchId_stage_idx" ON "enquiries"("organizationId", "branchId", "stage");

-- CreateIndex
CREATE INDEX "enquiries_organizationId_nextFollowUpAt_idx" ON "enquiries"("organizationId", "nextFollowUpAt");

-- CreateIndex
CREATE UNIQUE INDEX "enquiries_organizationId_enquiryCode_key" ON "enquiries"("organizationId", "enquiryCode");

-- CreateIndex
CREATE INDEX "enquiry_activities_enquiryId_createdAt_idx" ON "enquiry_activities"("enquiryId", "createdAt");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_students" ADD CONSTRAINT "batch_students_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_students" ADD CONSTRAINT "batch_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_faculty" ADD CONSTRAINT "batch_faculty_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_faculty" ADD CONSTRAINT "batch_faculty_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "org_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_faculty" ADD CONSTRAINT "batch_faculty_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_branch_history" ADD CONSTRAINT "student_branch_history_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_branch_history" ADD CONSTRAINT "student_branch_history_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "org_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_convertedStudentId_fkey" FOREIGN KEY ("convertedStudentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_activities" ADD CONSTRAINT "enquiry_activities_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
