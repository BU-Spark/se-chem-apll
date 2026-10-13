import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuizPlayer from './QuizPlayer';
import type { StudentQuizQuestion } from '@/app/utils/studentQuizQuestion';

const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

jest.mock('@/app/components/QuestionBank/MarkdownPreview', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <span>{content}</span>,
}));

const questions: StudentQuizQuestion[] = [
  { id: 'q1', prompt: 'Which is a solid?', type: 'multipleChoice', choices: ['Ice', 'Steam'], allowsMultiple: false },
  {
    id: 'q2',
    prompt: 'Pick the metals',
    type: 'multipleChoice',
    choices: ['Iron', 'Neon', 'Gold'],
    allowsMultiple: true,
  },
  { id: 'q3', prompt: 'pH of water?', type: 'shortAnswer' },
];

function renderQuiz() {
  return render(<QuizPlayer attemptId="attempt-1" title="Node 1 Assessment" questions={questions} />);
}

describe('QuizPlayer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows one question at a time with progress', () => {
    renderQuiz();
    expect(screen.getByText('Which is a solid?')).toBeInTheDocument();
    expect(screen.queryByText('Pick the metals')).not.toBeInTheDocument();
    expect(screen.getByText('1/3 Questions')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('enables Next only after answering', async () => {
    const user = userEvent.setup();
    renderQuiz();

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /Ice/ }));
    expect(screen.getByRole('radio', { name: /Ice/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Pick the metals')).toBeInTheDocument();
    expect(screen.getByText('2/3 Questions')).toBeInTheDocument();
  });

  it('lets single-choice questions have only one selection', async () => {
    const user = userEvent.setup();
    renderQuiz();

    await user.click(screen.getByRole('radio', { name: /Ice/ }));
    await user.click(screen.getByRole('radio', { name: /Steam/ }));
    expect(screen.getByRole('radio', { name: /Ice/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /Steam/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('lets multi-answer questions toggle several choices', async () => {
    const user = userEvent.setup();
    renderQuiz();
    await user.click(screen.getByRole('radio', { name: /Ice/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Select all that apply.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Iron/ }));
    await user.click(screen.getByRole('checkbox', { name: /Gold/ }));
    await user.click(screen.getByRole('checkbox', { name: /Iron/ }));
    expect(screen.getByRole('checkbox', { name: /Iron/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('checkbox', { name: /Gold/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('Back returns to the previous question with its answer kept', async () => {
    const user = userEvent.setup();
    renderQuiz();

    await user.click(screen.getByRole('radio', { name: /Steam/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByText('1/3 Questions')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Steam/ })).toHaveAttribute('aria-checked', 'true');
  });

  async function answerFirstTwo(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('radio', { name: /Ice/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('checkbox', { name: /Iron/ }));
    await user.click(screen.getByRole('checkbox', { name: /Gold/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
  }

  it('blocks Submit until the short answer is a number', async () => {
    const user = userEvent.setup();
    renderQuiz();
    await answerFirstTwo(user);

    const input = screen.getByRole('textbox', { name: /Your answer/ });
    await user.type(input, 'seven');
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a number');
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    await user.clear(input);
    await user.type(input, '7');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
  });

  it('submits all answers and refreshes to show the result', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as never;
    const user = userEvent.setup();
    renderQuiz();
    await answerFirstTwo(user);
    await user.type(screen.getByRole('textbox', { name: /Your answer/ }), '7');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/student/quiz/attempts/attempt-1/submit', expect.any(Object));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      answers: [
        { questionId: 'q1', selectedIndices: [0] },
        { questionId: 'q2', selectedIndices: [0, 2] },
        { questionId: 'q3', rawAnswer: '7' },
      ],
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows the server error if submitting fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'This quiz was already submitted' }),
    }) as never;
    const user = userEvent.setup();
    renderQuiz();
    await answerFirstTwo(user);
    await user.type(screen.getByRole('textbox', { name: /Your answer/ }), '7');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('This quiz was already submitted')).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('has no "I\u2019m Not Sure" option', () => {
    renderQuiz();
    expect(screen.queryByRole('button', { name: /Not Sure/ })).not.toBeInTheDocument();
  });
});
