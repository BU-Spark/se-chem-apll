import { useState } from 'react';
import type { ComponentType } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionBankEditor from '../QuestionBankEditor';
import { makeChoice, makeMultipleChoiceQuestion, makeShortAnswerQuestion, type AuthoringQuestion } from '../types';

// MDXEditor is client-only and has its own focused integration tests. Keep
// these question-bank behavior tests synchronous with a controlled textbox.
jest.mock('../RichMarkdownEditor', () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
    contentEditableId,
    labelledBy,
    describedBy,
    invalid,
  }: {
    value: string;
    onChange: (value: string) => void;
    contentEditableId: string;
    labelledBy: string;
    describedBy?: string;
    invalid?: boolean;
  }) => (
    <textarea
      id={contentEditableId}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

// The grid is a view over editor state; mock it as a simple list that exposes
// the same row-click / selection events the real grid emits.
jest.mock('ag-grid-react', () => ({
  AgGridReact: ({
    rowData,
    columnDefs,
    onRowClicked,
    onSelectionChanged,
  }: {
    rowData: Array<{ id: string; prompt: string }>;
    columnDefs?: Array<{
      field?: string;
      cellRenderer?: ComponentType<{ data: { id: string; prompt: string }; value: string }>;
    }>;
    onRowClicked?: (event: { data: { id: string; prompt: string } }) => void;
    onSelectionChanged?: (event: { selectedNodes: Array<{ data: { id: string; prompt: string } }> }) => void;
  }) => {
    const PromptCell = columnDefs?.find((column) => column.field === 'prompt')?.cellRenderer;
    return (
      <div data-testid="ag-grid-mock">
        {rowData.map((row) => (
          <div key={row.id}>
            <input
              type="checkbox"
              aria-label={`Select ${row.prompt}`}
              onChange={(e) => onSelectionChanged?.({ selectedNodes: e.target.checked ? [{ data: row }] : [] })}
            />
            <button type="button" onClick={() => onRowClicked?.({ data: row })}>
              {PromptCell ? <PromptCell data={row} value={row.prompt} /> : row.prompt}
            </button>
          </div>
        ))}
      </div>
    );
  },
}));

jest.mock('ag-grid-community', () => ({
  AllCommunityModule: {},
  ModuleRegistry: { registerModules: jest.fn() },
  themeQuartz: {},
}));

jest.mock('../CsvImportDialog', () => ({
  __esModule: true,
  default: ({
    onImport,
    onClose,
  }: {
    onImport: (qs: AuthoringQuestion[], mode: 'append' | 'replace') => void;
    onClose: () => void;
  }) => (
    <div data-testid="csv-import-dialog">
      <button
        type="button"
        onClick={() =>
          onImport([{ ...makeMultipleChoiceQuestion('imported-1'), prompt: 'Imported question' }], 'append')
        }
      >
        Mock import
      </button>
      <button type="button" onClick={onClose}>
        Mock close
      </button>
    </div>
  ),
}));

function Harness({ initial = [] }: { initial?: AuthoringQuestion[] }) {
  const [questions, setQuestions] = useState<AuthoringQuestion[]>(initial);
  return (
    <div>
      <QuestionBankEditor questions={questions} onChange={setQuestions} />
      <output data-testid="harness-state">{JSON.stringify(questions)}</output>
    </div>
  );
}

function harnessQuestions(): AuthoringQuestion[] {
  return JSON.parse(screen.getByTestId('harness-state').textContent ?? '[]');
}

function validMcQuestion(id: string, prompt: string): AuthoringQuestion {
  return {
    ...makeMultipleChoiceQuestion(id),
    prompt,
    choices: [makeChoice('A', true, `${id}-c1`), makeChoice('B', false, `${id}-c2`)],
  };
}

describe('QuestionBankEditor', () => {
  it('opens an uncommitted blank question when the bank is empty', async () => {
    render(<Harness />);
    expect(screen.getByText('No questions yet.')).toBeInTheDocument();
    expect(screen.getByText('New question')).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: /Question prompt/ })).toHaveValue('');
    expect(harnessQuestions()).toEqual([]);
    expect(screen.queryByText(/errors/)).not.toBeInTheDocument();
  });

  it('adds the blank question to the bank on the first edit', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(await screen.findByRole('textbox', { name: /Question prompt/ }), 'Started typing');

    expect(harnessQuestions()).toHaveLength(1);
    expect(harnessQuestions()[0].prompt).toBe('Started typing');
    expect(screen.queryByText('New question')).not.toBeInTheDocument();
  });

  it('adds a question via the toolbar and edits it in the detail pane', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '+ Multiple choice' }));
    // New questions are immediately active in the detail editor.
    const promptEditor = await screen.findByRole('textbox', { name: /Question prompt/ });
    await user.type(promptEditor, 'What is $K_a$?');

    let questions = harnessQuestions();
    expect(questions).toHaveLength(1);
    expect(questions[0].prompt).toBe('What is $K_a$?');
    expect(questions[0].type).toBe('multipleChoice');

    // Fill in both choices and mark the first correct.
    // (fireEvent.change: user.type would parse the LaTeX braces as key descriptors.)
    fireEvent.change(screen.getByLabelText('Choice 1'), { target: { value: '$1.8 \\times 10^{-5}$' } });
    fireEvent.change(screen.getByLabelText('Choice 2'), { target: { value: '$1.8 \\times 10^{-4}$' } });
    await user.click(screen.getByLabelText('Choice 1 is correct'));

    questions = harnessQuestions();
    expect(questions[0].type).toBe('multipleChoice');
    if (questions[0].type === 'multipleChoice') {
      expect(questions[0].choices.map((c) => c.content)).toEqual(['$1.8 \\times 10^{-5}$', '$1.8 \\times 10^{-4}$']);
      expect(questions[0].choices.map((c) => c.correct)).toEqual([true, false]);
    }
  });

  it('adds and configures a short-answer question', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '+ Short answer' }));
    await user.type(await screen.findByRole('textbox', { name: /Question prompt/ }), 'Square root of 16?');
    await user.click(screen.getByRole('button', { name: 'Answer range' }));
    await user.type(screen.getByLabelText('Minimum answer'), '3.9');
    await user.type(screen.getByLabelText('Maximum answer'), '4.1');

    const questions = harnessQuestions();
    expect(questions[0]).toMatchObject({
      type: 'shortAnswer',
      prompt: 'Square root of 16?',
      answer: { mode: 'range', minimum: '3.9', maximum: '4.1' },
    });
  });

  it('keeps per-type content when switching question types', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'Switchable')]} />);

    await user.click(screen.getByRole('button', { name: 'Switchable' }));
    await user.selectOptions(screen.getByLabelText('Question type'), 'shortAnswer');
    expect(harnessQuestions()[0].type).toBe('shortAnswer');

    // Switching back restores the original choices instead of resetting them.
    await user.selectOptions(screen.getByLabelText('Question type'), 'multipleChoice');
    const restored = harnessQuestions()[0];
    expect(restored.type).toBe('multipleChoice');
    if (restored.type === 'multipleChoice') {
      expect(restored.choices.map((c) => c.content)).toEqual(['A', 'B']);
    }
  });

  it('uses one editor mode for the prompt and every choice and keeps it between questions', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'First'), validMcQuestion('q2', 'Second')]} />);

    await user.click(screen.getByRole('button', { name: 'First' }));
    const editorMode = screen.getByRole('group', { name: 'Editor mode' });
    expect(screen.getAllByRole('button', { name: 'Visual' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Markdown' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Preview' })).toHaveLength(1);

    await user.click(within(editorMode).getByRole('button', { name: 'Markdown' }));
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('First');
    expect(screen.getByRole('textbox', { name: 'Choice 1' })).toHaveValue('A');
    expect(screen.getByRole('textbox', { name: 'Choice 2' })).toHaveValue('B');

    await user.click(screen.getByRole('button', { name: 'Second' }));
    const nextEditorMode = screen.getByRole('group', { name: 'Editor mode' });
    expect(within(nextEditorMode).getByRole('button', { name: 'Markdown' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('Second');
    expect(screen.getByRole('textbox', { name: 'Choice 1' })).toHaveValue('A');
    expect(screen.getByRole('textbox', { name: 'Choice 2' })).toHaveValue('B');
  });

  it('previews the prompt and every choice with the shared editor mode', async () => {
    const user = userEvent.setup();
    const question = validMcQuestion('q1', '**Question** with $K_a$');
    render(<Harness initial={[question]} />);

    const promptSummary = within(screen.getByTestId('ag-grid-mock')).getByText('Question');
    await user.click(promptSummary.closest('button')!);
    await user.click(within(screen.getByLabelText('Editor mode')).getByText('Preview'));

    const detail = screen.getByLabelText('Question editor');
    expect(within(detail).getAllByTestId('markdown-preview')).toHaveLength(3);
    expect(within(detail).getByText('Question')).toHaveStyle({ fontWeight: 'bold' });
    expect(
      within(detail)
        .getByLabelText(/Question prompt/)
        .querySelector('.katex')
    ).not.toBeNull();
    expect(within(detail).getByLabelText('Choice 1')).toHaveTextContent('A');
    expect(within(detail).getByLabelText('Choice 2')).toHaveTextContent('B');
  });

  it('shows issue counts in the status bar for incomplete questions', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '+ Multiple choice' }));
    expect(screen.getByText(/1 question/)).toBeInTheDocument();
    // A fresh MC draft has prompt/choice/correct errors; shown in detail + status bar.
    expect(screen.getAllByText(/errors/).length).toBeGreaterThan(0);
  });

  it('filters questions by search text', async () => {
    const user = userEvent.setup();
    render(
      <Harness initial={[validMcQuestion('q1', 'Acid dissociation'), validMcQuestion('q2', 'Buffer capacity')]} />
    );
    const grid = screen.getByTestId('ag-grid-mock');
    expect(within(grid).getByText('Acid dissociation')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search questions'), 'buffer');
    expect(within(grid).queryByText('Acid dissociation')).not.toBeInTheDocument();
    expect(within(grid).getByText('Buffer capacity')).toBeInTheDocument();
  });

  it('renders formatted question summaries instead of raw Markdown source', () => {
    render(<Harness initial={[validMcQuestion('q1', '**Question.** What is $K_a$?&#x20;')]} />);

    const grid = screen.getByTestId('ag-grid-mock');
    expect(within(grid).getByText('Question.')).toHaveStyle({ fontWeight: 'bold' });
    expect(grid).not.toHaveTextContent('**Question.**');
    expect(grid).not.toHaveTextContent('&#x20;');
    expect(grid.querySelector('.katex')).not.toBeNull();
  });

  it('duplicates the active question from the detail pane', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'Original')]} />);

    await user.click(screen.getByRole('button', { name: 'Original' }));
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));

    const questions = harnessQuestions();
    expect(questions).toHaveLength(2);
    expect(questions[0].prompt).toBe('Original');
    expect(questions[1].prompt).toBe('Original');
    expect(questions[0].id).not.toBe(questions[1].id);
    if (questions[1].type === 'multipleChoice') {
      expect(questions[1].choices.map((c) => c.content)).toEqual(['A', 'B']);
    }
  });

  it('bulk-deletes selected questions', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'First'), validMcQuestion('q2', 'Second')]} />);

    await user.click(screen.getByLabelText('Select Second'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const questions = harnessQuestions();
    expect(questions).toHaveLength(1);
    expect(questions[0].prompt).toBe('First');
  });

  it('moves questions with Alt+Arrow keys', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'First'), validMcQuestion('q2', 'Second')]} />);

    await user.click(screen.getByRole('button', { name: 'Second' }));
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');

    const questions = harnessQuestions();
    expect(questions.map((q) => q.prompt)).toEqual(['Second', 'First']);
  });

  it('adds a new question with the N shortcut matching the active type', async () => {
    const user = userEvent.setup();
    const sa = {
      ...makeShortAnswerQuestion('q1'),
      prompt: 'Existing',
      answer: { mode: 'exact' as const, expected: '1' },
    };
    render(<Harness initial={[sa]} />);

    await user.click(screen.getByRole('button', { name: 'Existing' }));
    await user.keyboard('n');

    const questions = harnessQuestions();
    expect(questions).toHaveLength(2);
    expect(questions[1].type).toBe('shortAnswer');
  });

  it('imports questions through the dialog in append mode', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'Existing')]} />);

    await user.click(screen.getByRole('button', { name: 'Import CSV' }));
    await user.click(screen.getByRole('button', { name: 'Mock import' }));

    const questions = harnessQuestions();
    expect(questions).toHaveLength(2);
    expect(questions[1].prompt).toBe('Imported question');
  });
});
