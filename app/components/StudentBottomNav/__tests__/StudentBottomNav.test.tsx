import { render, screen } from '@testing-library/react';
import StudentBottomNav from '../StudentBottomNav';

let mockPathname = '/student';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

describe('StudentBottomNav', () => {
  it('does not link Home while on the home page', () => {
    mockPathname = '/student';
    render(<StudentBottomNav />);

    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
    expect(screen.getByText('Home').parentElement).toHaveAttribute('aria-current', 'page');
  });

  it('links Lessons, Profile and Settings to their pages', () => {
    mockPathname = '/student';
    render(<StudentBottomNav />);

    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/student/profile');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/student/settings');
    expect(screen.getByRole('link', { name: 'Lessons' })).toHaveAttribute('href', '/student/lessons');
  });

  it('highlights the current page instead of linking it', () => {
    mockPathname = '/student/profile';
    const { container } = render(<StudentBottomNav />);

    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();
    // Whatever element is marked as the current page, however the label is nested inside it.
    expect(container.querySelector('[aria-current="page"]')).toHaveTextContent('Profile');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/student');
  });

  it('links Home back to the home page from other pages', () => {
    mockPathname = '/student/coming-soon';
    render(<StudentBottomNav />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/student');
  });
});
