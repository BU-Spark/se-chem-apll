-- Add quizQuestionCount to LessonNode and backfill from each node's
-- current pre-lecture (question bank) size so existing lessons keep
-- "show the full bank" behavior.

ALTER TABLE "LessonNode" ADD COLUMN "quizQuestionCount" INTEGER;

UPDATE "LessonNode" AS lesson_node
SET "quizQuestionCount" = COALESCE(bank.cnt, 0)
FROM (
  SELECT "nodeId", COUNT(*)::int AS cnt
  FROM "NodeQuestion"
  WHERE "isPreLecture" = true
  GROUP BY "nodeId"
) AS bank
WHERE lesson_node."nodeId" = bank."nodeId";

UPDATE "LessonNode"
SET "quizQuestionCount" = 0
WHERE "quizQuestionCount" IS NULL;

ALTER TABLE "LessonNode" ALTER COLUMN "quizQuestionCount" SET NOT NULL;