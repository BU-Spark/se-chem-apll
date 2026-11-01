-- Tags and learning objectives were temporarily kept compatible with an
-- earlier client by mirroring tags into the legacy learningObjectives array.
-- They are now independent concepts: tags stay in tags, and the array is
-- repurposed for the ordered learning-objective list.
DROP TRIGGER IF EXISTS "syncNodeTagsWithLegacyLearningObjectives" ON "Node";
DROP FUNCTION IF EXISTS "syncNodeTagsWithLegacyLearningObjectives"();

UPDATE "Node"
SET "learningObjectives" = CASE
  WHEN "learningObjectivesText" IS NULL OR btrim("learningObjectivesText") = ''
    THEN ARRAY[]::TEXT[]
  ELSE ARRAY[btrim("learningObjectivesText")]
END;

ALTER TABLE "Node" DROP COLUMN "learningObjectivesText";
