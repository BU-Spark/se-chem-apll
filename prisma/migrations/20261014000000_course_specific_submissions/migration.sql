-- Breaking greenfield migration: reset only incompatible student activity.
-- Authored content and enrollments are preserved.
BEGIN;
DELETE FROM "NodeResponse";
DELETE FROM "NodeAttempt";
DELETE FROM "LessonProgress";
-- CreateEnum
CREATE TYPE "AttemptKind" AS ENUM ('QUIZ', 'CHECKPOINT', 'REVIEW');

-- CreateEnum
CREATE TYPE "SubmissionGradeStatus" AS ENUM ('GRADED', 'COMPLETION_ONLY');

-- DropForeignKey
ALTER TABLE "LessonProgress" DROP CONSTRAINT "LessonProgress_studentId_fkey";

-- DropForeignKey
ALTER TABLE "LessonProgress" DROP CONSTRAINT "LessonProgress_lessonId_fkey";

-- DropForeignKey
ALTER TABLE "NodeAttempt" DROP CONSTRAINT "NodeAttempt_lessonNodeId_fkey";

-- DropForeignKey
ALTER TABLE "NodeResponse" DROP CONSTRAINT "NodeResponse_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "NodeResponse" DROP CONSTRAINT "NodeResponse_checkpointQuestionId_fkey";

-- DropForeignKey
ALTER TABLE "NodeResponse" DROP CONSTRAINT "NodeResponse_quizQuestionId_fkey";

-- AlterTable
ALTER TABLE "NodeAttempt" ADD COLUMN     "contentKey" TEXT NOT NULL,
ADD COLUMN     "courseLessonId" TEXT NOT NULL,
ADD COLUMN     "idempotencyKey" TEXT NOT NULL,
ADD COLUMN     "kind" "AttemptKind" NOT NULL,
ADD COLUMN     "progressId" TEXT NOT NULL,
ADD COLUMN     "snapshot" JSONB NOT NULL,
ALTER COLUMN "lessonNodeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "NodeResponse" ADD COLUMN     "questionKey" TEXT NOT NULL,
ADD COLUMN     "snapshot" JSONB NOT NULL;

-- DropTable
DROP TABLE "LessonProgress";

-- CreateTable
CREATE TABLE "CourseLessonProgress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseLessonId" TEXT NOT NULL,
    "status" "LessonStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseLessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonSubmission" (
    "id" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradingStatus" "SubmissionGradeStatus" NOT NULL,
    "rawPercent" DOUBLE PRECISION,
    "penaltyPercent" DOUBLE PRECISION NOT NULL,
    "finalPercent" DOUBLE PRECISION,
    "passed" BOOLEAN NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "LessonSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionAttempt" (
    "submissionId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,

    CONSTRAINT "SubmissionAttempt_pkey" PRIMARY KEY ("submissionId","attemptId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseLessonProgress_studentId_courseLessonId_key" ON "CourseLessonProgress"("studentId", "courseLessonId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseLessonProgress_id_studentId_courseLessonId_key" ON "CourseLessonProgress"("id", "studentId", "courseLessonId");

-- CreateIndex
CREATE INDEX "LessonSubmission_progressId_finalPercent_submittedAt_idx" ON "LessonSubmission"("progressId", "finalPercent", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LessonSubmission_progressId_number_key" ON "LessonSubmission"("progressId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "LessonSubmission_progressId_idempotencyKey_key" ON "LessonSubmission"("progressId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "LessonSubmission_id_progressId_key" ON "LessonSubmission"("id", "progressId");

-- CreateIndex
CREATE INDEX "NodeAttempt_progressId_completedAt_idx" ON "NodeAttempt"("progressId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NodeAttempt_progressId_idempotencyKey_key" ON "NodeAttempt"("progressId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "NodeAttempt_id_progressId_key" ON "NodeAttempt"("id", "progressId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeAttempt_id_userId_key" ON "NodeAttempt"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeResponse_attemptId_questionKey_key" ON "NodeResponse"("attemptId", "questionKey");

-- AddForeignKey
ALTER TABLE "CourseLessonProgress" ADD CONSTRAINT "CourseLessonProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLessonProgress" ADD CONSTRAINT "CourseLessonProgress_courseLessonId_fkey" FOREIGN KEY ("courseLessonId") REFERENCES "CourseLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSubmission" ADD CONSTRAINT "LessonSubmission_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "CourseLessonProgress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttempt" ADD CONSTRAINT "NodeAttempt_lessonNodeId_fkey" FOREIGN KEY ("lessonNodeId") REFERENCES "LessonNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAttempt" ADD CONSTRAINT "NodeAttempt_progressId_userId_courseLessonId_fkey" FOREIGN KEY ("progressId", "userId", "courseLessonId") REFERENCES "CourseLessonProgress"("id", "studentId", "courseLessonId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAttempt" ADD CONSTRAINT "SubmissionAttempt_submissionId_progressId_fkey" FOREIGN KEY ("submissionId", "progressId") REFERENCES "LessonSubmission"("id", "progressId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAttempt" ADD CONSTRAINT "SubmissionAttempt_attemptId_progressId_fkey" FOREIGN KEY ("attemptId", "progressId") REFERENCES "NodeAttempt"("id", "progressId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeResponse" ADD CONSTRAINT "NodeResponse_attemptId_studentId_fkey" FOREIGN KEY ("attemptId", "studentId") REFERENCES "NodeAttempt"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeResponse" ADD CONSTRAINT "NodeResponse_checkpointQuestionId_fkey" FOREIGN KEY ("checkpointQuestionId") REFERENCES "CheckpointQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeResponse" ADD CONSTRAINT "NodeResponse_quizQuestionId_fkey" FOREIGN KEY ("quizQuestionId") REFERENCES "QuizQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "LessonSubmission" ADD CONSTRAINT "submission_grades_valid" CHECK (
  "penaltyPercent" BETWEEN 0 AND 100 AND
  (("gradingStatus" = 'GRADED' AND "rawPercent" BETWEEN 0 AND 100 AND "finalPercent" BETWEEN 0 AND 100 AND "rawPercent" IS NOT NULL AND "finalPercent" IS NOT NULL)
  OR ("gradingStatus" = 'COMPLETION_ONLY' AND "rawPercent" IS NULL AND "finalPercent" IS NULL))
);
ALTER TABLE "NodeAttempt" ADD CONSTRAINT "attempt_score_valid" CHECK (score IS NULL OR score BETWEEN 0 AND 100);
CREATE FUNCTION protect_submission_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Finalized submission history is immutable';
END;
$$;
CREATE TRIGGER immutable_submission BEFORE UPDATE OR DELETE ON "LessonSubmission" FOR EACH ROW EXECUTE FUNCTION protect_submission_history();
CREATE TRIGGER immutable_submission_attempt BEFORE UPDATE OR DELETE ON "SubmissionAttempt" FOR EACH ROW EXECUTE FUNCTION protect_submission_history();
CREATE FUNCTION protect_completed_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."completedAt" IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Completed attempts are immutable'; END IF;
    IF NEW."lessonNodeId" IS NULL AND (to_jsonb(NEW) - 'lessonNodeId') = (to_jsonb(OLD) - 'lessonNodeId') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Completed attempts are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_completed_attempt BEFORE UPDATE OR DELETE ON "NodeAttempt" FOR EACH ROW EXECUTE FUNCTION protect_completed_attempt();
CREATE FUNCTION protect_response_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM 1 FROM "NodeAttempt" WHERE id = NEW."attemptId" AND "completedAt" IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cannot add responses to completed attempts'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM "NodeAttempt" WHERE id = OLD."attemptId" AND "completedAt" IS NULL) THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'quizQuestionId' - 'checkpointQuestionId') = (to_jsonb(OLD) - 'quizQuestionId' - 'checkpointQuestionId')
    AND (NEW."quizQuestionId" IS NULL OR NEW."quizQuestionId" IS NOT DISTINCT FROM OLD."quizQuestionId")
    AND (NEW."checkpointQuestionId" IS NULL OR NEW."checkpointQuestionId" IS NOT DISTINCT FROM OLD."checkpointQuestionId") THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Recorded responses are immutable';
END;
$$;
CREATE TRIGGER immutable_response BEFORE INSERT OR UPDATE OR DELETE ON "NodeResponse" FOR EACH ROW EXECUTE FUNCTION protect_response_history();
COMMIT;
