import { render, screen, waitFor } from '@testing-library/react';
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
    await user.type(screen.getByLabelText(/Question prompt/), 'Checkpoint question');
    await user.click(screen.getAllByTitle('Mark as correct')[0]);

    await user.click(screen.getByRole('button', { name: /Add quiz question/ }));
    const prompts = screen.getAllByLabelText(/Question prompt/);
    await user.type(prompts[1], 'Quiz bank question');
    await user.click(screen.getAllByTitle('Mark as correct')[2]);

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

  it('rejects duplicate checkpoint timestamps by focusing the existing one', async () => {
    const user = userEvent.setup();
    render(<NewNodePage />);

    await user.type(screen.getByLabelText(/Title/), 'Safety video');
    await user.click(screen.getByRole('button', { name: /Add checkpoint manually/ }));
    await user.type(screen.getByLabelText(/Question prompt/), 'First');
    await user.click(screen.getAllByTitle('Mark as correct')[0]);

    await user.click(screen.getByRole('button', { name: /Add checkpoint manually/ }));
    expect(screen.getAllByLabelText(/Question prompt/)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Create node' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });
});
