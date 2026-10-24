import { render, screen } from '@testing-library/react';
import { appUser, mockGetAppUser } from '@/test/mocks/appIdentity';
import AssignmentPage from './page';

jest.mock('@/lib/auth/identity', () => ({
  getAppUser: jest.requireActual('@/test/mocks/appIdentity').mockGetAppUser,
}));
jest.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`Redirect: ${path}`);
  },
  notFound: jest.fn(),
}));
const mockView = jest.fn();
jest.mock('@/lib/submissions/service', () => ({
  assignmentView: (...args: unknown[]) => mockView(...args),
  SubmissionError: class extends Error {},
}));
jest.mock('./AssignmentWork', () => ({
  __esModule: true,
  default: ({ initial }: { initial: { activeAttempt: { id: string } } }) => (
    <p>Saved attempt: {initial.activeAttempt.id}</p>
  ),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAppUser.mockResolvedValue(appUser({ id: 'student-1', appRole: 'STUDENT' }));
  mockView.mockResolvedValue({ activeAttempt: { id: 'saved-attempt' } });
});

it.each([
  ['saved-attempt', 'saved-attempt'],
  [undefined, undefined],
  [['first', 'second'], undefined],
])('loads the saved assignment with attempt query %p', async (attempt, expected) => {
  render(
    await AssignmentPage({
      params: Promise.resolve({ assignmentId: 'assignment-1' }),
      searchParams: Promise.resolve({ attempt }),
    })
  );
  expect(mockView).toHaveBeenCalledWith('student-1', 'assignment-1', expected);
  expect(screen.getByText('Saved attempt: saved-attempt')).toBeInTheDocument();
});

it.each([
  [null, '/sign-in'],
  [appUser({ appRole: 'INSTRUCTOR' }), '/instructor'],
] as const)('redirects unauthorized viewers before loading assignment data: %p', async (user, destination) => {
  mockGetAppUser.mockResolvedValue(user);
  await expect(
    AssignmentPage({
      params: Promise.resolve({ assignmentId: 'assignment-1' }),
      searchParams: Promise.resolve({ attempt: 'saved-attempt' }),
    })
  ).rejects.toThrow(`Redirect: ${destination}`);
  expect(mockView).not.toHaveBeenCalled();
});
