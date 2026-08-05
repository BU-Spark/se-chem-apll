-- CreateTable
CREATE TABLE "CourseLesson" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "openDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseLesson_pkey" PRIMARY KEY ("id")
);

-- Backfill from existing Lesson ownership + schedule
INSERT INTO "CourseLesson" ("id", "courseId", "lessonId", "openDate", "dueDate", "sortOrder", "createdAt", "updatedAt")
SELECT
    md5(random()::text || clock_timestamp()::text),
    "courseId",
    "id",
    "openDate",
    "dueDate",
    "sortOrder",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Lesson";

-- CreateIndex
CREATE INDEX "CourseLesson_lessonId_idx" ON "CourseLesson"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseLesson_courseId_lessonId_key" ON "CourseLesson"("courseId", "lessonId");

-- AddForeignKey
ALTER TABLE "CourseLesson" ADD CONSTRAINT "CourseLesson_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLesson" ADD CONSTRAINT "CourseLesson_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey (old Lesson → Course)
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_courseId_fkey";

-- AlterTable: remove ownership + schedule from Lesson
ALTER TABLE "Lesson" DROP COLUMN "courseId",
DROP COLUMN "openDate",
DROP COLUMN "dueDate",
DROP COLUMN "sortOrder";