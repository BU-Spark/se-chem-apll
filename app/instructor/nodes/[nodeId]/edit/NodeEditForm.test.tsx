import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NodeEditForm from './NodeEditForm';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('@/app/components/NodeForm/YouTubeAuthoringPlayer', () => ({
  __esModule: true,
  default: () => <div data-testid="youtube-player" />,
}));

const node = {
  id: 'node-1',
  title: 'Existing node',
  summary: 'Summary',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  tags: ['Safety', 'Procedure'],
  learningObjectives: ['Identify hazards.', 'Apply the procedure.'],
  checkpoints: [
    {
      id: 'cp-1',
      timeOffsetSeconds: 90,
      questions: [
        {
          id: 'cq-1',
          prompt: 'Checkpoint prompt',
          options: { type: 'multipleChoice', choices: ['A', 'B'] },
          correctIndices: [0],
        },
        {
          id: 'cq-2',
          kind: 'NOTE' as const,
          prompt: 'Observe the flame before proceeding.',
          options: { type: 'note' },
          correctIndices: [],
        },
      ],
    },
  ],
  quizQuestions: [
    {
      id: 'qq-1',
      prompt: 'Quiz prompt',
      options: { type: 'multipleChoice', choices: ['X', 'Y'] },
      correctIndices: [1],
    },
  ],
};

async function advanceToReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Checkpoints (QEV)' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: /Quiz question bank/ })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Preview & submit' })).toBeInTheDocument();
}

describe('NodeEditForm', () => {
  beforeEach(() => {
    push.mockReset();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'node-1' }) });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hydrates checkpoints and quiz bank and PATCHes them', async () => {
    const user = userEvent.setup();
    render(<NodeEditForm node={node} />);

    expect(screen.getByDisplayValue('Existing node')).toBeInTheDocument();
    expect(screen.getByText('Safety')).toBeInTheDocument();
    expect(screen.getByText('Procedure')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Identify hazards.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Apply the procedure.')).toBeInTheDocument();

    await advanceToReview(user);
    expect(screen.getByText(/Checkpoint prompt/)).toBeInTheDocument();
    expect(screen.getByText(/Quiz prompt/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/instructor/nodes/node-1');
    expect(request.method).toBe('PATCH');
    const body = JSON.parse(request.body);
    expect(body.tags).toEqual(['Safety', 'Procedure']);
    expect(body.learningObjectives).toEqual(['Identify hazards.', 'Apply the procedure.']);
    expect(body.checkpoints[0].timeOffsetSeconds).toBe(90);
    expect(body.checkpoints[0].questions[0]).toEqual(
      expect.objectContaining({
        prompt: 'Checkpoint prompt',
        options: { type: 'multipleChoice', choices: ['A', 'B'] },
        correctIndices: [0],
      })
    );
    expect(body.checkpoints[0].questions[1]).toEqual(
      expect.objectContaining({
        kind: 'note',
        prompt: 'Observe the flame before proceeding.',
        options: { type: 'note' },
        correctIndices: [],
      })
    );
    expect(body.quizQuestions[0]).toEqual(
      expect.objectContaining({
        prompt: 'Quiz prompt',
        options: { type: 'multipleChoice', choices: ['X', 'Y'] },
        correctIndices: [1],
      })
    );

    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Changes saved' })).toBeInTheDocument());
    expect(screen.getByText(/Your changes were saved successfully/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit again' }));
    expect(screen.getByRole('heading', { name: 'Preview & submit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('/api/instructor/nodes/node-1');
    expect((global.fetch as jest.Mock).mock.calls[1][1].method).toBe('PATCH');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Changes saved' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Back to nodes' }));
    expect(push).toHaveBeenCalledWith('/instructor/nodes');
  });
  it('adds tags on the basics step', async () => {
    const user = userEvent.setup();
    render(<NodeEditForm node={{ ...node, tags: [], learningObjectives: [] }} />);

    await user.type(screen.getByLabelText('New tag'), 'Pressure');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Pressure')).toBeInTheDocument();

    await user.type(screen.getByLabelText('New tag'), 'pressure{Enter}');
    expect(screen.getAllByText('Pressure')).toHaveLength(1);
    await user.type(screen.getByLabelText('Learning objective 1'), 'Understand how to measure pressure.');

    await advanceToReview(user);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.tags).toEqual(['Pressure']);
    expect(body.learningObjectives).toEqual(['Understand how to measure pressure.']);
  });

  it('adds, edits, and removes learning-objective rows independently from tags', async () => {
    const user = userEvent.setup();
    render(<NodeEditForm node={{ ...node, tags: ['Safety'], learningObjectives: ['First objective'] }} />);

    const firstObjective = screen.getByLabelText('Learning objective 1');
    await user.clear(firstObjective);
    await user.type(firstObjective, 'Updated first objective');
    await user.click(screen.getByRole('button', { name: 'Add learning objective' }));
    await user.type(screen.getByLabelText('Learning objective 2'), 'Second objective');
    await user.click(screen.getByRole('button', { name: 'Remove learning objective 1' }));

    expect(screen.queryByDisplayValue('Updated first objective')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Second objective')).toBeInTheDocument();
    expect(screen.getByText('Safety')).toBeInTheDocument();

    await advanceToReview(user);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.tags).toEqual(['Safety']);
    expect(body.learningObjectives).toEqual(['Second objective']);
  });

  it('blocks Next without a title', async () => {
    const user = userEvent.setup();
    render(<NodeEditForm node={{ ...node, title: '' }} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Basic info' })).toBeInTheDocument();
  });
});
