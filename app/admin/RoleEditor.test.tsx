import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoleEditor from './RoleEditor';
const mockRefresh = jest.fn(),
  mockFetch = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
const user = {
  id: 'local-1',
  email: 'a@example.com',
  appRole: 'STUDENT' as const,
  platformRole: 'MEMBER' as const,
  clerkUserId: 'user_1',
};
beforeEach(() => {
  jest.resetAllMocks();
  global.fetch = mockFetch;
});
it('saves the selected user roles and refreshes the directory', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  render(<RoleEditor user={user} />);
  await userEvent.selectOptions(screen.getByLabelText('Platform access for a@example.com'), 'ADMIN');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(mockFetch).toHaveBeenCalledWith(
    '/api/admin/users/local-1/roles',
    expect.objectContaining({ body: JSON.stringify({ appRole: 'STUDENT', platformRole: 'ADMIN' }) })
  );
  expect(mockRefresh).toHaveBeenCalled();
});
it('disables admin promotion for an unlinked account', () => {
  render(<RoleEditor user={{ ...user, clerkUserId: null }} />);
  expect(screen.getByRole('option', { name: 'Admin' })).toBeDisabled();
});
it('shows the fallback error for a non-JSON failure and allows retrying', async () => {
  mockFetch.mockResolvedValue({
    ok: false,
    json: async () => {
      throw new SyntaxError('Unexpected token <');
    },
  });
  render(<RoleEditor user={user} />);
  await userEvent.selectOptions(screen.getByLabelText('Platform access for a@example.com'), 'ADMIN');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('status')).toHaveTextContent('Unable to update roles.');
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  expect(mockRefresh).not.toHaveBeenCalled();
});
it('shows the last-admin error without refreshing away the feedback', async () => {
  mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'The last admin cannot be removed.' }) });
  render(<RoleEditor user={{ ...user, platformRole: 'ADMIN' }} />);
  await userEvent.selectOptions(screen.getByLabelText('Platform access for a@example.com'), 'MEMBER');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('status')).toHaveTextContent('The last admin cannot be removed.');
  expect(mockRefresh).not.toHaveBeenCalled();
});

it('enables saving only while a row has unsaved changes', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  render(<RoleEditor user={user} />);
  const save = screen.getByRole('button', { name: 'Save' });
  expect(save).toBeDisabled();
  await userEvent.selectOptions(screen.getByLabelText('Application role for a@example.com'), 'INSTRUCTOR');
  expect(save).toBeEnabled();
  await userEvent.selectOptions(screen.getByLabelText('Application role for a@example.com'), 'STUDENT');
  expect(save).toBeDisabled();
  await userEvent.selectOptions(screen.getByLabelText('Application role for a@example.com'), 'INSTRUCTOR');
  await userEvent.click(save);
  expect(save).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Saved');
});
