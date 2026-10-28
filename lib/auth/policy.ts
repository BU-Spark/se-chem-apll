import type { AppRole, PlatformRole } from '@prisma/client';

export type Principal = {
  id: string;
  clerkUserId: string;
  email: string;
  name: string | null;
  appRole: AppRole | null;
  platformRole: PlatformRole;
};
export const isAdmin = (user: Pick<Principal, 'platformRole'>) => user.platformRole === 'ADMIN';
export const canTeach = (user: Pick<Principal, 'platformRole' | 'appRole'>) =>
  isAdmin(user) || user.appRole === 'INSTRUCTOR';
export function contentScope(user: Principal, shared = true) {
  if (isAdmin(user)) return {};
  return shared
    ? { OR: [{ createdByClerkId: user.clerkUserId }, { createdByClerkId: null }] }
    : { createdByClerkId: user.clerkUserId };
}
export function homeFor(user: Pick<Principal, 'platformRole' | 'appRole'>) {
  if (isAdmin(user)) return '/admin';
  if (user.appRole === 'INSTRUCTOR') return '/instructor';
  if (user.appRole === 'STUDENT') return '/student';
  return '/select-role';
}
export class AuthError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export const identitySelect = {
  id: true,
  clerkUserId: true,
  email: true,
  name: true,
  appRole: true,
  platformRole: true,
} as const;
