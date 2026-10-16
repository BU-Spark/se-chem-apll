import { render, screen, within } from '@testing-library/react';
import StudentSettingsPage from './page';

const mockGetOrCreateStudent = jest.fn();

jest.mock('@/lib/getOrCreateStudent', () => ({
  getOrCreateStudent: () => mockGetOrCreateStudent(),
}));

jest.mock('@/app/components/AccountActions/AccountActions', () => ({
  __esModule: true,
  default: () => <div data-testid="account-actions" />,
}));

describe('StudentSettingsPage', () => {
  it('shows the display name read-only, plus the account actions', async () => {
    mockGetOrCreateStudent.mockResolvedValue({ id: 'student-1', name: 'Hannah Yu', email: 'hannahyu@bu.edu' });
    render(await StudentSettingsPage());

    const account = screen.getByRole('region', { name: 'Account' });
    expect(within(account).getByText('Display name')).toBeInTheDocument();
    expect(within(account).getByText('Hannah Yu')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-actions')).toBeInTheDocument();
  });
});
