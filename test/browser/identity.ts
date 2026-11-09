// Only the isolated browser fixture aliases authentication; production imports are unchanged.
import { prisma } from '@/lib/prisma';
import { contentScope } from '@/lib/auth/policy';
export { contentScope };
export async function requireStudent() {
  const url = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/spark_submission_test')
    throw new Error('Unsafe test database');
  return prisma.user.findUniqueOrThrow({ where: { id: 'spark-browser-student' } });
}
export async function requireInstructor() {
  return { ...(await requireStudent()), platformRole: 'ADMIN' as const, clerkUserId: 'browser-instructor' };
}
export async function apiAccess(kind: string) {
  return { user: kind === 'instructor' ? await requireInstructor() : await requireStudent(), error: null };
}
