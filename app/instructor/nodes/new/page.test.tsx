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

    await user.click(screen.getByRole('button', { name: /Add quiz question/ }));
    const prompts = screen.getAllByLabelText(/Question prompt/);
    const quizCard = questionCardFor(prompts[1]);
    await user.type(prompts[1], 'Quiz bank question');
    await user.type(within(quizCard).getByPlaceholderText('Choice 1'), 'X');
    await user.type(within(quizCard).getByPlaceholderText('Choice 2'), 'Y');
    await user.click(within(quizCard).getAllByTitle('Mark as correct')[0]);

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
