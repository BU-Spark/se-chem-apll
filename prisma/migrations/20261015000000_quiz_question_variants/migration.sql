BEGIN;

-- Checkpoint variants were never supported by the checkpoint authoring UI.
-- Abort rather than silently dropping any data introduced outside it.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "CheckpointQuestion" WHERE options->>'type' IN ('variantShortAnswer', 'variantMultipleChoice')) THEN
    RAISE EXCEPTION 'Checkpoint variants exist. Convert them to ordinary checkpoint questions before migrating.';
  END IF;
END $$;

CREATE TABLE "QuizQuestionVariant" (
  "id" TEXT NOT NULL,
  "quizQuestionId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "values" JSONB NOT NULL,
  "answer" JSONB NOT NULL,
  CONSTRAINT "QuizQuestionVariant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuizQuestionVariant_quizQuestionId_fkey" FOREIGN KEY ("quizQuestionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "QuizQuestionVariant_quizQuestionId_sortOrder_idx" ON "QuizQuestionVariant"("quizQuestionId", "sortOrder");

-- Namespace legacy row IDs by question because old JSON IDs were only locally unique.
INSERT INTO "QuizQuestionVariant" ("id", "quizQuestionId", "sortOrder", "values", "answer")
SELECT q.id || ':' || (v.row->>'id'), q.id, (v.ordinality - 1)::INTEGER, v.row->'values', v.row->'answer'
FROM "QuizQuestion" q,
LATERAL jsonb_array_elements(q.options->'variants') WITH ORDINALITY AS v(row, ordinality)
WHERE q.options->>'type' = 'variantShortAnswer';

UPDATE "QuizQuestion" SET options = options - 'variants'
WHERE options->>'type' = 'variantShortAnswer';
-- Existing attempt/response snapshots remain immutable and self-contained.

COMMIT;
