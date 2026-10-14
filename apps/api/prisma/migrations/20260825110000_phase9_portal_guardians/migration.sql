-- AlterTable
ALTER TABLE "students" ADD COLUMN     "portalUserId" UUID;

-- CreateTable
CREATE TABLE "guardians" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "relation" VARCHAR(40) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guardians_studentId_idx" ON "guardians"("studentId");

-- CreateIndex
CREATE INDEX "guardians_organizationId_userId_idx" ON "guardians"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_userId_studentId_key" ON "guardians"("userId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "students_portalUserId_key" ON "students"("portalUserId");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "org_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_userId_fkey" FOREIGN KEY ("userId") REFERENCES "org_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

