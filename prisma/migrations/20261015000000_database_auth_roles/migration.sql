CREATE TYPE "AppRole" AS ENUM ('STUDENT', 'INSTRUCTOR');
CREATE TYPE "PlatformRole" AS ENUM ('MEMBER', 'ADMIN');
ALTER TABLE "Student" ADD COLUMN "clerkUserId" TEXT,
    ADD COLUMN "appRole" "AppRole",
    ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'MEMBER';
CREATE UNIQUE INDEX "Student_clerkUserId_key" ON "Student"("clerkUserId");
CREATE TABLE "RoleAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "targetId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "previousAppRole" "AppRole",
    "newAppRole" "AppRole",
    "previousPlatformRole" "PlatformRole" NOT NULL,
    "newPlatformRole" "PlatformRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoleAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RoleAudit_targetId_createdAt_idx" ON "RoleAudit"("targetId", "createdAt");
