/** @jest-environment node */
import { changeRoles } from './roles';
import { PATCH as debugPatch } from '@/app/api/me/role/route';
import { PATCH as adminPatch } from '@/app/api/admin/users/[userId]/roles/route';
const mockIdentity = jest.fn(),
  mockFind = jest.fn(),
  mockCount = jest.fn(),
  mockUpdate = jest.fn(),
  mockAudit = jest.fn();
const mockLock = jest.fn();
jest.mock('./identity', () => ({
  getAppUser: () => mockIdentity(),
  identitySelect: { id: true, appRole: true, platformRole: true },
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        $queryRaw: mockLock,
        user: { findUnique: mockFind, count: mockCount, update: mockUpdate },
        roleAudit: { create: mockAudit },
      }),
  },
}));
const member = { id: 'u1', clerkUserId: 'user_1', appRole: 'STUDENT', platformRole: 'MEMBER' };
const admin = { ...member, platformRole: 'ADMIN' };
const req = (body: unknown, origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/me/role', {
    method: 'PATCH',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  jest.resetAllMocks();
  delete process.env.APP_ORIGINS;
  mockIdentity.mockResolvedValue(member);
  mockFind.mockResolvedValue(member);
  mockCount.mockResolvedValue(1);
  mockUpdate.mockResolvedValue({ ...member, appRole: 'INSTRUCTOR' });
});
it('switches only the authenticated user and writes an audit entry', async () => {
  const response = await debugPatch(req({ appRole: 'INSTRUCTOR' }));
  expect(response.status).toBe(200);
  expect(mockUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 'u1' }, data: { appRole: 'INSTRUCTOR' } })
  );
  expect(mockAudit).toHaveBeenCalledWith({
    data: expect.objectContaining({
      actorId: 'u1',
      targetId: 'u1',
      source: 'DEBUG',
      previousAppRole: 'STUDENT',
      newAppRole: 'INSTRUCTOR',
    }),
  });
});
it.each([{ appRole: 'ADMIN' }, { platformRole: 'ADMIN' }, { appRole: 'STUDENT', userId: 'victim' }, {}])(
  'rejects debug escalation/spoofing: %j',
  async (body) => {
    expect((await debugPatch(req(body))).status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  }
);
it('requires an authenticated session and same-origin request', async () => {
  expect((await debugPatch(req({ appRole: 'INSTRUCTOR' }, 'https://evil.example'))).status).toBe(403);
  mockIdentity.mockResolvedValue(null);
  expect((await debugPatch(req({ appRole: 'INSTRUCTOR' }))).status).toBe(401);
  expect(mockUpdate).not.toHaveBeenCalled();
});
it('retains admin privilege on debug role reset', async () => {
  mockIdentity.mockResolvedValue(admin);
  mockFind.mockResolvedValue(admin);
  mockUpdate.mockResolvedValue({ ...admin, appRole: null });
  const response = await debugPatch(req({ appRole: null }));
  expect((await response.json()).platformRole).toBe('ADMIN');
  expect(mockUpdate.mock.calls[0][0].data).toEqual({ appRole: null });
});
it('rejects non-admin access to the admin endpoint', async () => {
  expect(
    (await adminPatch(req({ platformRole: 'ADMIN' }), { params: Promise.resolve({ userId: 'victim' }) })).status
  ).toBe(403);
  expect(mockFind).not.toHaveBeenCalled();
});
it('rechecks the actor inside the transaction after acquiring the global role lock', async () => {
  mockIdentity.mockResolvedValue(admin); // authority was revoked between the request and write
  expect((await adminPatch(req({ platformRole: 'ADMIN' }), { params: Promise.resolve({ userId: 'u2' }) })).status).toBe(
    403
  );
  expect(mockLock).toHaveBeenCalledTimes(1);
  expect(mockUpdate).not.toHaveBeenCalled();
});
it('rejects removing the last admin', async () => {
  mockFind.mockResolvedValue(admin);
  await expect(changeRoles('u1', 'u1', { platformRole: 'MEMBER' }, 'ADMIN')).rejects.toMatchObject({ status: 409 });
  expect(mockUpdate).not.toHaveBeenCalled();
});
it('does not grant admin to an unlinked seed/enrollment record', async () => {
  mockFind.mockResolvedValueOnce(admin).mockResolvedValueOnce({ ...member, clerkUserId: null });
  await expect(changeRoles('u1', 'u2', { platformRole: 'ADMIN' }, 'ADMIN')).rejects.toMatchObject({ status: 409 });
});
it('checks invariants even if the role service is called outside an endpoint', async () => {
  await expect(changeRoles('u1', 'victim', { appRole: 'INSTRUCTOR' }, 'DEBUG')).rejects.toMatchObject({ status: 403 });
  await expect(changeRoles('u1', 'u1', { platformRole: 'ADMIN' }, 'DEBUG')).rejects.toMatchObject({ status: 403 });
});
