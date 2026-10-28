-- psql -v ON_ERROR_STOP=1 -f prisma/tests/mcq-variant-choices.sql
CREATE SCHEMA mcq_choices_migration_test;
SET search_path TO mcq_choices_migration_test;
CREATE TABLE "QuizQuestion" (id TEXT PRIMARY KEY, options JSONB);
CREATE TABLE "QuizQuestionVariant" (id TEXT PRIMARY KEY, "quizQuestionId" TEXT, values JSONB, answer JSONB);
INSERT INTO "QuizQuestion" VALUES ('q','{"type":"variantMultipleChoice","version":1,"choices":[{"id":"a","content":"{{ x }} + {{x}}"},{"id":"b","content":"{{y}}"}]}'),('n','{"type":"variantShortAnswer","version":1}');
INSERT INTO "QuizQuestionVariant" VALUES
('v1','q','{"x":"Hydrogen","y":"Oxygen"}','{"type":"multipleChoice","correctChoiceIds":["a"]}'),
('v2','q','{"x":"$& {{y}}","y":"Nitrogen"}','{"type":"multipleChoice","correctChoiceIds":["a","b"]}'),
('v3','n','{"x":"1"}','{"type":"shortAnswer","answerMode":"exact","expectedAnswer":1}');
\ir ../migrations/20261016000000_mcq_variant_choices/migration.sql
DO $$ BEGIN
  IF (SELECT answer->'choices'->0->>'content' FROM "QuizQuestionVariant" WHERE id='v1') <> 'Hydrogen + Hydrogen' THEN RAISE EXCEPTION 'Substitution failed'; END IF;
  IF (SELECT answer->'choices'->0->>'content' FROM "QuizQuestionVariant" WHERE id='v2') <> '$& {{y}} + $& {{y}}' THEN RAISE EXCEPTION 'Literal substitution failed'; END IF;
  IF (SELECT answer->'correctChoiceIds' FROM "QuizQuestionVariant" WHERE id='v2') <> '["a","b"]'::jsonb THEN RAISE EXCEPTION 'Answer key changed'; END IF;
  IF (SELECT answer ? 'choices' FROM "QuizQuestionVariant" WHERE id='v3') THEN RAISE EXCEPTION 'Numeric variant changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "QuizQuestion" WHERE id='q' AND options->>'version'='2' AND options ? 'legacyChoices' AND NOT options ? 'choices') THEN RAISE EXCEPTION 'Parent migration failed'; END IF;
END $$;
DROP SCHEMA mcq_choices_migration_test CASCADE;
RESET search_path;
