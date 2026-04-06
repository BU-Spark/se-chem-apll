import { redirect } from 'next/navigation';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

// Mock Clerk auth
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import HomePage from './page';

describe('Home Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /instructor when user is logged in', async () => {
    (auth as jest.Mock).mockResolvedValue({ userId: 'user_123' });

    await HomePage();

    expect(redirect).toHaveBeenCalledWith('/instructor');
  });

  it('redirects to /sign-in when user is not logged in', async () => {
    (auth as jest.Mock).mockResolvedValue({ userId: null });

    await HomePage();

    expect(redirect).toHaveBeenCalledWith('/sign-in');
  });
});
