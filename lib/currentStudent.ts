import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

// Professors enroll students by email, so the Clerk email links a login to our User row.
export async function getCurrentStudent() {
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress;
  if (!email) return null;
  return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
}
