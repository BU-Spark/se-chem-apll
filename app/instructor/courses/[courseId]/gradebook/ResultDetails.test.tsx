import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ResultDetails from './ResultDetails';
const mockFetch = jest.fn();
const originalFetch = global.fetch;
jest.mock('@/app/components/QuestionBank/MarkdownPreview', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));
const submission = {
  id: 's1',
  number: 1,
  submittedAt: '2026-01-01T13:00:00Z',
  rawPercent: 80,
  penaltyPercent: 2,
  finalPercent: 78.4,
  passed: true,
  gradingStatus: 'GRADED',
  snapshot: {
    hoursLate: 1,
    policy: {
      dueDate: '2026-01-01T12:00:00Z',
      lateDeadline: '2026-01-02',
      latePenaltyType: 'HOURLY',
      latePenaltyPercent: 2,
    },
    nodes: [{ title: 'Atoms', score: 80, attemptId: 'a1', passingPercent: 70 }],
    attemptIds: ['a1'],
  },
};
const data = {
  progress: { percentComplete: 100 },
  bestId: 's1',
  submissions: [submission],
  attempts: [],
  nextCursor: null,
};
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
});
afterAll(() => {
  global.fetch = originalFetch;
});
it('shows the stored breakdown and loads historical answers on expansion', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => data }).mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      responses: [
        {
          id: 'r1',
          selectedIndices: [1],
          rawAnswer: null,
          isCorrect: true,
          createdAt: '2026-01-01',
          snapshot: { prompt: 'Historical prompt', options: ['One', 'Two'] },
        },
      ],
    }),
  });
  const { container } = render(<ResultDetails courseId="c1" studentId="s1" lessonId="cl1" />);
  expect(await screen.findByText('Submission #1 · Best result')).toBeInTheDocument();
  expect(screen.getByText('78.4%')).toBeInTheDocument();
  expect(mockFetch.mock.calls[0][0]).toContain('assignmentId=cl1');
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const detail = container.querySelector('details')!;
  detail.open = true;
  fireEvent(detail, new Event('toggle'));
  expect(await screen.findByText('Historical prompt')).toBeInTheDocument();
  expect(screen.getByText('Two')).toBeInTheDocument();
});
it('retries failures and loads older submissions', async () => {
  mockFetch
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ...data, nextCursor: 's1' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ...data, submissions: [] }) });
  render(<ResultDetails courseId="c1" studentId="s1" lessonId="cl1" />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Older submissions' }));
  await waitFor(() => expect(mockFetch.mock.calls[2][0]).toContain('cursor=s1'));
  expect(await screen.findByText('No submissions yet.')).toBeInTheDocument();
});
it('aborts a request on close', () => {
  mockFetch.mockImplementation(() => new Promise(() => {}));
  const { unmount } = render(<ResultDetails courseId="c1" studentId="s1" lessonId="cl1" />);
  const signal = mockFetch.mock.calls[0][1].signal;
  unmount();
  expect(signal.aborted).toBe(true);
});
