import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
export async function signedInStudent() {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  if (user?.unsafeMetadata?.role !== 'student') return null;
  const email =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    user.emailAddresses[0]?.emailAddress;
  if (!email) return null;
  return prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
}
