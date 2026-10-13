-- Preserve each assignment's existing visibility choice while reversing the label.
ALTER TABLE "CourseLesson" RENAME COLUMN "accessibleAfterDue" TO "hideAfterDue";
UPDATE "CourseLesson" SET "hideAfterDue" = NOT "hideAfterDue";
ALTER TABLE "CourseLesson" ALTER COLUMN "hideAfterDue" SET DEFAULT true;
CREATE TYPE "LatePenaltyType" AS ENUM ('NONE', 'FIXED', 'HOURLY', 'DAILY');
ALTER TABLE "CourseLesson"
  ADD COLUMN "lateDeadline" TIMESTAMP(3),
  ADD COLUMN "latePenaltyType" "LatePenaltyType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "latePenaltyPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CourseLesson" ADD CONSTRAINT "CourseLesson_late_policy_check" CHECK (
  "latePenaltyPercent" >= 0 AND "latePenaltyPercent" <= 100
  AND ("lateDeadline" IS NULL OR ("dueDate" IS NOT NULL AND "lateDeadline" > "dueDate" AND NOT "hideAfterDue"))
  AND (("latePenaltyType" = 'NONE' AND "latePenaltyPercent" = 0)
    OR ("latePenaltyType" <> 'NONE' AND "lateDeadline" IS NOT NULL AND "latePenaltyPercent" > 0))
);
