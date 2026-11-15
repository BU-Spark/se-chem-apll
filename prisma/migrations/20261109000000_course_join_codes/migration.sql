CREATE TABLE "CourseJoinCode" (
    "courseId" TEXT NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    CONSTRAINT "CourseJoinCode_pkey" PRIMARY KEY ("courseId")
);

CREATE UNIQUE INDEX "CourseJoinCode_code_key" ON "CourseJoinCode"("code");

CREATE TABLE "CourseJoinRateLimit" (
    "studentId" TEXT NOT NULL,
    "windowExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL,
    CONSTRAINT "CourseJoinRateLimit_pkey" PRIMARY KEY ("studentId")
);

ALTER TABLE "CourseJoinCode" ADD CONSTRAINT "CourseJoinCode_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseJoinRateLimit" ADD CONSTRAINT "CourseJoinRateLimit_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
