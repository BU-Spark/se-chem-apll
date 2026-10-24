import { render, screen, within } from '@testing-library/react';
import StudentSettingsPage from './page';

const mockRequireStudent = jest.fn();

jest.mock('@/lib/auth/server', () => ({
  requireStudent: () => mockRequireStudent(),
}));

jest.mock('@/app/components/AccountActions/AccountActions', () => ({
  __esModule: true,
  default: () => <div data-testid="account-actions" />,
}));

describe('StudentSettingsPage', () => {
  it('gives student administrators a link to administration', async () => {
    mockRequireStudent.mockResolvedValue({ id: 'student-1', name: 'Admin', platformRole: 'ADMIN' });
    render(await StudentSettingsPage());
    expect(screen.getByRole('link', { name: 'Administration' })).toHaveAttribute('href', '/admin');
  });

  it('shows the display name read-only, plus the account actions', async () => {
    mockRequireStudent.mockResolvedValue({
      id: 'student-1',
      name: 'Hannah Yu',
      email: 'hannahyu@bu.edu',
      platformRole: 'USER',
    });
    render(await StudentSettingsPage());

    const account = screen.getByRole('region', { name: 'Account' });
    expect(within(account).getByText('Display name')).toBeInTheDocument();
    expect(within(account).getByText('Hannah Yu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Switch role' })).toHaveAttribute('href', '/debug-role');
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-actions')).toBeInTheDocument();
  });
});
