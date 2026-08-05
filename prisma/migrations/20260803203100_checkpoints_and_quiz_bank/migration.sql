-- Greenfield / reseed only: this migration does not retain production NodeResponse rows.
-- Existing answers cannot be mapped from the old questionId model, so they are deleted first.

-- DropForeignKey
ALTER TABLE "NodeQuestion" DROP CONSTRAINT "NodeQuestion_nodeId_fkey";

-- DropForeignKey
ALTER TABLE "NodeResponse" DROP CONSTRAINT "NodeResponse_questionId_fkey";

-- Clear unmappable responses before dropping the old question FK column.
DELETE FROM "NodeResponse";

-- AlterTable
ALTER TABLE "NodeResponse" DROP COLUMN "questionId",
ADD COLUMN     "checkpointQuestionId" TEXT,
ADD COLUMN     "quizQuestionId" TEXT;

-- DropTable
DROP TABLE "NodeQuestion";

-- CreateTable
CREATE TABLE "NodeCheckpoint" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "timeOffsetSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckpointQuestion" (
    "id" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIndices" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckpointQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIndices" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NodeCheckpoint_nodeId_sortOrder_key" ON "NodeCheckpoint"("nodeId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "NodeCheckpoint_nodeId_timeOffsetSeconds_key" ON "NodeCheckpoint"("nodeId", "timeOffsetSeconds");

-- CreateIndex
CREATE UNIQUE INDEX "CheckpointQuestion_checkpointId_sortOrder_key" ON "CheckpointQuestion"("checkpointId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "QuizQuestion_nodeId_sortOrder_key" ON "QuizQuestion"("nodeId", "sortOrder");

-- CreateIndex
CREATE INDEX "NodeResponse_checkpointQuestionId_idx" ON "NodeResponse"("checkpointQuestionId");

-- CreateIndex
CREATE INDEX "NodeResponse_quizQuestionId_idx" ON "NodeResponse"("quizQuestionId");

-- AddForeignKey
ALTER TABLE "NodeCheckpoint" ADD CONSTRAINT "NodeCheckpoint_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckpointQuestion" ADD CONSTRAINT "CheckpointQuestion_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "NodeCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeResponse" ADD CONSTRAINT "NodeResponse_checkpointQuestionId_fkey" FOREIGN KEY ("checkpointQuestionId") REFERENCES "CheckpointQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeResponse" ADD CONSTRAINT "NodeResponse_quizQuestionId_fkey" FOREIGN KEY ("quizQuestionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one of the two question FKs must be set.
ALTER TABLE "NodeResponse" ADD CONSTRAINT "NodeResponse_one_question_fkey_check" CHECK (
  ("checkpointQuestionId" IS NOT NULL AND "quizQuestionId" IS NULL)
  OR ("checkpointQuestionId" IS NULL AND "quizQuestionId" IS NOT NULL)
);
