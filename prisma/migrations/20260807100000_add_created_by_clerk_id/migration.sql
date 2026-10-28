ALTER TABLE "Course" ADD COLUMN "createdByClerkId" TEXT;
ALTER TABLE "Lesson" ADD COLUMN "createdByClerkId" TEXT;
ALTER TABLE "Node" ADD COLUMN "createdByClerkId" TEXT;

CREATE INDEX "Course_createdByClerkId_idx" ON "Course"("createdByClerkId");
CREATE INDEX "Lesson_createdByClerkId_idx" ON "Lesson"("createdByClerkId");
CREATE INDEX "Node_createdByClerkId_idx" ON "Node"("createdByClerkId");