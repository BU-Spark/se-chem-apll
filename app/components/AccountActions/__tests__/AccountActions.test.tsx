import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountActions from '../AccountActions';

const mockOpenUserProfile = jest.fn();
const mockSignOutProps = jest.fn();

jest.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ openUserProfile: mockOpenUserProfile }),
  SignOutButton: ({ children, ...props }: { children: React.ReactNode; redirectUrl: string }) => {
    mockSignOutProps(props);
    return children;
  },
}));

describe('AccountActions', () => {
  it("opens Clerk's account screen from Manage account", async () => {
    render(<AccountActions />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage account' }));
    expect(mockOpenUserProfile).toHaveBeenCalled();
  });

  it('signs out back to the sign-in page', () => {
    render(<AccountActions />);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(mockSignOutProps).toHaveBeenCalledWith({ redirectUrl: '/sign-in' });
  });
});
