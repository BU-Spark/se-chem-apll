import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewNodePage from './page';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('@/app/components/NodeForm/YouTubeAuthoringPlayer', () => ({
  __esModule: true,
  default: () => <div data-testid="youtube-player" />,
}));

jest.mock('@/app/components/QuestionBank/QuestionBankEditor', () => {
  return {
    __esModule: true,
    default: function MockQuestionBankEditor({
      questions,
      onChange,
    }: {
      questions: Array<{ id: string; type: string; prompt: string; [key: string]: unknown }>;
      onChange: (next: typeof questions) => void;
    }) {
      return (
        <div data-testid="question-bank-editor">
          {questions.map((q, index) => (
            <div key={q.id}>
              <label>
                Quiz question prompt {index + 1}
                <input
                  aria-label={`Quiz question prompt ${index + 1}`}
                  value={q.prompt}
                  onChange={(e) =>
                    onChange(questions.map((item) => (item.id === q.id ? { ...item, prompt: e.target.value } : item)))
                  }
                />
              </label>
            </div>
          ))}
          <div data-testid="quiz-draft-row">
            <label>
              Draft quiz prompt
              <input aria-label="Draft quiz prompt" name="prompt" />
            </label>
            <input aria-label="Draft quiz choice 1" name="choice1" placeholder="Choice 1" />
            <input aria-label="Draft quiz choice 2" name="choice2" placeholder="Choice 2" />
            <button
              type="button"
              onClick={(e) => {
                const root = (e.currentTarget.parentElement as HTMLElement) ?? null;
                const prompt = (root?.querySelector('input[name="prompt"]') as HTMLInputElement | null)?.value ?? '';
                const choice1 = (root?.querySelector('input[name="choice1"]') as HTMLInputElement | null)?.value ?? '';
                const choice2 = (root?.querySelector('input[name="choice2"]') as HTMLInputElement | null)?.value ?? '';
                onChange([
                  ...questions,
                  {
                    id: `mock-q-${questions.length + 1}`,
                    type: 'multipleChoice' as const,
                    prompt,
                    choices: [
                      { id: `mock-c-${questions.length + 1}-1`, content: choice1, correct: true },
                      { id: `mock-c-${questions.length + 1}-2`, content: choice2, correct: false },
                    ],
                  },
                ]);
                root?.querySelectorAll('input').forEach((input) => {
                  (input as HTMLInputElement).value = '';
                });
              }}
            >
              Commit draft
            </button>
          </div>
        </div>
      );
    },
  };
});

function questionCardFor(prompt: HTMLElement) {
  return prompt.closest('[class*="questionCard"]') as HTMLElement;
}

describe('NewNodePage', () => {
  beforeEach(() => {
    push.mockReset();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('submits checkpoints and quiz questions separately', async () => {
    const user = userEvent.setup();
    render(<NewNodePage />);

    await user.type(screen.getByLabelText(/Title/), 'Safety video');
    await user.click(screen.getByRole('button', { name: /Add checkpoint manually/ }));
    expect(screen.getByText(/Checkpoint 1 · 0:00/)).toBeInTheDocument();

    const checkpointPrompt = screen.getByLabelText(/Question prompt/);
    const checkpointCard = questionCardFor(checkpointPrompt);
    await user.type(checkpointPrompt, 'Checkpoint question');
    await user.type(within(checkpointCard).getByPlaceholderText('Choice 1'), 'A');
    await user.type(within(checkpointCard).getByPlaceholderText('Choice 2'), 'B');
    await user.click(within(checkpointCard).getAllByTitle('Mark as correct')[0]);

    const quizGrid = screen.getByTestId('question-bank-editor');
    await user.type(within(quizGrid).getByLabelText(/Draft quiz prompt/), 'Quiz bank question');
    await user.type(within(quizGrid).getByLabelText(/Draft quiz choice 1/), 'X');
    await user.type(within(quizGrid).getByLabelText(/Draft quiz choice 2/), 'Y');
    await user.click(within(quizGrid).getByRole('button', { name: /Commit draft/ }));

    await user.click(screen.getByRole('button', { name: 'Create node' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(request.body);

    expect(body.checkpoints).toEqual([
      expect.objectContaining({
        timeOffsetSeconds: 0,
        questions: [expect.objectContaining({ prompt: 'Checkpoint question' })],
      }),
    ]);
    expect(body.quizQuestions).toEqual([expect.objectContaining({ prompt: 'Quiz bank question' })]);
    expect(body).not.toHaveProperty('questions');
    expect(push).toHaveBeenCalledWith('/instructor/nodes');
  });

  it('assigns the next free offset when adding checkpoints manually', async () => {
    const user = userEvent.setup();
    render(<NewNodePage />);

    await user.type(screen.getByLabelText(/Title/), 'Safety video');
    await user.click(screen.getByRole('button', { name: /Add checkpoint manually/ }));
    await user.type(screen.getByLabelText(/Question prompt/), 'First');
    await user.click(
      within(questionCardFor(screen.getByLabelText(/Question prompt/))).getAllByTitle('Mark as correct')[0]
    );

    await user.click(screen.getByRole('button', { name: /Add checkpoint manually/ }));
    expect(screen.getByText(/Checkpoint 1 · 0:00/)).toBeInTheDocument();
    expect(screen.getByText(/Checkpoint 2 · 1:00/)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Question prompt/)).toHaveLength(2);
  });
});
