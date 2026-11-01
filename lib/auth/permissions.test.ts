/** @jest-environment node */
import { apiAccess } from './api';
import { contentScope, homeFor, type Principal } from './policy';
import { referencedContentAllowed } from './content';
const mockUser = jest.fn(),
  mockCount = jest.fn();
jest.mock('./identity', () => ({ getAppUser: () => mockUser() }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    lesson: { count: (...args: unknown[]) => mockCount(...args) },
    node: { count: (...args: unknown[]) => mockCount(...args) },
  },
}));
const member: Principal = {
  id: 'u1',
  clerkUserId: 'user_1',
  email: 'a@example.com',
  name: null,
  appRole: 'STUDENT',
  platformRole: 'MEMBER',
};
beforeEach(() => jest.resetAllMocks());
it.each([
  [null, 'instructor', 401],
  [member, 'instructor', 403],
  [member, 'admin', 403],
  [{ ...member, appRole: null }, 'student', 403],
  [{ ...member, appRole: 'INSTRUCTOR' }, 'admin', 403],
] as const)('rejects disallowed API access', async (user, kind, status) => {
  mockUser.mockResolvedValue(user);
  expect((await apiAccess(kind)).error?.status).toBe(status);
});
it('lets an admin manage content while retaining their student identity', async () => {
  const admin = { ...member, platformRole: 'ADMIN' } as Principal;
  mockUser.mockResolvedValue(admin);
  expect((await apiAccess('instructor')).user).toEqual(admin);
  expect((await apiAccess('admin')).user).toEqual(admin);
  expect((await apiAccess('student')).user?.id).toBe('u1');
  expect(homeFor(admin)).toBe('/admin');
  expect(contentScope(admin)).toEqual({});
});
it('does not implicitly allow admins to submit work without student mode', async () => {
  mockUser.mockResolvedValue({ ...member, appRole: null, platformRole: 'ADMIN' });
  expect((await apiAccess('student')).error?.status).toBe(403);
});
it('scopes an instructor to their own and shared content', () => {
  expect(contentScope(member)).toEqual({ OR: [{ createdByClerkId: 'user_1' }, { createdByClerkId: null }] });
  expect(contentScope(member, false)).toEqual({ createdByClerkId: 'user_1' });
});
it('rejects missing or inaccessible referenced nodes even with duplicate IDs', async () => {
  mockCount.mockResolvedValue(1);
  expect(await referencedContentAllowed('node', ['own', 'own', 'private'], member)).toBe(false);
  expect(mockCount).toHaveBeenCalledWith({ where: { id: { in: ['own', 'private'] }, ...contentScope(member) } });
});
it('allows admins to reference other owners but still checks existence', async () => {
  mockCount.mockResolvedValue(2);
  expect(await referencedContentAllowed('lesson', ['one', 'two'], { ...member, platformRole: 'ADMIN' })).toBe(true);
  expect(mockCount).toHaveBeenCalledWith({ where: { id: { in: ['one', 'two'] } } });
});
