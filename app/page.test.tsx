import { redirect } from 'next/navigation';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

// Mock Clerk auth
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
  currentUser: jest.fn(),
}));

import { auth, currentUser } from '@clerk/nextjs/server';
import HomePage from './page';

describe('Home Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /sign-in when user is not logged in', async () => {
    (auth as jest.Mock).mockResolvedValue({ userId: null });

    await HomePage();

    expect(redirect).toHaveBeenCalledWith('/sign-in');
  });

  it('redirects to /select-role when user has no role set', async () => {
    (auth as jest.Mock).mockResolvedValue({ userId: 'user_123' });
    (currentUser as jest.Mock).mockResolvedValue({
      unsafeMetadata: {},
    });

    await HomePage();

    expect(redirect).toHaveBeenCalledWith('/select-role');
  });

  it('redirects to /instructor when user role is instructor', async () => {
    (auth as jest.Mock).mockResolvedValue({ userId: 'user_123' });
    (currentUser as jest.Mock).mockResolvedValue({
      unsafeMetadata: { role: 'instructor' },
    });

    await HomePage();

    expect(redirect).toHaveBeenCalledWith('/instructor');
  });

  it('redirects to /instructor when user role is student (no student UI yet)', async () => {
    (auth as jest.Mock).mockResolvedValue({ userId: 'user_123' });
    (currentUser as jest.Mock).mockResolvedValue({
      unsafeMetadata: { role: 'student' },
    });

    await HomePage();

    expect(redirect).toHaveBeenCalledWith('/instructor');
  });
});
