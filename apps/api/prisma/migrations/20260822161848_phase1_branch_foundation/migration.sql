-- CreateTable
CREATE TABLE "org_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "activeBranchId" UUID,
    "userAgent" VARCHAR(400),
    "ipAddress" VARCHAR(64),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_transfers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "entityType" VARCHAR(20) NOT NULL,
    "entityId" UUID NOT NULL,
    "entityLabel" VARCHAR(160),
    "fromBranchId" UUID,
    "toBranchId" UUID NOT NULL,
    "reason" VARCHAR(400),
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,
    "actorEmail" VARCHAR(180),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_sessions_refreshTokenHash_key" ON "org_sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "org_sessions_userId_revokedAt_idx" ON "org_sessions"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "org_password_reset_tokens_tokenHash_key" ON "org_password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "org_password_reset_tokens_userId_idx" ON "org_password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "branch_transfers_organizationId_createdAt_idx" ON "branch_transfers"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "branch_transfers_entityType_entityId_idx" ON "branch_transfers"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "org_sessions" ADD CONSTRAINT "org_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "org_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_password_reset_tokens" ADD CONSTRAINT "org_password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "org_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfers" ADD CONSTRAINT "branch_transfers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfers" ADD CONSTRAINT "branch_transfers_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfers" ADD CONSTRAINT "branch_transfers_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
