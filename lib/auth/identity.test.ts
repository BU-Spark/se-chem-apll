/** @jest-environment node */
import { resolveAppUser } from './identity';
const mockAuth = jest.fn(),
  mockProfile = jest.fn(),
  mockFind = jest.fn(),
  mockCreate = jest.fn(),
  mockLink = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({ auth: () => mockAuth(), currentUser: () => mockProfile() }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFind(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      updateMany: (...args: unknown[]) => mockLink(...args),
    },
  },
}));
const linked = {
  id: 'local-1',
  clerkUserId: 'user_verified',
  email: 'student@example.com',
  name: 'Student',
  appRole: 'STUDENT',
  platformRole: 'MEMBER',
};
beforeEach(() => {
  jest.resetAllMocks();
  mockAuth.mockResolvedValue({ userId: 'user_verified' });
  mockFind.mockResolvedValue(null);
  mockProfile.mockResolvedValue({
    id: 'user_verified',
    primaryEmailAddressId: 'primary',
    emailAddresses: [{ id: 'primary', emailAddress: ' STUDENT@EXAMPLE.COM ', verification: { status: 'verified' } }],
    fullName: 'Student',
    unsafeMetadata: { role: 'admin' },
  });
});
it('uses the verified session ID and never fetches a profile for linked users', async () => {
  mockFind.mockResolvedValue(linked);
  expect(await resolveAppUser()).toEqual(linked);
  expect(mockFind.mock.calls[0][0].where).toEqual({ clerkUserId: 'user_verified' });
  expect(mockProfile).not.toHaveBeenCalled();
});
it('does not query the database or Clerk profile when signed out', async () => {
  mockAuth.mockResolvedValue({ userId: null });
  expect(await resolveAppUser()).toBeNull();
  expect(mockFind).not.toHaveBeenCalled();
  expect(mockProfile).not.toHaveBeenCalled();
});
it('provisions once using verified normalized email and never copies metadata privileges', async () => {
  mockCreate.mockImplementation(async () => {
    mockFind.mockResolvedValue(linked);
  });
  expect(await resolveAppUser()).toEqual(linked);
  expect(mockCreate).toHaveBeenCalledWith({
    data: { clerkUserId: 'user_verified', email: 'student@example.com', name: 'Student' },
  });
  await resolveAppUser();
  expect(mockProfile).toHaveBeenCalledTimes(1);
});
it('links an unclaimed enrollment record with a conditional update', async () => {
  mockFind.mockImplementation(async ({ where }) => (where.email ? { ...linked, clerkUserId: null } : null));
  mockLink.mockImplementation(async () => {
    mockFind.mockResolvedValue(linked);
    return { count: 1 };
  });
  expect(await resolveAppUser()).toEqual(linked);
  expect(mockLink).toHaveBeenCalledWith({
    where: { id: 'local-1', clerkUserId: null },
    data: { clerkUserId: 'user_verified' },
  });
});
it('does not steal a record linked to another Clerk account', async () => {
  mockFind.mockImplementation(async ({ where }) => (where.email ? { ...linked, clerkUserId: 'user_other' } : null));
  await expect(resolveAppUser()).rejects.toMatchObject({ status: 409 });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockLink).not.toHaveBeenCalled();
});
it('converges on the winner of a concurrent provisioning request', async () => {
  mockCreate.mockImplementation(async () => {
    mockFind.mockResolvedValue(linked);
    throw { code: 'P2002' };
  });
  expect(await resolveAppUser()).toEqual(linked);
  expect(mockCreate).toHaveBeenCalledTimes(1);
});
it.each(['unverified', 'missing', 'wrong-user'])('rejects an untrusted profile: %s', async (mode) => {
  const profile = await mockProfile();
  mockProfile.mockClear();
  if (mode === 'wrong-user') profile.id = 'user_other';
  else if (mode === 'missing') profile.primaryEmailAddressId = null;
  else profile.emailAddresses[0].verification.status = 'unverified';
  mockProfile.mockResolvedValue(profile);
  await expect(resolveAppUser()).rejects.toMatchObject({ status: mode === 'wrong-user' ? 401 : 403 });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockLink).not.toHaveBeenCalled();
});

it('accepts a same-user link completed between the ID lookup and email lookup', async () => {
  mockFind.mockImplementation(async ({ where }) => (where.email ? linked : null));
  expect(await resolveAppUser()).toEqual(linked);
  expect(mockLink).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});
