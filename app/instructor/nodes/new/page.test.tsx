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

async function goToCheckpoints(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Checkpoints (QEV)' })).toBeInTheDocument();
}

describe('NewNodePage', () => {
  beforeEach(() => {
    push.mockReset();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'node-created-1' }) });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('submits checkpoints and quiz questions separately', async () => {
    const user = userEvent.setup();
    render(<NewNodePage />);

    await user.type(screen.getByLabelText(/Title/), 'Safety video');
    await user.type(screen.getByLabelText(/Video URL/), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await user.type(screen.getByLabelText('New learning objective'), 'Stay safe{Enter}');
    await goToCheckpoints(user);

    await user.click(screen.getByRole('button', { name: /Add checkpoint manually/ }));
    expect(screen.getByText(/Checkpoint 1 · 0:00/)).toBeInTheDocument();

    const checkpointPrompt = screen.getByLabelText(/Question prompt/);
    const checkpointCard = questionCardFor(checkpointPrompt);
    await user.type(checkpointPrompt, 'Checkpoint question');
    await user.type(within(checkpointCard).getByPlaceholderText('Choice 1'), 'A');
    await user.type(within(checkpointCard).getByPlaceholderText('Choice 2'), 'B');
    await user.click(within(checkpointCard).getAllByTitle('Mark as correct')[0]);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: /Quiz question bank/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Add quiz question/ }));
    const prompts = screen.getAllByLabelText(/Question prompt/);
    const quizCard = questionCardFor(prompts[0]);
    await user.type(prompts[0], 'Quiz bank question');
    await user.type(within(quizCard).getByPlaceholderText('Choice 1'), 'X');
    await user.type(within(quizCard).getByPlaceholderText('Choice 2'), 'Y');
    await user.click(within(quizCard).getAllByTitle('Mark as correct')[0]);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Preview & submit' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create node' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(request.body);

    expect(body.learningObjectives).toEqual(['Stay safe']);
    expect(body.checkpoints).toEqual([
      expect.objectContaining({
        timeOffsetSeconds: 0,
        questions: [expect.objectContaining({ prompt: 'Checkpoint question' })],
      }),
    ]);
    expect(body.quizQuestions).toEqual([expect.objectContaining({ prompt: 'Quiz bank question' })]);
    expect(body).not.toHaveProperty('questions');
    expect(push).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Node created' })).toBeInTheDocument());
    expect(screen.getByText(/Your node was created successfully/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit again' }));
    expect(screen.getByRole('heading', { name: 'Preview & submit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('/api/instructor/nodes/node-created-1');
    expect((global.fetch as jest.Mock).mock.calls[1][1].method).toBe('PATCH');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Changes saved' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Back to nodes' }));
    expect(push).toHaveBeenCalledWith('/instructor/nodes');
  });

  it('submits an informational note at a checkpoint without answer controls', async () => {
    const user = userEvent.setup();
    render(<NewNodePage />);

    await user.type(screen.getByLabelText(/Title/), 'Safety video');
    await user.type(screen.getByLabelText(/Video URL/), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await goToCheckpoints(user);
    await user.click(screen.getByRole('button', { name: /Add checkpoint manually/ }));
    await user.selectOptions(screen.getByLabelText('Type:'), 'note');

    const note = screen.getByLabelText('Note text');
    await user.type(note, 'Watch the flame color closely.');
    expect(screen.queryByPlaceholderText('Choice 1')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: /Add quiz question/ }));
    const quizPrompt = screen.getByLabelText(/Question prompt/);
    const quizCard = questionCardFor(quizPrompt);
    await user.type(quizPrompt, 'Quiz bank question');
    await user.type(within(quizCard).getByPlaceholderText('Choice 1'), 'A');
    await user.type(within(quizCard).getByPlaceholderText('Choice 2'), 'B');
    await user.click(within(quizCard).getAllByTitle('Mark as correct')[0]);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Create node' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(request.body);
    expect(body.checkpoints[0].questions).toEqual([
      expect.objectContaining({
        kind: 'note',
        prompt: 'Watch the flame color closely.',
        options: { type: 'note' },
        correctIndices: [],
      }),
    ]);
  });

  it('assigns the next free offset when adding checkpoints manually', async () => {
    const user = userEvent.setup();
    render(<NewNodePage />);

    await user.type(screen.getByLabelText(/Title/), 'Safety video');
    await user.type(screen.getByLabelText(/Video URL/), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await goToCheckpoints(user);

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

  it('saves an incomplete node as a draft from the first step', async () => {
    const user = userEvent.setup();
    render(<NewNodePage />);

    await user.click(screen.getByRole('button', { name: 'Save as draft' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual(
      expect.objectContaining({
        title: '',
        videoUrl: null,
        checkpoints: [],
        quizQuestions: [],
        isDraft: true,
      })
    );
    expect(push).toHaveBeenCalledWith('/instructor/nodes');
  });
});
