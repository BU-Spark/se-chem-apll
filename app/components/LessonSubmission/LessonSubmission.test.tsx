import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LessonSubmission from './LessonSubmission';
import type { LessonSubmissionView } from '@/lib/submissions/service';

const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
const receipt = {
  id: 's1',
  number: 1,
  submittedAt: '2026-11-01T12:00:00Z',
  rawPercent: 80,
  penaltyPercent: 10,
  finalPercent: 72,
  gradingStatus: 'GRADED' as const,
  passed: true,
};
const view: LessonSubmissionView = {
  window: 'LATE',
  dueDate: '2026-11-01T00:00:00Z',
  lateDeadline: '2026-11-02T00:00:00Z',
  latePenaltyType: 'FIXED',
  latePenaltyPercent: 10,
  blockedReason: null,
  pendingKey: 'roadmap:work-1',
  latest: null,
  best: null,
};

beforeEach(() => jest.clearAllMocks());

it('reuses the pending key after a lost response and displays the saved receipt', async () => {
  const fetchMock = jest
    .fn()
    .mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ...receipt, idempotencyKey: view.pendingKey }) });
  global.fetch = fetchMock;
  render(<LessonSubmission assignmentId="cl1" view={view} />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry submission' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
  fireEvent.click(screen.getByRole('button', { name: 'Retry submission' }));
  expect(await screen.findByRole('heading', { name: 'Submission receipt' })).toBeInTheDocument();
  expect(screen.getByText('80%')).toBeInTheDocument();
  expect(screen.getByText('10% of earned score')).toBeInTheDocument();
  expect(screen.getByText('72%')).toBeInTheDocument();
  expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body))).toEqual([
    { action: 'submitRoadmap', key: view.pendingKey },
    { action: 'submitRoadmap', key: view.pendingKey },
  ]);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(2));
});

it('shows persisted latest and best receipts after reload, even after closing', () => {
  render(
    <LessonSubmission
      assignmentId="cl1"
      view={{
        ...view,
        window: 'CLOSED',
        pendingKey: null,
        latest: { ...receipt, id: 's2', number: 2, finalPercent: 60 },
        best: receipt,
      }}
    />
  );
  expect(screen.getByText(/Submissions are closed/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Best result retained' })).toBeInTheDocument();
  expect(screen.getByText('60%')).toBeInTheDocument();
  expect(screen.getByText('72%')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('labels completion-only work without displaying a numeric zero grade', () => {
  render(
    <LessonSubmission
      assignmentId="cl1"
      view={{
        ...view,
        pendingKey: null,
        latest: { ...receipt, rawPercent: null, finalPercent: null, gradingStatus: 'COMPLETION_ONLY' },
      }}
    />
  );
  expect(screen.getAllByText('Completion only')).toHaveLength(2);
});

it.each(['CLOSED', 'NOT_OPEN'] as const)('does not allow recovery in the %s window', (window) => {
  render(<LessonSubmission assignmentId="cl1" view={{ ...view, window }} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('shows the reason work is blocked instead of a submit button', () => {
  render(
    <LessonSubmission
      assignmentId="cl1"
      view={{ ...view, pendingKey: null, blockedReason: 'The lesson contains unpublished work.' }}
    />
  );
  expect(screen.getByText('The lesson contains unpublished work.')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
