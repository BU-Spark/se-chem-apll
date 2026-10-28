import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NodeEditForm from './NodeEditForm';
import NodeForm from '@/app/components/NodeForm/NodeForm';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('@/app/components/NodeForm/YouTubeAuthoringPlayer', () => ({
  __esModule: true,
  default: () => <div data-testid="youtube-player" />,
}));

jest.mock('@/app/components/QuestionBank/MarkdownField', () => ({
  __esModule: true,
  default: ({
    label,
    value,
    onChange,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <label>
      {label}
      <textarea
        aria-label={label === 'Note' ? 'Note text' : label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  ),
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

  it('keeps timestamp editing available without a completion banner and reveals actions on expansion', async () => {
    const user = userEvent.setup();
    render(
      <NodeEditForm node={{ ...node, checkpoints: [{ ...node.checkpoints[0], checkpointKey: 'acceleration' }] }} />
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.queryByText('All checkpoint groups have timestamps')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign timestamps' })).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Checkpoint 1 at 1:30' });
    if (toggle.getAttribute('aria-expanded') === 'true') await user.click(toggle);
    expect(toggle).toHaveTextContent('acceleration');
    expect(toggle).toHaveTextContent('1:30');
    expect(toggle).toHaveTextContent('2 items');
    expect(screen.queryByRole('button', { name: 'Remove checkpoint' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Seek to time' })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Remove checkpoint' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seek to time' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit timestamps' }));
    expect(screen.getByRole('heading', { name: 'Assign checkpoint timestamps' })).toBeInTheDocument();
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
  it('saves directly from the quiz-bank command without visiting Review', async () => {
    const user = userEvent.setup();
    render(<NodeEditForm node={node} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: /Quiz question bank/ })).toBeInTheDocument();

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
    expect(screen.getAllByTestId('markdown-preview').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByTestId('markdown-preview').some((preview) => preview.querySelector('.katex'))).toBe(true);
    expect(screen.getAllByText('Correct').length).toBeGreaterThanOrEqual(1);
  });

  it('renders each formatted QEV prompt and answer in the Review step', async () => {
    const user = userEvent.setup();
    const formattedNode = {
      ...node,
      checkpoints: [
        {
          ...node.checkpoints[0],
          questions: [
            {
              id: 'cq-formatted',
              prompt: '<u>Water</u> is H<sub>2</sub>O.',
              options: { type: 'multipleChoice', choices: ['x<sup>2</sup>', '**Two** atoms'] },
              correctIndices: [1],
            },
          ],
        },
      ],
    };
    render(<NodeEditForm node={formattedNode} />);

    await advanceToReview(user);
    const qevPreview = screen.getByTestId('qev-item-preview');
    expect(within(qevPreview).getByText('Water').tagName).toBe('U');
    expect(within(qevPreview).getByText('2', { selector: 'sub' })).toBeInTheDocument();
    expect(within(qevPreview).getByText('2', { selector: 'sup' })).toBeInTheDocument();
    expect(within(qevPreview).getByText('Two').tagName).toBe('STRONG');
    expect(within(qevPreview).getByText('Correct')).toBeInTheDocument();
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

  it('allows content authoring before the title is ready', async () => {
    const user = userEvent.setup();
    render(<NodeEditForm node={{ ...node, title: '' }} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Checkpoints (QEV)' })).toBeInTheDocument();
  });

  it('allows typing a time whose prefix is used by another checkpoint', async () => {
    const user = userEvent.setup();
    const first = node.checkpoints[0];
    render(
      <NodeEditForm
        node={{
          ...node,
          checkpoints: [
            { ...first, checkpointKey: 'intro', timeOffsetSeconds: null },
            {
              ...first,
              id: 'cp2',
              checkpointKey: 'other',
              timeOffsetSeconds: 1,
              questions: first.questions.map((q) => ({ ...q, id: `other-${q.id}` })),
            },
          ],
        }}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByLabelText('Checkpoint key')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Assign timestamps' }));
    await user.type(screen.getByLabelText('Time (mm:ss)'), '0:10');
    await user.click(screen.getByRole('button', { name: 'Assign time' }));
    await user.click(screen.getByRole('button', { name: 'Continue to checkpoint editor' }));
    expect(screen.getByRole('button', { name: 'Checkpoint 1 at 0:10' })).toBeInTheDocument();
  });

  it('reopens untimed groups, blocks publication, then saves placement with existing IDs', async () => {
    const user = userEvent.setup();
    render(
      <NodeEditForm
        node={{
          ...node,
          isDraft: true,
          checkpoints: node.checkpoints.map((c) => ({
            ...c,
            checkpointKey: 'intro',
            placementHint: 'After introduction',
            timeOffsetSeconds: null,
          })),
        }}
      />
    );
    await advanceToReview(user);
    await user.click(screen.getByRole('button', { name: 'Publish node' }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/Assign timestamps to all checkpoints/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /2.*Checkpoints/ }));
    await user.click(screen.getByRole('button', { name: 'Assign timestamps' }));
    expect(screen.getByText('After introduction')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Time (mm:ss)'), '0:45');
    await user.click(screen.getByRole('button', { name: 'Assign time' }));
    await user.click(screen.getByRole('button', { name: 'Continue to checkpoint editor' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Publish node' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.checkpoints[0]).toMatchObject({
      id: node.checkpoints[0].id,
      checkpointKey: 'intro',
      timeOffsetSeconds: 45,
    });
    expect(body.checkpoints[0].questions[0].id).toBe(node.checkpoints[0].questions[0].id);
  });

  it('offers to publish a completed draft', async () => {
    const user = userEvent.setup();
    render(<NodeEditForm node={{ ...node, isDraft: true }} />);

    await advanceToReview(user);
    expect(screen.getByRole('button', { name: 'Publish node' })).toBeInTheDocument();
  });
});

// The server echoes order from the request; client identities must survive later edits.
function savedResponse(checkpoints: typeof node.checkpoints, id = node.id) {
  return {
    id,
    checkpoints: checkpoints.map((checkpoint, sortOrder) => ({
      id: checkpoint.id,
      sortOrder,
      questions: checkpoint.questions.map((question, sortOrder) => ({ id: question.id, sortOrder })),
    })),
  };
}

function deferSave() {
  let resolve!: (response: { ok: boolean; json: () => Promise<unknown> }) => void;
  global.fetch = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    )
    .mockResolvedValue({ ok: true, json: async () => ({ id: node.id }) });
  return async (data: unknown, ok = true) => {
    await act(async () => resolve({ ok, json: async () => data }));
  };
}

function secondRequest() {
  return JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
}

describe('edits during a pending node save', () => {
  beforeEach(() => push.mockReset());
  afterEach(() => jest.restoreAllMocks());

  it('keeps the remaining checkpoint identity when an earlier checkpoint is removed', async () => {
    const user = userEvent.setup();
    const second = {
      ...node.checkpoints[0],
      id: 'cp-2',
      timeOffsetSeconds: 120,
      questions: [{ ...node.checkpoints[0].questions[0], id: 'cq-3', prompt: 'Second checkpoint' }],
    };
    const initial = { ...node, checkpoints: [node.checkpoints[0], second] };
    const finish = deferSave();
    render(<NodeEditForm node={initial} />);
    await advanceToReview(user);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await user.click(screen.getByRole('button', { name: /2.*Checkpoints/ }));
    await user.click(screen.getByRole('button', { name: 'Checkpoint 1 at 1:30' }));
    await user.click(screen.getByRole('button', { name: 'Remove checkpoint' }));
    await finish(savedResponse(initial.checkpoints));

    expect(screen.getByRole('status')).toHaveTextContent('Your newer changes are still unsaved');
    expect(screen.getByRole('heading', { name: 'Checkpoints (QEV)' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Changes saved' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save as draft' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(secondRequest().checkpoints).toEqual([
      expect.objectContaining({
        id: 'cp-2',
        questions: [expect.objectContaining({ id: 'cq-3', prompt: 'Second checkpoint' })],
      }),
    ]);
  });

  it('keeps question deletions and additions and does not redirect a draft with newer edits', async () => {
    const user = userEvent.setup();
    const finish = deferSave();
    render(<NodeEditForm node={node} />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Checkpoint 1 at 1:30' }));
    await user.click(screen.getByRole('button', { name: 'Save as draft' }));
    await user.click(screen.getByRole('button', { name: 'Remove question 1' }));
    await user.click(screen.getByRole('button', { name: '+ Add note' }));
    await user.type(screen.getByLabelText('Note text'), 'New note while saving');
    await finish(savedResponse(node.checkpoints));

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Your newer changes are still unsaved');
    expect(screen.getByLabelText('Note text')).toHaveValue('New note while saving');
    await user.click(screen.getByRole('button', { name: 'Save as draft' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const items = secondRequest().checkpoints[0].questions;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'cq-2', prompt: node.checkpoints[0].questions[1].prompt });
    expect(items[1]).toMatchObject({ prompt: 'New note while saving' });
    expect(items[1]).not.toHaveProperty('id');
    expect(push).toHaveBeenCalledWith('/instructor/nodes');
  });

  it('remembers newly created node and item IDs while retaining later edits', async () => {
    const user = userEvent.setup();
    const finish = deferSave();
    render(<NodeForm mode="create" />);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: /Add checkpoint manually/ }));
    await user.click(screen.getByRole('button', { name: 'Save as draft' }));
    await user.type(screen.getByLabelText(/Question prompt/), 'Edited after submission');
    await finish({
      id: 'created-node',
      checkpoints: [{ id: 'created-checkpoint', sortOrder: 0, questions: [{ id: 'created-question', sortOrder: 0 }] }],
    });

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Your newer changes are still unsaved');
    await user.click(screen.getByRole('button', { name: 'Save as draft' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect((global.fetch as jest.Mock).mock.calls[0][1].method).toBe('POST');
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('/api/instructor/nodes/created-node');
    expect((global.fetch as jest.Mock).mock.calls[1][1].method).toBe('PATCH');
    expect(secondRequest().checkpoints[0]).toMatchObject({
      id: 'created-checkpoint',
      questions: [{ id: 'created-question', prompt: 'Edited after submission' }],
    });
  });

  it('recognizes edits outside checkpoints when deciding whether publication is complete', async () => {
    const user = userEvent.setup();
    const finish = deferSave();
    render(<NodeEditForm node={node} />);
    await advanceToReview(user);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await user.click(screen.getByRole('button', { name: /3.*Quiz bank/ }));
    await user.type(screen.getByLabelText('Quiz question prompt 1'), ' revised');
    await finish(savedResponse(node.checkpoints));
    expect(screen.getByRole('status')).toHaveTextContent('Your newer changes are still unsaved');
    expect(screen.getByLabelText('Quiz question prompt 1')).toHaveValue('Quiz prompt revised');
    await user.click(screen.getByRole('button', { name: 'Mock save node command' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(secondRequest().quizQuestions[0].prompt).toBe('Quiz prompt revised');
    expect(screen.getByRole('heading', { name: 'Changes saved' })).toBeInTheDocument();
    expect(screen.queryByText(/Your newer changes are still unsaved/)).not.toBeInTheDocument();
  });

  it('leaves identities and newer edits intact when the request fails', async () => {
    const user = userEvent.setup();
    const finish = deferSave();
    render(<NodeEditForm node={node} />);
    await user.click(screen.getByRole('button', { name: 'Save as draft' }));
    await user.type(screen.getByLabelText(/Title/), ' revised');
    await finish({ error: 'Save rejected', checkpoints: [{ id: 'wrong-id', sortOrder: 0, questions: [] }] }, false);
    expect(screen.getByText('Save rejected')).toBeInTheDocument();
    expect(screen.queryByText(/Your newer changes are still unsaved/)).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save as draft' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(secondRequest().title).toBe('Existing node revised');
    expect(secondRequest().checkpoints[0].id).toBe('cp-1');
  });
});
