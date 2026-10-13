import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AssignmentWork from './AssignmentWork';
const mockFetch = jest.fn();
const originalFetch = global.fetch;
jest.mock('@/app/components/QuestionBank/MarkdownPreview', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <span>{content}</span>,
}));
const initial = {
  id: 'cl1',
  courseId: 'c1',
  courseTitle: 'Chemistry',
  title: 'Atoms',
  window: 'ON_TIME',
  best: null,
  policy: { dueDate: null, lateDeadline: null, latePenaltyType: 'NONE' as const, latePenaltyPercent: 0 },
  nodes: [{ id: 'n1', title: 'Node', videoUrl: null, tasks: [{ kind: 'QUIZ', completed: false, score: null }] }],
};
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
  Object.defineProperty(global.crypto, 'randomUUID', { configurable: true, value: () => 'request-key-123' });
});
afterAll(() => {
  global.fetch = originalFetch;
});

it('renders the saved variant on reload and submits against that same attempt without starting another', async () => {
  const activeAttempt = {
    id: 'saved-attempt',
    nodeTitle: 'Node',
    kind: 'QUIZ',
    completedAt: null,
    score: null,
    questions: [{ id: 'q1', prompt: 'Moles of NaCl in 58.44 g?', choices: null }],
  };
  const restored = { ...initial, activeAttempt };
  const firstRender = render(<AssignmentWork initial={restored} />);
  expect(screen.getByText('Moles of NaCl in 58.44 g?')).toBeInTheDocument();
  firstRender.unmount();
  render(<AssignmentWork initial={restored} />);
  expect(mockFetch).not.toHaveBeenCalled();
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...activeAttempt, completedAt: '2026-01-01', score: 100 }),
    })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ...initial, activeAttempt: null }) });
  fireEvent.change(screen.getByLabelText('Numeric answer'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save answers' }));
  await screen.findByText('Attempt recorded: 100%');
  expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({
    action: 'finish',
    attemptId: 'saved-attempt',
    answers: [{ questionId: 'q1', rawAnswer: '1' }],
  });
});
it('sends answers to the assignment endpoint, then shows a server-calculated receipt', async () => {
  const receipt = {
    number: 1,
    submittedAt: '2026-01-01',
    rawPercent: 100,
    penaltyPercent: 0,
    finalPercent: 100,
    passed: true,
  };
  const ready = {
    ...initial,
    nodes: [{ ...initial.nodes[0], tasks: [{ kind: 'QUIZ', completed: true, score: 100 }] }],
  };
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'a1',
        nodeTitle: 'Node',
        kind: 'QUIZ',
        completedAt: null,
        questions: [{ id: 'q1', prompt: 'Choose', choices: ['A', 'B'] }],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'a1',
        nodeTitle: 'Node',
        kind: 'QUIZ',
        questions: [],
        completedAt: '2026-01-01',
        score: 100,
      }),
    })
    .mockResolvedValueOnce({ ok: true, json: async () => ready })
    .mockResolvedValueOnce({ ok: true, json: async () => receipt })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ...ready, best: receipt }) });
  render(<AssignmentWork initial={initial} />);
  expect(screen.getByRole('button', { name: 'Submit lesson' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /Quiz · Not completed/ }));
  fireEvent.click(await screen.findByLabelText('B'));
  fireEvent.click(screen.getByRole('button', { name: 'Save answers' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Submit lesson' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Submit lesson' }));
  expect(await screen.findByText('Submission receipt')).toBeInTheDocument();
  const body = JSON.parse(mockFetch.mock.calls[1][1].body);
  expect(body.answers).toEqual([{ questionId: 'q1', selectedIndices: [1] }]);
  expect(mockFetch.mock.calls[0][0]).toBe('/api/student/assignments/cl1');
});
it('keeps the same idempotency key when retrying a failed submission request', async () => {
  const ready = { ...initial, nodes: [] };
  mockFetch
    .mockRejectedValueOnce(new Error('Network unavailable'))
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Still unavailable' }) });
  render(<AssignmentWork initial={ready} />);
  fireEvent.click(screen.getByRole('button', { name: 'Submit lesson' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Submit lesson' }));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(mockFetch.mock.calls[0][1].body).key).toBe(JSON.parse(mockFetch.mock.calls[1][1].body).key);
});
