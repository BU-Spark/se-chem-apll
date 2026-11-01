export type QuestionBankCommandId =
  | 'open-commands'
  | 'new-question'
  | 'new-multiple-choice'
  | 'new-short-answer'
  | 'duplicate-questions'
  | 'delete-questions'
  | 'move-question-up'
  | 'move-question-down'
  | 'import-csv'
  | 'export-csv'
  | 'save-node'
  | 'help-inline-math'
  | 'help-display-math'
  | 'help-scripts'
  | 'help-fraction'
  | 'help-chemical-formula'
  | 'help-chemical-reaction';

export type CommandAvailability =
  | 'always'
  | 'question-target'
  | 'active-question'
  | 'move-up'
  | 'move-down'
  | 'has-questions';

export type CommandShortcut = {
  key: string;
  display: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export type QuestionBankCommand = {
  id: QuestionBankCommandId;
  kind: 'action' | 'reference';
  title: string;
  description: string;
  group: 'Questions' | 'Arrange' | 'Data' | 'Form' | 'Help & formatting';
  availability: CommandAvailability;
  shortcuts?: CommandShortcut[];
  allowInTextEditor?: boolean;
  showInPalette?: boolean;
  showInStatusBar?: boolean;
  statusText?: string;
  searchTerms?: string[];
  example?: string;
};

export const QUESTION_BANK_COMMANDS: readonly QuestionBankCommand[] = [
  {
    id: 'open-commands',
    kind: 'action',
    title: 'Open commands and formatting help',
    description: 'Browse question-bank commands, shortcuts, LaTeX, and chemistry notation.',
    group: 'Form',
    availability: 'always',
    shortcuts: [{ key: 'p', mod: true, shift: true, display: '⌘/Ctrl+Shift+P' }],
    allowInTextEditor: true,
    showInPalette: false,
    showInStatusBar: true,
    statusText: 'commands',
  },
  {
    id: 'new-question',
    kind: 'action',
    title: 'New question using current type',
    description: 'Insert a question after the active question using its answer type.',
    group: 'Questions',
    availability: 'always',
    shortcuts: [{ key: 'n', display: 'N' }],
    showInPalette: true,
    showInStatusBar: true,
    statusText: 'new',
  },
  {
    id: 'new-multiple-choice',
    kind: 'action',
    title: 'New multiple-choice question',
    description: 'Insert a new multiple-choice question after the active question.',
    group: 'Questions',
    availability: 'always',
    showInPalette: true,
  },
  {
    id: 'new-short-answer',
    kind: 'action',
    title: 'New numeric short-answer question',
    description: 'Insert a new numeric short-answer question after the active question.',
    group: 'Questions',
    availability: 'always',
    showInPalette: true,
  },
  {
    id: 'duplicate-questions',
    kind: 'action',
    title: 'Duplicate selected questions or active question',
    description: 'Duplicate a multi-row selection, or the active question when one row is selected.',
    group: 'Questions',
    availability: 'question-target',
    shortcuts: [{ key: 'd', mod: true, display: '⌘/Ctrl+D' }],
    showInPalette: true,
    showInStatusBar: true,
    statusText: 'duplicate',
  },
  {
    id: 'delete-questions',
    kind: 'action',
    title: 'Delete selected questions or active question',
    description: 'Delete a multi-row selection, or the active question when one row is selected.',
    group: 'Questions',
    availability: 'question-target',
    shortcuts: [
      { key: 'Delete', display: 'Delete' },
      { key: 'Backspace', display: 'Backspace' },
    ],
    showInPalette: true,
    showInStatusBar: true,
    statusText: 'delete',
  },
  {
    id: 'move-question-up',
    kind: 'action',
    title: 'Move active question up',
    description: 'Move the active question one position earlier in the bank.',
    group: 'Arrange',
    availability: 'move-up',
    shortcuts: [{ key: 'ArrowUp', alt: true, display: 'Alt+↑' }],
    showInPalette: true,
    showInStatusBar: true,
    statusText: 'move up',
  },
  {
    id: 'move-question-down',
    kind: 'action',
    title: 'Move active question down',
    description: 'Move the active question one position later in the bank.',
    group: 'Arrange',
    availability: 'move-down',
    shortcuts: [{ key: 'ArrowDown', alt: true, display: 'Alt+↓' }],
    showInPalette: true,
    showInStatusBar: true,
    statusText: 'move down',
  },
  {
    id: 'import-csv',
    kind: 'action',
    title: 'Import questions from CSV',
    description: 'Open the staged CSV import workflow.',
    group: 'Data',
    availability: 'always',
    showInPalette: true,
  },
  {
    id: 'export-csv',
    kind: 'action',
    title: 'Export question bank as CSV',
    description: 'Download every question in the bank as a CSV file.',
    group: 'Data',
    availability: 'has-questions',
    showInPalette: true,
  },
  {
    id: 'save-node',
    kind: 'action',
    title: 'Save node',
    description: 'Submit the current node form.',
    group: 'Form',
    availability: 'always',
    shortcuts: [{ key: 's', mod: true, display: '⌘/Ctrl+S' }],
    allowInTextEditor: true,
    showInPalette: true,
    showInStatusBar: true,
    statusText: 'save',
  },
  {
    id: 'help-inline-math',
    kind: 'reference',
    title: 'Inline LaTeX math',
    description: 'Place LaTeX between single dollar signs to keep math within a sentence.',
    group: 'Help & formatting',
    availability: 'always',
    showInPalette: true,
    searchTerms: ['latex', 'math', 'equation', 'inline'],
    example: 'The value is $K_a = 1.8 \\times 10^{-5}$.',
  },
  {
    id: 'help-display-math',
    kind: 'reference',
    title: 'Display LaTeX math',
    description: 'Place LaTeX between double dollar signs to render it as a separate block.',
    group: 'Help & formatting',
    availability: 'always',
    showInPalette: true,
    searchTerms: ['latex', 'math', 'equation', 'display', 'block'],
    example: '$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$',
  },
  {
    id: 'help-scripts',
    kind: 'reference',
    title: 'Subscripts and superscripts',
    description: 'Use an underscore for subscripts and a caret for superscripts; group multiple characters in braces.',
    group: 'Help & formatting',
    availability: 'always',
    showInPalette: true,
    searchTerms: ['latex', 'math', 'subscript', 'superscript', 'power', 'exponent'],
    example: '$x_1 + x_{total} + y^2 + y^{n+1}$',
  },
  {
    id: 'help-fraction',
    kind: 'reference',
    title: 'LaTeX fractions',
    description: 'Put the numerator and denominator in separate brace groups.',
    group: 'Help & formatting',
    availability: 'always',
    showInPalette: true,
    searchTerms: ['latex', 'math', 'fraction', 'divide'],
    example: '$\\frac{moles}{liters}$',
  },
  {
    id: 'help-chemical-formula',
    kind: 'reference',
    title: 'Chemical formulas with mhchem',
    description: 'Use the mhchem ce command for formulas, charges, and stoichiometric notation.',
    group: 'Help & formatting',
    availability: 'always',
    showInPalette: true,
    searchTerms: ['chemtex', 'chemistry', 'chemical', 'mhchem', 'formula', 'latex'],
    example: '$\\ce{H2SO4 + 2NaOH}$',
  },
  {
    id: 'help-chemical-reaction',
    kind: 'reference',
    title: 'Chemical reactions with mhchem',
    description: 'Write balanced reactions and arrows inside the mhchem ce command.',
    group: 'Help & formatting',
    availability: 'always',
    showInPalette: true,
    searchTerms: ['chemtex', 'chemistry', 'chemical', 'mhchem', 'reaction', 'arrow', 'latex'],
    example: '$\\ce{2H2 + O2 -> 2H2O}$',
  },
] as const;

export function matchesCommandShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  command: QuestionBankCommand
): boolean {
  return Boolean(
    command.shortcuts?.some((shortcut) => {
      const mod = event.metaKey || event.ctrlKey;
      return (
        event.key.toLowerCase() === shortcut.key.toLowerCase() &&
        mod === Boolean(shortcut.mod) &&
        event.shiftKey === Boolean(shortcut.shift) &&
        event.altKey === Boolean(shortcut.alt)
      );
    })
  );
}

export function commandById(id: QuestionBankCommandId): QuestionBankCommand {
  const command = QUESTION_BANK_COMMANDS.find((item) => item.id === id);
  if (!command) throw new Error(`Unknown question-bank command: ${id}`);
  return command;
}

export function commandShortcutLabel(command: QuestionBankCommand): string | null {
  if (!command.shortcuts || command.shortcuts.length === 0) return null;
  return command.shortcuts.map((shortcut) => shortcut.display).join(' / ');
}
