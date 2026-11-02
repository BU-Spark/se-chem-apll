import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NodeQuiz from '../NodeQuiz';

const mockRefresh = jest.fn();
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh, push: mockPush }) }));
jest.mock('@/app/components/QuestionBank/MarkdownPreview', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <span>{content}</span>,
}));

const questions = [
  { id: 'q1', prompt: 'Which is a solid?', choices: ['Ice', 'Steam'] },
  { id: 'q2', prompt: 'What is 3 x 4?', choices: null },
];

function mockApi(...responses: Array<{ ok: boolean; body: unknown }>) {
  const fetchMock = jest.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({ ok: response.ok, json: async () => response.body });
  }
  global.fetch = fetchMock as never;
  return fetchMock;
}

function renderQuiz() {
  return render(
    <NodeQuiz courseLessonId="cl-1" lessonNodeId="ln1" nodeTitle="Atoms" lessonHref="/lesson" doneHref="/node" />
  );
}

const sentBody = (fetchMock: jest.Mock, call: number) => JSON.parse(fetchMock.mock.calls[call][1].body);

describe('NodeQuiz', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.crypto.randomUUID = () => '00000000-0000-4000-8000-000000000000';
  });

  it('starts a quiz attempt through the team API when the student continues', async () => {
    const fetchMock = mockApi({ ok: true, body: { id: 'attempt-1', questions } });
    renderQuiz();

    expect(screen.getByRole('heading', { name: 'Atoms' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/lesson');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(fetchMock.mock.calls[0][0]).toBe('/api/student/assignments/cl-1');
    expect(sentBody(fetchMock, 0)).toEqual({
      action: 'start',
      nodeId: 'ln1',
      kind: 'QUIZ',
      key: '00000000-0000-4000-8000-000000000000',
    });
    expect(await screen.findByText('Which is a solid?')).toBeInTheDocument();
    expect(screen.getByText('1/2 Questions')).toBeInTheDocument();
  });

  it('records "I’m Not Sure" after the encouragement dialog and submits all answers', async () => {
    const fetchMock = mockApi({ ok: true, body: { id: 'attempt-1', questions } }, { ok: true, body: {} });
    renderQuiz();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await userEvent.click(await screen.findByRole('button', { name: /Not Sure/ }));
    const dialog = screen.getByRole('dialog', { name: 'That’s Okay!' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }));

    expect(screen.getByText('What is 3 x 4?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: /Your answer/ }), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(sentBody(fetchMock, 1)).toEqual({
      action: 'finish',
      attemptId: 'attempt-1',
      answers: [
        { questionId: 'q1', notSure: true },
        { questionId: 'q2', rawAnswer: '12' },
      ],
    });
    expect(mockPush).toHaveBeenCalledWith('/node');
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('only allows Next once a choice is picked', async () => {
    mockApi({ ok: true, body: { id: 'attempt-1', questions } });
    renderQuiz();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /Ice/ }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('shows the server message when starting fails', async () => {
    mockApi({ ok: false, body: { error: 'This badge deadline has passed.' } });
    renderQuiz();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This badge deadline has passed.');
  });

  it('starts right away when retaking the quiz', async () => {
    const fetchMock = mockApi({ ok: true, body: { id: 'attempt-2', questions } });
    render(
      <NodeQuiz
        courseLessonId="cl-1"
        lessonNodeId="ln1"
        nodeTitle="Atoms"
        lessonHref="/lesson"
        doneHref="/node"
        startImmediately
      />
    );
    expect(await screen.findByText('Which is a solid?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('submits right away when the student is not sure on the last question', async () => {
    const fetchMock = mockApi({ ok: true, body: { id: 'attempt-1', questions } }, { ok: true, body: {} });
    renderQuiz();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByRole('radio', { name: /Ice/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await userEvent.click(screen.getByRole('button', { name: /Not Sure/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Next' }));

    expect(sentBody(fetchMock, 1)).toEqual({
      action: 'finish',
      attemptId: 'attempt-1',
      answers: [
        { questionId: 'q1', selectedIndices: [0] },
        { questionId: 'q2', notSure: true },
      ],
    });
    expect(mockPush).toHaveBeenCalledWith('/node');
  });
});
