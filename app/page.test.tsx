import HomePage from './page';
const mockUser = jest.fn();
jest.mock('@/lib/auth/identity', () => ({ getAppUser: () => mockUser() }));
jest.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(url);
  },
}));
it.each([
  [null, '/sign-in'],
  [{ appRole: null, platformRole: 'MEMBER' }, '/select-role'],
  [{ appRole: 'STUDENT', platformRole: 'MEMBER' }, '/student'],
  [{ appRole: 'INSTRUCTOR', platformRole: 'MEMBER' }, '/instructor'],
  [{ appRole: 'STUDENT', platformRole: 'ADMIN' }, '/admin'],
])('routes database identity %j to %s', async (user, destination) => {
  mockUser.mockResolvedValue(user);
  await expect(HomePage()).rejects.toThrow(destination);
});
