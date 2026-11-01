-- Preserve explicit overrides and backfill inherited values before removing
-- the reusable Node-level default.
ALTER TABLE "LessonNode" RENAME COLUMN "passingPercentOverride" TO "passingPercent";

UPDATE "LessonNode" AS lesson_node
SET "passingPercent" = node."defaultPassingPercent"
FROM "Node" AS node
WHERE lesson_node."nodeId" = node."id"
  AND lesson_node."passingPercent" IS NULL;

ALTER TABLE "LessonNode" ALTER COLUMN "passingPercent" SET NOT NULL;
ALTER TABLE "Node" DROP COLUMN "defaultPassingPercent";
