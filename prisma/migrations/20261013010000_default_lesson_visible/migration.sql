-- Change only the default for new assignments; retain every saved visibility choice.
ALTER TABLE "CourseLesson" ALTER COLUMN "hideAfterDue" SET DEFAULT false;
