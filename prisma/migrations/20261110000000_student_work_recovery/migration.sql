-- Additive: finalized attempts and immutable grading history are unchanged.
CREATE TYPE "AttemptPurpose" AS ENUM ('STANDARD', 'IMPROVEMENT');
ALTER TABLE "NodeAttempt"
  ADD COLUMN "purpose" "AttemptPurpose" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "draftAnswers" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "videoCompletedAt" TIMESTAMP(3);
