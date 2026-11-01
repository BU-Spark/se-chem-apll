-- Add an explicit discriminator so timestamped checkpoint content can be a
-- graded question or an informational note. Existing rows remain questions.
CREATE TYPE "CheckpointQuestionKind" AS ENUM ('QUESTION', 'NOTE');

ALTER TABLE "CheckpointQuestion"
ADD COLUMN "kind" "CheckpointQuestionKind" NOT NULL DEFAULT 'QUESTION';
