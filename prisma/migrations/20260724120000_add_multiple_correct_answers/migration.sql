ALTER TABLE "NodeQuestion"
ADD COLUMN "correctIndices" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

UPDATE "NodeQuestion"
SET "correctIndices" = ARRAY["correctIndex"]
WHERE "correctIndex" IS NOT NULL;

ALTER TABLE "NodeQuestion"
DROP COLUMN "correctIndex";

ALTER TABLE "NodeResponse"
ADD COLUMN "selectedIndices" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

UPDATE "NodeResponse"
SET "selectedIndices" = ARRAY["selectedIndex"]
WHERE "selectedIndex" IS NOT NULL;

ALTER TABLE "NodeResponse"
DROP COLUMN "selectedIndex";
