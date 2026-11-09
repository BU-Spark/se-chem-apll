import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthError, contentScope, type Principal } from '@/lib/auth/policy';
import { prisma } from '@/lib/prisma';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const maxAttempts = 10;
const windowSeconds = 10 * 60;

export async function setCourseJoinCode(user: Principal, courseId: string, enabled: boolean) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const course = await tx.course.findFirst({
          where: { id: courseId, ...contentScope(user, false) },
          select: { id: true },
        });
        if (!course) throw new AuthError('Course not found.', 404);

        // Take the parent lock first, in the same order as redemption and course deletion.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Course" WHERE id = ${courseId} FOR UPDATE
        `;
        if (!locked.length) throw new AuthError('Course not found.', 404);

        if (!enabled) {
          await tx.courseJoinCode.deleteMany({ where: { courseId } });
          return { code: null };
        }

        const current = await tx.courseJoinCode.findUnique({ where: { courseId } });
        let code: string;
        do {
          code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
        } while (code === current?.code);

        return tx.courseJoinCode.upsert({
          where: { courseId },
          create: { courseId, code },
          update: { code },
          select: { code: true },
        });
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }
  throw new AuthError('Could not generate a code. Please try again.', 503);
}

export async function joinCourse(studentId: string, input: unknown) {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!/^[a-zA-Z]{8}$/.test(trimmed)) throw new AuthError('Enter the eight-letter course code.', 400);
  const code = trimmed.toUpperCase();

  // Count guesses independently of redemption so invalid codes also consume the shared limit.
  const allowed = await prisma.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "CourseJoinRateLimit" ("studentId", "windowExpiresAt", "attempts")
    VALUES (${studentId}, CURRENT_TIMESTAMP + make_interval(secs => ${windowSeconds}), 1)
    ON CONFLICT ("studentId") DO UPDATE
      SET "attempts" = CASE WHEN "CourseJoinRateLimit"."windowExpiresAt" <= CURRENT_TIMESTAMP
                            THEN 1 ELSE "CourseJoinRateLimit"."attempts" + 1 END,
          "windowExpiresAt" = CASE WHEN "CourseJoinRateLimit"."windowExpiresAt" <= CURRENT_TIMESTAMP
                                   THEN EXCLUDED."windowExpiresAt" ELSE "CourseJoinRateLimit"."windowExpiresAt" END
      WHERE "CourseJoinRateLimit"."windowExpiresAt" <= CURRENT_TIMESTAMP
         OR "CourseJoinRateLimit"."attempts" < ${maxAttempts}
    RETURNING "attempts"
  `;
  if (!allowed.length) throw new AuthError('Too many attempts. Wait a few minutes and try again.', 429);

  return prisma.$transaction(
    async (tx) => {
      const invalidCode = () => new AuthError('Check the code or ask your instructor for the current one.', 404);
      const invite = await tx.courseJoinCode.findUnique({ where: { code }, select: { courseId: true } });
      if (!invite) throw invalidCode();
      const { courseId } = invite;

      // Concurrent joins can share this lock. Rotation, disabling, and deletion must wait.
      const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Course" WHERE id = ${courseId} FOR KEY SHARE
    `;
      if (!locked.length) throw invalidCode();
      const active = await tx.courseJoinCode.findUnique({ where: { courseId }, select: { code: true } });
      if (active?.code !== code) throw invalidCode();

      const { count } = await tx.enrollment.createMany({
        data: { studentId, courseId, role: 'STUDENT' },
        skipDuplicates: true,
      });
      if (!count) {
        const enrollment = await tx.enrollment.findUnique({
          where: { studentId_courseId: { studentId, courseId } },
          select: { role: true },
        });
        if (enrollment?.role !== 'STUDENT') {
          throw new AuthError('You could not join this course. Contact your instructor.', 409);
        }
      }
      return { courseId };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );
}
