import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

/**
 * Returns the signed-in student's User row, creating it on first visit and backfilling the
 * name from Clerk if missing. Returns null when nobody is signed in or there's no email.
 */
export async function getOrCreateStudent() {
  const { userId } = await auth();
  if (!userId) return null;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;
  const email =
    clerkUser.emailAddresses?.find((address) => address.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses?.[0]?.emailAddress;
  if (!email) return null;

  const normalizedEmail = email.trim().toLowerCase();
  const clerkName = clerkUser.fullName ?? clerkUser.firstName ?? undefined;

  const student = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!student) {
    return prisma.user.create({ data: { email: normalizedEmail, name: clerkName } });
  }
  if (!student.name && clerkName) {
    return prisma.user.update({ where: { id: student.id }, data: { name: clerkName } });
  }
  return student;
}
