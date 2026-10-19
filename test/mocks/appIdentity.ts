import type { Principal } from '@/lib/auth/policy';

// Content tests supply resolved database identities; provisioning is tested separately.
export const mockGetAppUser = jest.fn<Promise<Principal | null>, []>();

export function appUser(overrides: Partial<Principal> = {}): Principal {
  return {
    id: 'local-user',
    clerkUserId: 'instructor-1',
    email: 'instructor@example.com',
    name: null,
    appRole: 'INSTRUCTOR',
    platformRole: 'MEMBER',
    ...overrides,
  };
}
