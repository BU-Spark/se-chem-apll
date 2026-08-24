-- Draft lessons may not have a user-facing slug yet. PostgreSQL permits
-- multiple NULL values in a unique column, so unfinished drafts do not
-- conflict with one another.
ALTER TABLE "Lesson" ALTER COLUMN "slug" DROP NOT NULL;

ALTER TABLE "Lesson" ADD COLUMN "isDraft" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Node" ADD COLUMN "isDraft" BOOLEAN NOT NULL DEFAULT false;
