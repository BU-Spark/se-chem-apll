/** @jest-environment node */
import { AsyncLocalStorage } from 'node:async_hooks';
import { prisma } from '@/lib/prisma';
import { resolveAppUser } from './identity';
import { changeRoles } from './roles';
import { referencedContentAllowed } from './content';
import type { Principal } from './policy';
const mockSession = new AsyncLocalStorage<{ id: string; email: string }>();
const mockProfile = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: mockSession.getStore()?.id }),
  currentUser: async () => {
    mockProfile();
    const session = mockSession.getStore()!;
    return {
      id: session.id,
      primaryEmailAddressId: 'primary',
      fullName: 'Test',
      emailAddresses: [{ id: 'primary', emailAddress: session.email, verification: { status: 'verified' } }],
    };
  },
}));
const enabled = process.env.AUTH_TEST_DATABASE_URL;
if (
  enabled &&
  (!['localhost', '127.0.0.1'].includes(new URL(enabled).hostname) ||
    new URL(enabled).pathname !== '/spark_auth_test' ||
    process.env.DATABASE_URL !== enabled)
)
  throw new Error('Dedicated local spark_auth_test database required.');
const suite = enabled ? describe : describe.skip;
suite('database-backed auth concurrency', () => {
  jest.setTimeout(30000);
  beforeEach(async () => {
    // This suite is guarded to an explicit disposable database. Clear dependent
    // demo/submission rows too, so it can run after the seed verification.
    await prisma.$executeRaw`TRUNCATE TABLE "RoleAudit", "Student", "Lesson" CASCADE`;
    mockProfile.mockClear();
  });
  afterAll(() => prisma.$disconnect());
  const signIn = (id: string, email = 'student@example.com') => mockSession.run({ id, email }, resolveAppUser);
  it('converges concurrent first logins and performs no later profile lookups', async () => {
    const users = await Promise.all(Array.from({ length: 8 }, () => signIn('user_race')));
    expect(new Set(users.map((user) => user!.id)).size).toBe(1);
    expect(await prisma.user.count()).toBe(1);
    mockProfile.mockClear();
    await Promise.all(Array.from({ length: 4 }, () => signIn('user_race')));
    expect(mockProfile).not.toHaveBeenCalled();
  });
  it('links a seeded placeholder without changing its identity or role', async () => {
    const placeholder = await prisma.user.create({ data: { email: 'student@example.com', appRole: 'STUDENT' } });
    const result = await signIn('user_link');
    expect(result).toMatchObject({
      id: placeholder.id,
      appRole: 'STUDENT',
      platformRole: 'MEMBER',
      clerkUserId: 'user_link',
    });
  });
  it('does not let two Clerk accounts claim the same placeholder', async () => {
    await prisma.user.create({ data: { email: 'student@example.com' } });
    const results = await Promise.allSettled([signIn('user_one'), signIn('user_two')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.user.count()).toBe(1);
  });
  it('serializes concurrent admin demotions and preserves the final admin', async () => {
    const a = await prisma.user.create({
      data: { email: 'a@example.com', clerkUserId: 'user_a', platformRole: 'ADMIN' },
    });
    const b = await prisma.user.create({
      data: { email: 'b@example.com', clerkUserId: 'user_b', platformRole: 'ADMIN' },
    });
    const results = await Promise.allSettled([
      changeRoles(a.id, a.id, { platformRole: 'MEMBER' }, 'ADMIN'),
      changeRoles(b.id, b.id, { platformRole: 'MEMBER' }, 'ADMIN'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.user.count({ where: { platformRole: 'ADMIN' } })).toBe(1);
    expect(await prisma.roleAudit.count()).toBe(1);
  });
  it('retains platform access when an admin switches and resets app role', async () => {
    const admin = await prisma.user.create({
      data: { email: 'admin@example.com', clerkUserId: 'user_admin', platformRole: 'ADMIN' },
    });
    await changeRoles(admin.id, admin.id, { appRole: 'STUDENT' }, 'DEBUG');
    await changeRoles(admin.id, admin.id, { appRole: null }, 'DEBUG');
    expect(await prisma.user.findUnique({ where: { id: admin.id } })).toMatchObject({
      platformRole: 'ADMIN',
      appRole: null,
    });
    expect(await prisma.roleAudit.count()).toBe(2);
  });
  it('enforces referenced resource ownership against real database queries', async () => {
    const user = (await signIn('user_teacher'))!;
    const lesson = await prisma.lesson.create({
      data: { title: 'Private', summary: '', createdByClerkId: 'user_other' },
    });
    expect(await referencedContentAllowed('lesson', [lesson.id], user)).toBe(false);
    expect(await referencedContentAllowed('lesson', [lesson.id], { ...user, platformRole: 'ADMIN' } as Principal)).toBe(
      true
    );
    expect(await referencedContentAllowed('lesson', ['missing'], { ...user, platformRole: 'ADMIN' } as Principal)).toBe(
      false
    );
  });
});
