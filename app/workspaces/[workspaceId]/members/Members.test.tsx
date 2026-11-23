import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Members from './Members';
const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: jest.fn() }) }));
const props = {
  workspaceId: 'chem',
  name: 'Chemistry',
  platformAdmin: false,
  members: [
    { userId: 'owner', email: 'owner@example.com', name: null, role: 'OWNER' as const },
    { userId: 'admin', email: 'admin@example.com', name: null, role: 'ADMIN' as const },
    { userId: 'editor', email: 'editor@example.com', name: null, role: 'EDITOR' as const },
  ],
  invitations: [],
};
afterEach(() => jest.restoreAllMocks());
it('shows viewers the member list without membership or settings controls', () => {
  render(<Members {...props} role="VIEWER" />);
  expect(screen.getByText('owner@example.com')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create invitation' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save name' })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});
it('lets admins manage editors but hides admin and ownership controls', () => {
  render(<Members {...props} role="ADMIN" />);
  expect(screen.getByRole('combobox', { name: 'Role for editor@example.com' })).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Role for admin@example.com' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Admin' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Transfer ownership' })).not.toBeInTheDocument();
});
it('creates an email-bound invitation and presents its shareable link', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'secret', id: 'invite' }) });
  const user = userEvent.setup();
  render(<Members {...props} role="OWNER" />);
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new@example.com');
  await user.selectOptions(screen.getByRole('combobox', { name: /^Role$/ }), 'VIEWER');
  await user.click(screen.getByRole('button', { name: 'Create invitation' }));
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/workspaces/chem/invitations',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'new@example.com', role: 'VIEWER' }) })
  );
  expect(await screen.findByRole('link', { name: /workspaces\/accept\?token=secret/ })).toBeInTheDocument();
});
