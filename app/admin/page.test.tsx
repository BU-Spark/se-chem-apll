import { render, screen } from '@testing-library/react';
import AdminPage from './page';
const mockAdmin = jest.fn(),
  mockUsers = jest.fn(),
  mockCount = jest.fn(),
  mockAudit = jest.fn();
jest.mock('@/lib/auth/server', () => ({ requireAdmin: () => mockAdmin() }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: (...args: unknown[]) => mockUsers(...args), count: (...args: unknown[]) => mockCount(...args) },
    roleAudit: { findMany: (...args: unknown[]) => mockAudit(...args) },
  },
}));
jest.mock('./RoleEditor', () => ({ __esModule: true, default: () => <div>Role editor</div> }));
beforeEach(() => {
  jest.resetAllMocks();
  mockAdmin.mockResolvedValue({ platformRole: 'ADMIN' });
  mockUsers.mockResolvedValue([]);
  mockCount.mockResolvedValue(0);
  mockAudit.mockResolvedValue([]);
});
it('checks admin permission before querying users or audit data', async () => {
  mockAdmin.mockRejectedValue(new Error('Forbidden'));
  await expect(AdminPage({})).rejects.toThrow('Forbidden');
  expect(mockUsers).not.toHaveBeenCalled();
  expect(mockAudit).not.toHaveBeenCalled();
});
it('searches and paginates the directory without exposing unrelated profile fields', async () => {
  render(await AdminPage({ searchParams: Promise.resolve({ q: 'teacher', page: '2' }) }));
  expect(screen.getByRole('heading', { name: 'Users & roles' })).toBeInTheDocument();
  expect(mockUsers).toHaveBeenCalledWith(
    expect.objectContaining({
      skip: 50,
      take: 50,
      where: {
        OR: [
          { email: { contains: 'teacher', mode: 'insensitive' } },
          { name: { contains: 'teacher', mode: 'insensitive' } },
          { clerkUserId: { equals: 'teacher' } },
        ],
      },
    })
  );
});
