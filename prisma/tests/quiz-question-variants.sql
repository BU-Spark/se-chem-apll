-- Run with psql -v ON_ERROR_STOP=1 -f prisma/tests/quiz-question-variants.sql
-- Uses a disposable schema; never changes application tables.
CREATE SCHEMA quiz_variant_migration_test;
SET search_path TO quiz_variant_migration_test;
CREATE TABLE "QuizQuestion" (id TEXT PRIMARY KEY, options JSONB NOT NULL);
CREATE TABLE "CheckpointQuestion" (id TEXT PRIMARY KEY, options JSONB NOT NULL);
INSERT INTO "QuizQuestion" VALUES
('q1', '{"type":"variantShortAnswer","version":1,"variants":[{"id":"shared","values":{"mass":"90"},"answer":{"type":"shortAnswer","answerMode":"exact","expectedAnswer":5}},{"id":"range","values":{"mass":"36"},"answer":{"type":"shortAnswer","answerMode":"range","minimumAnswer":1.9,"maximumAnswer":2.1}}]}'),
('q2', '{"type":"variantShortAnswer","version":1,"variants":[{"id":"shared","values":{},"answer":{"type":"shortAnswer","answerMode":"exact","expectedAnswer":null}}]}'),
('q3', '{"type":"multipleChoice","choices":["A","B"]}');
\ir ../migrations/20261015000000_quiz_question_variants/migration.sql
DO $$ BEGIN
  IF (SELECT count(*) FROM "QuizQuestionVariant") <> 3 THEN RAISE EXCEPTION 'Rows lost'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "QuizQuestionVariant" WHERE id='q1:range' AND "sortOrder"=1 AND answer->>'minimumAnswer'='1.9') THEN RAISE EXCEPTION 'Range/order changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "QuizQuestionVariant" WHERE id='q2:shared' AND answer->'expectedAnswer'='null'::jsonb) THEN RAISE EXCEPTION 'Draft changed'; END IF;
  IF EXISTS (SELECT 1 FROM "QuizQuestion" WHERE options ? 'variants') THEN RAISE EXCEPTION 'Legacy rows retained'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='quiz_variant_migration_test' AND indexdef LIKE '%("quizQuestionId", "sortOrder")') THEN RAISE EXCEPTION 'Index missing'; END IF;
  DELETE FROM "QuizQuestion" WHERE id='q1';
  IF EXISTS (SELECT 1 FROM "QuizQuestionVariant" WHERE "quizQuestionId"='q1') THEN RAISE EXCEPTION 'Cascade failed'; END IF;
END $$;
DROP SCHEMA quiz_variant_migration_test CASCADE;
RESET search_path;
