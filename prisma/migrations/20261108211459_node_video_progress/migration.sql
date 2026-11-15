-- CreateTable
CREATE TABLE "NodeVideoProgress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseLessonId" TEXT NOT NULL,
    "lessonNodeId" TEXT NOT NULL,
    "positionSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "watchedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeVideoProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NodeVideoProgress_studentId_courseLessonId_lessonNodeId_key" ON "NodeVideoProgress"("studentId", "courseLessonId", "lessonNodeId");

-- AddForeignKey
ALTER TABLE "NodeVideoProgress" ADD CONSTRAINT "NodeVideoProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeVideoProgress" ADD CONSTRAINT "NodeVideoProgress_courseLessonId_fkey" FOREIGN KEY ("courseLessonId") REFERENCES "CourseLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeVideoProgress" ADD CONSTRAINT "NodeVideoProgress_lessonNodeId_fkey" FOREIGN KEY ("lessonNodeId") REFERENCES "LessonNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
