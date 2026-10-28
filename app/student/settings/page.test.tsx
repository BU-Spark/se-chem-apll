import { render, screen, within } from '@testing-library/react';
import StudentSettingsPage from './page';

const mockRequireStudent = jest.fn();

jest.mock('@/lib/auth/server', () => ({
  requireStudent: () => mockRequireStudent(),
  isAdmin: (user: { platformRole: string }) => user.platformRole === 'ADMIN',
}));

jest.mock('@/app/components/AccountActions/AccountActions', () => ({
  __esModule: true,
  default: () => <div data-testid="account-actions" />,
}));

describe('StudentSettingsPage', () => {
  it('shows the display name read-only, the account actions, and Switch role', async () => {
    mockRequireStudent.mockResolvedValue({ id: 'student-1', name: 'Hannah Yu', platformRole: 'USER' });
    render(await StudentSettingsPage());

    const account = screen.getByRole('region', { name: 'Account' });
    expect(within(account).getByText('Display name')).toBeInTheDocument();
    expect(within(account).getByText('Hannah Yu')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-actions')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Switch role' })).toHaveAttribute('href', '/select-role');
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
  });

  it('gives administrators a link to Administration', async () => {
    mockRequireStudent.mockResolvedValue({ id: 'student-1', name: 'Admin', platformRole: 'ADMIN' });
    render(await StudentSettingsPage());

    expect(screen.getByRole('link', { name: 'Administration' })).toHaveAttribute('href', '/admin');
  });
});
