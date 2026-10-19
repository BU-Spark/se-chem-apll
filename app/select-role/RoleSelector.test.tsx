import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoleSelector from './RoleSelector';
const mockPush = jest.fn(),
  mockRefresh = jest.fn(),
  mockFetch = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }));
beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = mockFetch;
});
it('preserves the debug switch and refreshes server-rendered permissions after success', async () => {
  mockFetch.mockResolvedValue({ ok: true });
  render(<RoleSelector currentRole="STUDENT" admin debug />);
  expect(screen.getByRole('link', { name: 'Administration' })).toHaveAttribute('href', '/admin');
  await userEvent.click(screen.getByRole('button', { name: /Instructor/ }));
  expect(mockFetch).toHaveBeenCalledWith(
    '/api/me/role',
    expect.objectContaining({ body: JSON.stringify({ appRole: 'INSTRUCTOR' }) })
  );
  expect(mockPush).toHaveBeenCalledWith('/instructor');
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});
it('clears only the application role', async () => {
  mockFetch.mockResolvedValue({ ok: true });
  render(<RoleSelector currentRole="STUDENT" admin debug />);
  await userEvent.click(screen.getByRole('button', { name: /Clear role/ }));
  expect(mockFetch.mock.calls[0][1].body).toBe(JSON.stringify({ appRole: null }));
  expect(mockPush).toHaveBeenCalledWith('/select-role');
});
it('shows a failed save without navigating', async () => {
  mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Sign in again.' }) });
  render(<RoleSelector currentRole={null} admin={false} />);
  await userEvent.click(screen.getByRole('button', { name: /Student/ }));
  expect(screen.getByRole('alert')).toHaveTextContent('Sign in again.');
  expect(mockPush).not.toHaveBeenCalled();
});
it('shows the fallback error for a non-JSON failure and allows retrying', async () => {
  mockFetch.mockResolvedValue({
    ok: false,
    json: async () => {
      throw new SyntaxError('Unexpected token <');
    },
  });
  render(<RoleSelector currentRole={null} admin={false} />);
  await userEvent.click(screen.getByRole('button', { name: /Student/ }));
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to change role.');
  expect(screen.getByRole('button', { name: /Student/ })).toBeEnabled();
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockRefresh).not.toHaveBeenCalled();
});
