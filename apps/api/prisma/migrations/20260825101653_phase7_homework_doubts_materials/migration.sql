-- CreateEnum
CREATE TYPE "HomeworkAudience" AS ENUM ('BRANCH', 'MULTI_BRANCH', 'BATCH', 'STUDENTS');

-- CreateEnum
CREATE TYPE "HomeworkStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'LATE');

-- CreateEnum
CREATE TYPE "MaterialAudience" AS ENUM ('ORGANIZATION', 'BRANCH', 'MULTI_BRANCH', 'BATCH', 'STUDENTS');

-- CreateEnum
CREATE TYPE "DoubtStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateTable
CREATE TABLE "homework" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "instructions" VARCHAR(4000) NOT NULL,
    "subjectId" UUID,
    "audience" "HomeworkAudience" NOT NULL DEFAULT 'BATCH',
    "status" "HomeworkStatus" NOT NULL DEFAULT 'DRAFT',
    "batchId" UUID,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "maxMarks" DOUBLE PRECISION,
    "attachmentUrl" VARCHAR(400),
    "publishedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_targets" (
    "homeworkId" UUID NOT NULL,
    "branchId" UUID NOT NULL,

    CONSTRAINT "homework_targets_pkey" PRIMARY KEY ("homeworkId","branchId")
);

-- CreateTable
CREATE TABLE "homework_students" (
    "homeworkId" UUID NOT NULL,
    "studentId" UUID NOT NULL,

    CONSTRAINT "homework_students_pkey" PRIMARY KEY ("homeworkId","studentId")
);

-- CreateTable
CREATE TABLE "homework_submissions" (
    "id" UUID NOT NULL,
    "homeworkId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "attachmentUrl" VARCHAR(400),
    "note" VARCHAR(2000),
    "marksAwarded" DOUBLE PRECISION,
    "feedback" VARCHAR(2000),
    "gradedAt" TIMESTAMP(3),
    "gradedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_materials" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "subjectId" UUID,
    "audience" "MaterialAudience" NOT NULL DEFAULT 'BATCH',
    "fileUrl" VARCHAR(400) NOT NULL,
    "batchId" UUID,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_material_targets" (
    "materialId" UUID NOT NULL,
    "branchId" UUID NOT NULL,

    CONSTRAINT "study_material_targets_pkey" PRIMARY KEY ("materialId","branchId")
);

-- CreateTable
CREATE TABLE "study_material_students" (
    "materialId" UUID NOT NULL,
    "studentId" UUID NOT NULL,

    CONSTRAINT "study_material_students_pkey" PRIMARY KEY ("materialId","studentId")
);

-- CreateTable
CREATE TABLE "doubts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "batchId" UUID,
    "subjectId" UUID NOT NULL,
    "question" VARCHAR(2000) NOT NULL,
    "status" "DoubtStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" UUID,
    "raisedById" UUID NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doubts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doubt_messages" (
    "id" UUID NOT NULL,
    "doubtId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doubt_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homework_organizationId_status_dueAt_idx" ON "homework"("organizationId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "homework_targets_branchId_idx" ON "homework_targets"("branchId");

-- CreateIndex
CREATE INDEX "homework_students_studentId_idx" ON "homework_students"("studentId");

-- CreateIndex
CREATE INDEX "homework_submissions_studentId_status_idx" ON "homework_submissions"("studentId", "status");

-- CreateIndex
CREATE INDEX "homework_submissions_branchId_status_idx" ON "homework_submissions"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "homework_submissions_homeworkId_studentId_key" ON "homework_submissions"("homeworkId", "studentId");

-- CreateIndex
CREATE INDEX "study_materials_organizationId_audience_isArchived_idx" ON "study_materials"("organizationId", "audience", "isArchived");

-- CreateIndex
CREATE INDEX "study_material_targets_branchId_idx" ON "study_material_targets"("branchId");

-- CreateIndex
CREATE INDEX "study_material_students_studentId_idx" ON "study_material_students"("studentId");

-- CreateIndex
CREATE INDEX "doubts_organizationId_branchId_status_idx" ON "doubts"("organizationId", "branchId", "status");

-- CreateIndex
CREATE INDEX "doubts_assignedToId_status_idx" ON "doubts"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "doubt_messages_doubtId_createdAt_idx" ON "doubt_messages"("doubtId", "createdAt");

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "org_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_students" ADD CONSTRAINT "homework_students_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_students" ADD CONSTRAINT "homework_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "org_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "org_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_material_targets" ADD CONSTRAINT "study_material_targets_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "study_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_material_targets" ADD CONSTRAINT "study_material_targets_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_material_students" ADD CONSTRAINT "study_material_students_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "study_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_material_students" ADD CONSTRAINT "study_material_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doubts" ADD CONSTRAINT "doubts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doubts" ADD CONSTRAINT "doubts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doubts" ADD CONSTRAINT "doubts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doubts" ADD CONSTRAINT "doubts_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doubts" ADD CONSTRAINT "doubts_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doubts" ADD CONSTRAINT "doubts_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "org_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doubts" ADD CONSTRAINT "doubts_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "org_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doubt_messages" ADD CONSTRAINT "doubt_messages_doubtId_fkey" FOREIGN KEY ("doubtId") REFERENCES "doubts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doubt_messages" ADD CONSTRAINT "doubt_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "org_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
