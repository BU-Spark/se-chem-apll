import { useState } from 'react';
import type { ComponentType } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionBankEditor from '../QuestionBankEditor';
import { QUESTION_BANK_COMMANDS, commandShortcutLabel } from '../commands';
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
    rowSelection,
    onRowClicked,
    onSelectionChanged,
    onGridReady,
    onGridPreDestroyed,
    onRowDataUpdated,
  }: {
    rowData: Array<{ id: string; prompt: string }>;
    columnDefs?: Array<{
      field?: string;
      cellRenderer?: ComponentType<{ data: { id: string; prompt: string }; value: string }>;
    }>;
    rowSelection?: {
      mode: string;
      checkboxes: boolean;
      headerCheckbox: boolean;
      enableClickSelection: boolean;
      enableSelectionWithoutKeys: boolean;
    };
    onRowClicked?: (event: { data: { id: string; prompt: string }; node: { isSelected: () => boolean } }) => void;
    onSelectionChanged?: (event: {
      selectedNodes: Array<{ data: { id: string; prompt: string } }>;
      source: 'rowClicked' | 'rowDataChanged';
    }) => void;
    onGridReady?: (event: { api: unknown }) => void;
    onGridPreDestroyed?: () => void;
    onRowDataUpdated?: (event: { api: unknown }) => void;
  }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const PromptCell = columnDefs?.find((column) => column.field === 'prompt')?.cellRenderer;
    const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
    const selectedIdsRef = React.useRef<string[]>([]);
    const rowDataRef = React.useRef(rowData);
    const callbacksRef = React.useRef({ onSelectionChanged, onGridReady, onGridPreDestroyed, onRowDataUpdated });
    const selectionAnchor = React.useRef<number | null>(null);
    const apiRef = React.useRef<{
      deselectAll: () => void;
      getRowNode: (id: string) => { data: { id: string; prompt: string }; isSelected: () => boolean } | undefined;
      setNodesSelected: (params: { nodes: Array<{ data: { id: string; prompt: string } }>; newValue: boolean }) => void;
    } | null>(null);

    rowDataRef.current = rowData;
    callbacksRef.current = { onSelectionChanged, onGridReady, onGridPreDestroyed, onRowDataUpdated };

    function setSelection(nextIds: string[]) {
      selectedIdsRef.current = nextIds;
      setSelectedIds(nextIds);
    }

    function rowNode(id: string) {
      const data = rowDataRef.current.find((row) => row.id === id);
      if (!data) return undefined;
      return { data, isSelected: () => selectedIdsRef.current.includes(id) };
    }

    if (!apiRef.current) {
      apiRef.current = {
        deselectAll: () => setSelection([]),
        getRowNode: rowNode,
        setNodesSelected: ({ nodes, newValue }) => {
          setSelection(newValue ? nodes.map((node) => node.data.id) : []);
        },
      };
    }

    React.useEffect(() => {
      callbacksRef.current.onGridReady?.({ api: apiRef.current });
      return () => callbacksRef.current.onGridPreDestroyed?.();
    }, []);

    React.useEffect(() => {
      const visibleIds = new Set(rowData.map((row) => row.id));
      const survivingIds = selectedIdsRef.current.filter((id) => visibleIds.has(id));
      if (survivingIds.length !== selectedIdsRef.current.length) {
        setSelection(survivingIds);
        callbacksRef.current.onSelectionChanged?.({
          selectedNodes: survivingIds.map((id) => ({ data: rowData.find((row) => row.id === id)! })),
          source: 'rowDataChanged',
        });
      }
      callbacksRef.current.onRowDataUpdated?.({ api: apiRef.current });
    }, [rowData]);

    function selectRow(event: React.MouseEvent, row: { id: string; prompt: string }, index: number) {
      let nextIds: string[];
      if (event.shiftKey && selectionAnchor.current !== null) {
        const start = Math.min(selectionAnchor.current, index);
        const end = Math.max(selectionAnchor.current, index);
        nextIds = rowData.slice(start, end + 1).map((item) => item.id);
      } else if (event.metaKey || event.ctrlKey) {
        nextIds = selectedIds.includes(row.id) ? selectedIds.filter((id) => id !== row.id) : [...selectedIds, row.id];
        selectionAnchor.current = index;
      } else {
        nextIds = [row.id];
        selectionAnchor.current = index;
      }

      setSelection(nextIds);
      onSelectionChanged?.({
        selectedNodes: nextIds
          .map((id) => rowData.find((item) => item.id === id))
          .filter((item): item is { id: string; prompt: string } => Boolean(item))
          .map((data) => ({ data })),
        source: 'rowClicked',
      });
      onRowClicked?.({ data: row, node: { isSelected: () => nextIds.includes(row.id) } });
    }

    return (
      <div
        data-testid="ag-grid-mock"
        data-selection-mode={rowSelection?.mode}
        data-checkboxes={String(rowSelection?.checkboxes)}
        data-header-checkbox={String(rowSelection?.headerCheckbox)}
        data-click-selection={String(rowSelection?.enableClickSelection)}
      >
        {rowData.map((row, index) => (
          <div key={row.id}>
            <button
              type="button"
              aria-pressed={selectedIds.includes(row.id)}
              onClick={(event) => selectRow(event, row, index)}
            >
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

function Harness({ initial = [], onSave = jest.fn() }: { initial?: AuthoringQuestion[]; onSave?: jest.Mock }) {
  const [questions, setQuestions] = useState<AuthoringQuestion[]>(initial);
  return (
    <div>
      <QuestionBankEditor questions={questions} onChange={setQuestions} onSave={onSave} />
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

  it('uses one visual authoring surface without an editor mode selector', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'First'), validMcQuestion('q2', 'Second')]} />);

    await user.click(screen.getByRole('button', { name: 'First' }));
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('First');
    expect(screen.getByRole('textbox', { name: 'Choice 1' })).toHaveValue('A');
    expect(screen.getByRole('textbox', { name: 'Choice 2' })).toHaveValue('B');
    expect(screen.queryByRole('group', { name: 'Editor mode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Markdown' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
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

  it('keeps the active question open when a filter hides its row', async () => {
    const user = userEvent.setup();
    render(
      <Harness initial={[validMcQuestion('q1', 'Acid dissociation'), validMcQuestion('q2', 'Buffer capacity')]} />
    );

    await user.click(screen.getByRole('button', { name: 'Acid dissociation' }));
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('Acid dissociation');

    await user.type(screen.getByLabelText('Search questions'), 'buffer');

    expect(screen.queryByRole('button', { name: 'Acid dissociation' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('Acid dissociation');
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

  it('uses click selection without rendering row or header checkboxes', () => {
    render(<Harness initial={[validMcQuestion('q1', 'First'), validMcQuestion('q2', 'Second')]} />);

    const grid = screen.getByTestId('ag-grid-mock');
    expect(grid).toHaveAttribute('data-selection-mode', 'multiRow');
    expect(grid).toHaveAttribute('data-checkboxes', 'false');
    expect(grid).toHaveAttribute('data-header-checkbox', 'false');
    expect(grid).toHaveAttribute('data-click-selection', 'true');
    expect(within(grid).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('⌘/Ctrl-click')).toBeInTheDocument();
    expect(screen.getByText('Shift-click')).toBeInTheDocument();
  });

  it('opens and selects a row with a normal click', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'First'), validMcQuestion('q2', 'Second')]} />);

    const second = screen.getByRole('button', { name: 'Second' });
    await user.click(second);

    expect(second).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('Second');
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
  });

  it('supports modifier-click multi-selection and bulk deletion', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[validMcQuestion('q1', 'First'), validMcQuestion('q2', 'Second'), validMcQuestion('q3', 'Third')]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Second' }));
    fireEvent.click(screen.getByRole('button', { name: 'Third' }), { ctrlKey: true });
    const bulkBar = screen.getByText('2 selected').closest('[role="status"]');
    expect(bulkBar).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('Third');
    await user.click(within(bulkBar as HTMLElement).getByRole('button', { name: 'Delete' }));

    expect(harnessQuestions().map((question) => question.prompt)).toEqual(['First']);
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('First');
  });

  it('bulk-duplicates selected rows and returns to one active question', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'First'), validMcQuestion('q2', 'Second')]} />);

    await user.click(screen.getByRole('button', { name: 'First' }));
    fireEvent.click(screen.getByRole('button', { name: 'Second' }), { ctrlKey: true });
    const bulkBar = screen.getByText('2 selected').closest('[role="status"]');
    await user.click(within(bulkBar as HTMLElement).getByRole('button', { name: 'Duplicate' }));

    expect(harnessQuestions().map((question) => question.prompt)).toEqual(['First', 'First', 'Second', 'Second']);
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('First');
  });

  it('makes a newly created question the sole active selection', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'First'), validMcQuestion('q2', 'Second')]} />);

    await user.click(screen.getByRole('button', { name: 'First' }));
    fireEvent.click(screen.getByRole('button', { name: 'Second' }), { ctrlKey: true });
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+ Short answer' }));
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Question type')).toHaveValue('shortAnswer');
    expect(harnessQuestions()).toHaveLength(3);
  });

  it('supports Shift-click range selection', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[validMcQuestion('q1', 'First'), validMcQuestion('q2', 'Second'), validMcQuestion('q3', 'Third')]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'First' }));
    fireEvent.click(screen.getByRole('button', { name: 'Third' }), { shiftKey: true });

    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('Third');
  });

  it('moves the active editor to a remaining row when the active row is deselected', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'First'), validMcQuestion('q2', 'Second')]} />);

    await user.click(screen.getByRole('button', { name: 'First' }));
    fireEvent.click(screen.getByRole('button', { name: 'Second' }), { ctrlKey: true });
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('Second');

    fireEvent.click(screen.getByRole('button', { name: 'Second' }), { ctrlKey: true });
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('First');
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
  });

  it.each(['{Delete}', '{Backspace}'])('deletes the multi-row selection with %s from grid focus', async (key) => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[validMcQuestion('q1', 'First'), validMcQuestion('q2', 'Second'), validMcQuestion('q3', 'Third')]}
      />
    );

    const second = screen.getByRole('button', { name: 'Second' });
    await user.click(second);
    fireEvent.click(screen.getByRole('button', { name: 'Third' }), { ctrlKey: true });
    second.focus();
    await user.keyboard(key);

    expect(harnessQuestions().map((question) => question.prompt)).toEqual(['First']);
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('First');
  });

  it('deletes the active question when no rows are selected', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'First'), validMcQuestion('q2', 'Second')]} />);

    await user.click(screen.getByRole('button', { name: 'Second' }));
    await user.keyboard('{Delete}');

    expect(harnessQuestions().map((question) => question.prompt)).toEqual(['First']);
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('First');
  });

  it('preserves questions when Delete or Backspace is used while typing', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'First')]} />);

    await user.click(screen.getByRole('button', { name: 'First' }));
    const prompt = screen.getByRole('textbox', { name: /Question prompt/ });
    await user.click(prompt);
    await user.keyboard('{End}{Backspace}');

    expect(harnessQuestions()).toHaveLength(1);
    expect(harnessQuestions()[0].prompt).toBe('Firs');
  });

  it.each(['Delete', 'Backspace'])('does not delete a question with %s from non-text form controls', async (key) => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'First')]} />);

    await user.click(screen.getByRole('button', { name: 'First' }));
    const correctAnswer = screen.getByLabelText('Choice 1 is correct');
    correctAnswer.focus();
    fireEvent.keyDown(correctAnswer, { key });

    expect(harnessQuestions()).toHaveLength(1);
    expect(harnessQuestions()[0].prompt).toBe('First');

    const questionType = screen.getByLabelText('Question type');
    questionType.focus();
    fireEvent.keyDown(questionType, { key });
    expect(harnessQuestions()).toHaveLength(1);
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

  it('opens the command palette from editor focus and restores focus on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'First')]} />);

    await user.click(screen.getByRole('button', { name: 'First' }));
    const prompt = screen.getByRole('textbox', { name: /Question prompt/ });
    prompt.focus();
    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');

    expect(screen.getByRole('dialog', { name: 'Commands and formatting help' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Search commands and formatting help' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Commands and formatting help' })).not.toBeInTheDocument();
    expect(prompt).toHaveFocus();
  });

  it.each([
    ['Control', { ctrlKey: true }],
    ['Command', { metaKey: true }],
  ])('opens the command palette with %s+Shift+P when focus is outside the editor', (_, modifier) => {
    render(
      <>
        <button type="button">Outside editor</button>
        <Harness initial={[validMcQuestion('q1', 'First')]} />
      </>
    );

    const outsideButton = screen.getByRole('button', { name: 'Outside editor' });
    outsideButton.focus();
    fireEvent.keyDown(outsideButton, { key: 'p', shiftKey: true, ...modifier });

    expect(screen.getByRole('dialog', { name: 'Commands and formatting help' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Search commands and formatting help' })).toHaveFocus();
  });

  it('runs the real save callback from both the shortcut and command palette', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    render(<Harness initial={[validMcQuestion('q1', 'First')]} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'First' }));
    const prompt = screen.getByRole('textbox', { name: /Question prompt/ });
    prompt.focus();
    await user.keyboard('{Control>}s{/Control}');
    expect(onSave).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Commands' }));
    await user.click(screen.getByRole('option', { name: /^Save node/ }));
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('connects palette navigation to the visible active option', async () => {
    const user = userEvent.setup();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      render(<Harness initial={[validMcQuestion('q1', 'First')]} />);
      await user.click(screen.getByRole('button', { name: 'Commands' }));
      const search = screen.getByRole('combobox', { name: 'Search commands and formatting help' });
      const initialActiveId = search.getAttribute('aria-activedescendant');

      expect(search).toHaveAttribute('aria-controls', 'question-command-results');
      expect(search).toHaveAttribute('aria-expanded', 'true');
      expect(initialActiveId).toBeTruthy();
      expect(document.getElementById(initialActiveId!)).toHaveAttribute('role', 'option');

      scrollIntoView.mockClear();
      await user.keyboard('{ArrowDown}');

      const nextActiveId = search.getAttribute('aria-activedescendant');
      expect(nextActiveId).not.toBe(initialActiveId);
      expect(document.getElementById(nextActiveId!)).toHaveAttribute('aria-selected', 'true');
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
          configurable: true,
          value: originalScrollIntoView,
        });
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
      }
    }
  });

  it('searches ChemTeX help, renders mhchem, and copies the example', async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<Harness initial={[validMcQuestion('q1', 'First')]} />);

    await user.click(screen.getByRole('button', { name: 'Commands' }));
    await user.type(screen.getByRole('combobox', { name: 'Search commands and formatting help' }), 'chemtex');
    await user.click(screen.getByRole('option', { name: /Chemical formulas with mhchem/ }));

    const dialog = screen.getByRole('dialog', { name: 'Commands and formatting help' });
    const preview = within(dialog).getByTestId('markdown-preview');
    expect(preview.querySelector('.katex')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Copy example' }));
    expect(writeText).toHaveBeenCalledWith('$\\ce{H2SO4 + 2NaOH}$');
    expect(screen.getByText('Example copied.')).toBeInTheDocument();
  });

  it('explains why unavailable palette commands cannot run', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Commands' }));
    const duplicate = screen.getByRole('option', { name: /Duplicate selected questions or active question/ });
    expect(duplicate).toHaveAttribute('aria-disabled', 'true');
    expect(duplicate).toHaveTextContent('Select or open a question first.');

    await user.click(duplicate);
    expect(screen.getByRole('dialog', { name: 'Commands and formatting help' })).toBeInTheDocument();
    expect(harnessQuestions()).toEqual([]);
  });

  it('builds the status-bar shortcut reference from the shared command registry', () => {
    render(<Harness initial={[validMcQuestion('q1', 'First')]} />);
    const status = within(screen.getByTestId('question-bank-status'));

    for (const command of QUESTION_BANK_COMMANDS.filter((item) => item.showInStatusBar)) {
      const shortcut = status.getByText(commandShortcutLabel(command) ?? '');
      expect(shortcut).toBeInTheDocument();
      expect(shortcut.closest('span')).toHaveTextContent(command.statusText ?? '');
    }
  });

  it('runs a filtered palette command with Enter', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'First')]} />);

    await user.click(screen.getByRole('button', { name: 'Commands' }));
    const search = screen.getByRole('combobox', { name: 'Search commands and formatting help' });
    await user.type(search, 'new numeric short-answer');
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('dialog', { name: 'Commands and formatting help' })).not.toBeInTheDocument();
    expect(harnessQuestions()).toHaveLength(2);
    expect(harnessQuestions()[1].type).toBe('shortAnswer');
  });

  it('does not let a filtered-out automatic selection steal focus later', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[validMcQuestion('q1', 'First')]} />);

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'valid');
    await user.click(screen.getByRole('button', { name: 'First' }));
    await user.click(screen.getByRole('button', { name: '+ Multiple choice' }));
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'First' }));
    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('First');
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'all');

    expect(screen.getByRole('textbox', { name: /Question prompt/ })).toHaveValue('First');
    expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-pressed', 'true');
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
