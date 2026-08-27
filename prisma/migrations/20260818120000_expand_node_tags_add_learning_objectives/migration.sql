-- Expand the schema without changing the legacy column so old and new app
-- versions can run at the same time during a rolling deployment.
ALTER TABLE "Node"
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "learningObjectivesText" TEXT;

-- Preserve every existing tag value from the legacy array column.
UPDATE "Node"
SET "tags" = "learningObjectives";

-- Keep old clients (learningObjectives TEXT[]) and new clients (tags TEXT[])
-- synchronized until a later contract migration removes the legacy column.
CREATE FUNCTION "syncNodeTagsWithLegacyLearningObjectives"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF cardinality(NEW."tags") > 0 THEN
      NEW."learningObjectives" := NEW."tags";
    ELSE
      NEW."tags" := NEW."learningObjectives";
    END IF;
  ELSIF NEW."tags" IS DISTINCT FROM OLD."tags" THEN
    NEW."learningObjectives" := NEW."tags";
  ELSIF NEW."learningObjectives" IS DISTINCT FROM OLD."learningObjectives" THEN
    NEW."tags" := NEW."learningObjectives";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "syncNodeTagsWithLegacyLearningObjectives"
BEFORE INSERT OR UPDATE ON "Node"
FOR EACH ROW
EXECUTE FUNCTION "syncNodeTagsWithLegacyLearningObjectives"();
