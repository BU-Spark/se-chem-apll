import { auth, currentUser } from '@clerk/nextjs/server';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { AuthError, identitySelect, type Principal } from './policy';
export { identitySelect } from './policy';

// Only the verified Clerk session supplies the identity; never a caller-provided ID.
export async function resolveAppUser(): Promise<Principal | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const existing = await prisma.user.findUnique({ where: { clerkUserId: userId }, select: identitySelect });
  if (existing) return { ...existing, clerkUserId: userId };

  // The only routine Clerk profile fetch: first-time provisioning/linking.
  const profile = await currentUser();
  if (!profile || profile.id !== userId) throw new AuthError('Unable to verify your account. Sign in again.', 401);
  const primary = profile.emailAddresses.find((email) => email.id === profile.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== 'verified')
    throw new AuthError('Verify your primary email in your account settings, then try again.', 403);
  const email = primary.emailAddress.trim().toLowerCase();
  const name = profile.fullName ?? profile.firstName ?? null;

  // Conditional linking prevents claiming a record already attached to another identity.
  // Re-read on a unique conflict so simultaneous first requests converge on one user.
  for (let attempt = 0; attempt < 3; attempt++) {
    const linked = await prisma.user.findUnique({ where: { clerkUserId: userId }, select: identitySelect });
    if (linked) return { ...linked, clerkUserId: userId };
    const byEmail = await prisma.user.findUnique({ where: { email }, select: identitySelect });
    if (byEmail?.clerkUserId === userId) return { ...byEmail, clerkUserId: userId };
    if (byEmail?.clerkUserId) throw new AuthError('This email is already linked to a different account.', 409);
    try {
      if (byEmail) {
        await prisma.user.updateMany({
          where: { id: byEmail.id, clerkUserId: null },
          data: { clerkUserId: userId, ...(byEmail.name ? {} : { name }) },
        });
      } else {
        await prisma.user.create({ data: { clerkUserId: userId, email, name } });
      }
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')) throw error;
    }
  }
  const linked = await prisma.user.findUnique({ where: { clerkUserId: userId }, select: identitySelect });
  if (linked) return { ...linked, clerkUserId: userId };
  throw new AuthError('Account setup conflicted with another request. Please try again.', 409);
}

// React cache is scoped to a server render, never shared between users or requests.
export const getAppUser = cache(resolveAppUser);
