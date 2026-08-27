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

jest.mock('@/app/components/QuestionBank/QuestionBankEditor', () => {
  return {
    __esModule: true,
    default: function MockQuestionBankEditor({
      questions,
      onChange,
      onSave,
    }: {
      questions: Array<{ id: string; type: string; prompt: string }>;
      onChange: (next: typeof questions) => void;
      onSave: () => void | Promise<void>;
    }) {
      return (
        <div data-testid="question-bank-editor">
          {questions.map((q, index) => (
            <label key={q.id}>
              Quiz question prompt {index + 1}
              <input
                aria-label={`Quiz question prompt ${index + 1}`}
                value={q.prompt}
                onChange={(e) =>
                  onChange(questions.map((item) => (item.id === q.id ? { ...item, prompt: e.target.value } : item)))
                }
              />
            </label>
          ))}
          <button type="button" onClick={() => void onSave()}>
            Mock save node command
          </button>
        </div>
      );
    },
  };
});

const node = {
  id: 'node-1',
  title: 'Existing node',
  summary: 'Summary',
  videoUrl: '',
  learningObjectives: ['Identify hazards', 'Apply procedure'],
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
  expect(screen.getByRole('heading', { name: 'Quiz question bank' })).toBeInTheDocument();
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
    expect(screen.getByText('Identify hazards')).toBeInTheDocument();
    expect(screen.getByText('Apply procedure')).toBeInTheDocument();

    await advanceToReview(user);
    expect(screen.getByText(/Checkpoint prompt/)).toBeInTheDocument();
    expect(screen.getByText(/Quiz prompt/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/instructor/nodes/node-1');
    expect(request.method).toBe('PATCH');
    const body = JSON.parse(request.body);
    expect(body.learningObjectives).toEqual(['Identify hazards', 'Apply procedure']);
    expect(body.checkpoints[0].timeOffsetSeconds).toBe(90);
    expect(body.checkpoints[0].questions[0]).toEqual(
      expect.objectContaining({
        prompt: 'Checkpoint prompt',
        options: { type: 'multipleChoice', choices: ['A', 'B'] },
        correctIndices: [0],
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

  it('saves directly from the quiz-bank command without visiting Review', async () => {
    const user = userEvent.setup();
    render(<NodeEditForm node={node} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Quiz question bank' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mock save node command' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/api/instructor/nodes/node-1');
    expect((global.fetch as jest.Mock).mock.calls[0][1].method).toBe('PATCH');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Changes saved' })).toBeInTheDocument());
  });

  it('renders formatted quiz prompts and choices in the Review step', async () => {
    const user = userEvent.setup();
    const formattedNode = {
      ...node,
      quizQuestions: [
        {
          id: 'qq-formatted',
          prompt: '**Water** contains $\\ce{H2O}$.',
          options: { type: 'multipleChoice', choices: ['$2$ atoms', '$3$ atoms'] },
          correctIndices: [1],
        },
      ],
    };
    render(<NodeEditForm node={formattedNode} />);

    await advanceToReview(user);

    expect(screen.getByText('Water')).toHaveStyle({ fontWeight: 'bold' });
    expect(screen.getAllByTestId('markdown-preview')).toHaveLength(3);
    expect(screen.getAllByTestId('markdown-preview').some((preview) => preview.querySelector('.katex'))).toBe(true);
    expect(screen.getByText('Correct')).toBeInTheDocument();
  });

  it('adds learning objective tags on the basics step', async () => {
    const user = userEvent.setup();
    render(<NodeEditForm node={{ ...node, learningObjectives: [] }} />);

    await user.type(screen.getByLabelText('New learning objective'), 'Measure pressure');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Measure pressure')).toBeInTheDocument();

    await user.type(screen.getByLabelText('New learning objective'), 'measure pressure{Enter}');
    expect(screen.getAllByText('Measure pressure')).toHaveLength(1);

    await advanceToReview(user);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.learningObjectives).toEqual(['Measure pressure']);
  });

  it('blocks Next without a title', async () => {
    const user = userEvent.setup();
    render(<NodeEditForm node={{ ...node, title: '' }} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Basic info' })).toBeInTheDocument();
  });
});
