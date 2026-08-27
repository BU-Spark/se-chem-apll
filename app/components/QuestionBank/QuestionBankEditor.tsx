'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type ICellRendererParams,
  type RowDataUpdatedEvent,
  type RowClickedEvent,
  type SelectionChangedEvent,
} from 'ag-grid-community';
import { downloadCsvFile } from '@/app/utils/csv';
import { questionsToCsv } from '@/app/utils/questionBankCsv';
import CommandPalette, { type CommandPaletteItem } from './CommandPalette';
import CsvImportDialog from './CsvImportDialog';
import MarkdownPreview from './MarkdownPreview';
import QuestionDetailEditor from './QuestionDetailEditor';
import {
  QUESTION_BANK_COMMANDS,
  commandById,
  commandShortcutLabel,
  matchesCommandShortcut,
  type CommandAvailability,
  type QuestionBankCommandId,
} from './commands';
import { countIssuesBySeverity, validateQuestionBank } from './validation';
import { summarizeAnswer } from './adapters';
import {
  duplicateQuestion,
  makeMultipleChoiceQuestion,
  makeShortAnswerQuestion,
  type AuthoringQuestion,
  type MultipleChoiceQuestion,
  type ShortAnswerQuestion,
} from './types';
import styles from './QuestionBank.module.css';

ModuleRegistry.registerModules([AllCommunityModule]);

type Props = {
  questions: AuthoringQuestion[];
  onChange: (next: AuthoringQuestion[]) => void;
  onSave: () => void | Promise<void>;
  saving?: boolean;
};

/** Read-only view row for the browser grid. */
type BrowserRow = {
  id: string;
  type: AuthoringQuestion['type'];
  prompt: string;
  answer: string;
  hasError: boolean;
  hasWarning: boolean;
};

type TypeFilter = 'all' | AuthoringQuestion['type'];
type StatusFilter = 'all' | 'errors' | 'warnings' | 'valid';

const OPEN_COMMANDS_COMMAND = commandById('open-commands');

function matchesSearch(q: AuthoringQuestion, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === '') return true;
  if (q.prompt.toLowerCase().includes(needle)) return true;
  if (q.type === 'multipleChoice') {
    return q.choices.some((choice) => choice.content.toLowerCase().includes(needle));
  }
  if (q.answer.mode === 'exact') return q.answer.expected.includes(needle);
  return q.answer.minimum.includes(needle) || q.answer.maximum.includes(needle);
}

function StatusCell(params: ICellRendererParams<BrowserRow>) {
  const row = params.data;
  if (!row) return null;
  if (row.hasError)
    return <span className={styles.statusDotError} role="img" aria-label="Has errors" title="Has errors" />;
  if (row.hasWarning)
    return <span className={styles.statusDotWarning} role="img" aria-label="Has warnings" title="Has warnings" />;
  return <span className={styles.statusDotOk} role="img" aria-label="Valid" title="Valid" />;
}

/** Render stored Markdown without exposing its source syntax in the browser grid. */
function PromptCell(params: ICellRendererParams<BrowserRow, string>) {
  const prompt = params.value?.trim() ?? '';
  if (prompt === '') return <span className={styles.gridPromptEmpty}>(empty prompt)</span>;

  return (
    <div className={styles.gridPromptPreview}>
      <MarkdownPreview content={prompt} />
    </div>
  );
}

function isFormEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true;
  return Boolean(target.closest('input, textarea, select, [role="textbox"]'));
}

/**
 * Hybrid question-bank editor: a virtualized read-only browser for scanning,
 * filtering, and selecting, plus a focused detail editor for the active
 * question. Bulk operations work on multi-selected rows.
 */
export default function QuestionBankEditor({ questions, onChange, onSave, saving = false }: Props) {
  const gridApiRef = useRef<GridApi<BrowserRow> | null>(null);
  const pendingSingleSelectionRef = useRef<string | null | undefined>(undefined);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [emptyDraft, setEmptyDraft] = useState<AuthoringQuestion>(() => makeMultipleChoiceQuestion());
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Retains per-type data so switching types never destroys content.
  const typeStashRef = useRef(
    new Map<string, { multipleChoice?: MultipleChoiceQuestion; shortAnswer?: ShortAnswerQuestion }>()
  );

  const issuesByQuestion = useMemo(() => validateQuestionBank(questions), [questions]);
  const { errors: totalErrors, warnings: totalWarnings } = useMemo(
    () => countIssuesBySeverity(issuesByQuestion),
    [issuesByQuestion]
  );

  const visibleQuestions = useMemo(
    () =>
      questions.filter((q) => {
        if (typeFilter !== 'all' && q.type !== typeFilter) return false;
        const issues = issuesByQuestion.get(q.id) ?? [];
        const hasError = issues.some((issue) => issue.severity === 'error');
        if (statusFilter === 'errors' && !hasError) return false;
        if (statusFilter === 'warnings' && (hasError || issues.length === 0)) return false;
        if (statusFilter === 'valid' && issues.length > 0) return false;
        return matchesSearch(q, search);
      }),
    [questions, typeFilter, statusFilter, search, issuesByQuestion]
  );

  const rowData = useMemo<BrowserRow[]>(
    () =>
      visibleQuestions.map((q) => {
        const issues = issuesByQuestion.get(q.id) ?? [];
        return {
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          answer: summarizeAnswer(q),
          hasError: issues.some((issue) => issue.severity === 'error'),
          hasWarning: issues.some((issue) => issue.severity === 'warning'),
        };
      }),
    [visibleQuestions, issuesByQuestion]
  );

  const activeQuestion = questions.find((q) => q.id === activeId) ?? null;
  const activeIndex = activeQuestion ? questions.indexOf(activeQuestion) : -1;
  const draftQuestion = questions.length === 0 ? emptyDraft : null;
  const editableQuestion = activeQuestion ?? draftQuestion;
  const commandTargetIds = useMemo<ReadonlySet<string>>(() => {
    if (selectedIds.size > 1) return selectedIds;
    if (activeId) return new Set([activeId]);
    return selectedIds;
  }, [selectedIds, activeId]);

  const announce = useCallback((message: string) => setStatusMessage(message), []);

  const applySingleGridSelection = useCallback((api: GridApi<BrowserRow>, id: string | null) => {
    api.deselectAll();
    if (!id) return;
    const node = api.getRowNode(id);
    if (node) api.setNodesSelected({ nodes: [node], newValue: true, source: 'api' });
  }, []);

  const flushPendingSingleSelection = useCallback(
    (api: GridApi<BrowserRow>, discardIfMissing = false) => {
      const id = pendingSingleSelectionRef.current;
      if (id === undefined) return;
      if (id && !api.getRowNode(id)) {
        if (discardIfMissing) pendingSingleSelectionRef.current = undefined;
        return;
      }
      applySingleGridSelection(api, id);
      pendingSingleSelectionRef.current = undefined;
    },
    [applySingleGridSelection]
  );

  const selectSingleQuestion = useCallback(
    (id: string | null) => {
      setActiveId(id);
      setSelectedIds(id ? new Set([id]) : new Set());
      pendingSingleSelectionRef.current = id;
      const api = gridApiRef.current;
      if (api) flushPendingSingleSelection(api);
    },
    [flushPendingSingleSelection]
  );

  const addQuestion = useCallback(
    (type: AuthoringQuestion['type']) => {
      const question = type === 'multipleChoice' ? makeMultipleChoiceQuestion() : makeShortAnswerQuestion();
      const insertAt = activeIndex >= 0 ? activeIndex + 1 : questions.length;
      const next = [...questions.slice(0, insertAt), question, ...questions.slice(insertAt)];
      onChange(next);
      selectSingleQuestion(question.id);
      announce(`Added a new ${type === 'multipleChoice' ? 'multiple-choice' : 'short-answer'} question.`);
    },
    [questions, activeIndex, onChange, selectSingleQuestion, announce]
  );

  const deleteQuestions = useCallback(
    (ids: ReadonlySet<string>) => {
      if (ids.size === 0) return;
      const next = questions.filter((q) => !ids.has(q.id));
      const firstDeletedIndex = questions.findIndex((question) => ids.has(question.id));
      const survivingActiveId = activeId && !ids.has(activeId) ? activeId : null;
      const fallbackIndex = Math.min(Math.max(firstDeletedIndex, 0), Math.max(next.length - 1, 0));
      const nextActiveId = survivingActiveId ?? next[fallbackIndex]?.id ?? null;
      onChange(next);
      if (next.length === 0) setEmptyDraft(makeMultipleChoiceQuestion());
      selectSingleQuestion(nextActiveId);
      announce(`Deleted ${ids.size} question${ids.size === 1 ? '' : 's'}.`);
    },
    [questions, onChange, activeId, selectSingleQuestion, announce]
  );

  const duplicateQuestions = useCallback(
    (ids: ReadonlySet<string>) => {
      if (ids.size === 0) return;
      const next: AuthoringQuestion[] = [];
      let firstCopyId: string | null = null;
      for (const q of questions) {
        next.push(q);
        if (ids.has(q.id)) {
          const copy = duplicateQuestion(q);
          if (!firstCopyId) firstCopyId = copy.id;
          next.push(copy);
        }
      }
      onChange(next);
      if (firstCopyId) selectSingleQuestion(firstCopyId);
      announce(`Duplicated ${ids.size} question${ids.size === 1 ? '' : 's'}.`);
    },
    [questions, onChange, selectSingleQuestion, announce]
  );

  const moveQuestion = useCallback(
    (id: string, direction: -1 | 1) => {
      const idx = questions.findIndex((q) => q.id === id);
      const target = idx + direction;
      if (idx === -1 || target < 0 || target >= questions.length) return;
      const next = [...questions];
      [next[idx], next[target]] = [next[target], next[idx]];
      onChange(next);
    },
    [questions, onChange]
  );

  const updateActive = useCallback(
    (next: AuthoringQuestion) => {
      if (questions.length === 0 && next.id === emptyDraft.id) {
        setEmptyDraft(next);
        onChange([next]);
        selectSingleQuestion(next.id);
        announce('Started a new question.');
        return;
      }
      onChange(questions.map((q) => (q.id === next.id ? next : q)));
    },
    [questions, emptyDraft.id, onChange, selectSingleQuestion, announce]
  );

  const changeActiveType = useCallback(
    (nextType: AuthoringQuestion['type']) => {
      if (!editableQuestion || editableQuestion.type === nextType) return;
      const stash = typeStashRef.current.get(editableQuestion.id) ?? {};
      if (editableQuestion.type === 'multipleChoice') stash.multipleChoice = editableQuestion;
      else stash.shortAnswer = editableQuestion;
      typeStashRef.current.set(editableQuestion.id, stash);

      const restored = nextType === 'multipleChoice' ? stash.multipleChoice : stash.shortAnswer;
      const next: AuthoringQuestion =
        restored ??
        (nextType === 'multipleChoice'
          ? { ...makeMultipleChoiceQuestion(editableQuestion.id), prompt: editableQuestion.prompt }
          : { ...makeShortAnswerQuestion(editableQuestion.id), prompt: editableQuestion.prompt });
      updateActive(next);
    },
    [editableQuestion, updateActive]
  );

  const handleImport = useCallback(
    (imported: AuthoringQuestion[], mode: 'append' | 'replace') => {
      onChange(mode === 'append' ? [...questions, ...imported] : imported);
      if (imported[0]) selectSingleQuestion(imported[0].id);
      announce(
        `Imported ${imported.length} question${imported.length === 1 ? '' : 's'} (${mode === 'append' ? 'appended' : 'replaced bank'}).`
      );
    },
    [questions, onChange, selectSingleQuestion, announce]
  );

  const getCommandAvailability = useCallback(
    (availability: CommandAvailability, commandId?: QuestionBankCommandId): { enabled: boolean; reason?: string } => {
      if (commandId === 'save-node' && saving) {
        return { enabled: false, reason: 'The node is already being saved.' };
      }
      switch (availability) {
        case 'question-target':
          return commandTargetIds.size > 0
            ? { enabled: true }
            : { enabled: false, reason: 'Select or open a question first.' };
        case 'active-question':
          return activeQuestion ? { enabled: true } : { enabled: false, reason: 'Open a question first.' };
        case 'move-up':
          return activeIndex > 0
            ? { enabled: true }
            : { enabled: false, reason: 'The active question is already first.' };
        case 'move-down':
          return activeIndex >= 0 && activeIndex < questions.length - 1
            ? { enabled: true }
            : { enabled: false, reason: 'The active question is already last.' };
        case 'has-questions':
          return questions.length > 0
            ? { enabled: true }
            : { enabled: false, reason: 'Add a question before exporting.' };
        default:
          return { enabled: true };
      }
    },
    [commandTargetIds, activeQuestion, activeIndex, questions.length, saving]
  );

  const runCommand = useCallback(
    (commandId: QuestionBankCommandId) => {
      switch (commandId) {
        case 'open-commands':
          setPaletteOpen(true);
          return;
        case 'new-question':
          addQuestion(editableQuestion?.type ?? 'multipleChoice');
          return;
        case 'new-multiple-choice':
          addQuestion('multipleChoice');
          return;
        case 'new-short-answer':
          addQuestion('shortAnswer');
          return;
        case 'duplicate-questions':
          duplicateQuestions(commandTargetIds);
          return;
        case 'delete-questions':
          deleteQuestions(commandTargetIds);
          return;
        case 'move-question-up':
          if (activeId) moveQuestion(activeId, -1);
          return;
        case 'move-question-down':
          if (activeId) moveQuestion(activeId, 1);
          return;
        case 'import-csv':
          setImportOpen(true);
          return;
        case 'export-csv':
          downloadCsvFile('quiz-questions.csv', questionsToCsv(questions));
          return;
        case 'save-node':
          if (!saving) void onSave();
          return;
        default:
          return;
      }
    },
    [
      editableQuestion,
      addQuestion,
      commandTargetIds,
      duplicateQuestions,
      deleteQuestions,
      activeId,
      moveQuestion,
      questions,
      onSave,
      saving,
    ]
  );

  const paletteItems = useMemo<CommandPaletteItem[]>(
    () =>
      QUESTION_BANK_COMMANDS.filter((command) => command.showInPalette).map((command) => {
        const availability = getCommandAvailability(command.availability, command.id);
        return {
          command,
          enabled: availability.enabled,
          disabledReason: availability.reason,
          execute: command.kind === 'action' ? () => runCommand(command.id) : undefined,
        };
      }),
    [getCommandAvailability, runCommand]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (paletteOpen) return;
      const command = QUESTION_BANK_COMMANDS.find((candidate) => matchesCommandShortcut(event, candidate));
      if (!command) return;
      if (isFormEditingTarget(event.target) && !command.allowInTextEditor) return;
      if (!getCommandAvailability(command.availability, command.id).enabled) return;
      event.preventDefault();
      runCommand(command.id);
    },
    [paletteOpen, getCommandAvailability, runCommand]
  );

  useEffect(() => {
    function handleDocumentKeyDown(event: KeyboardEvent) {
      // Events originating inside the editor are handled by handleKeyDown.
      // This listener makes the palette shortcut work when wizard controls or
      // other elements outside the question bank currently have focus.
      if (event.defaultPrevented || paletteOpen || !matchesCommandShortcut(event, OPEN_COMMANDS_COMMAND)) return;
      event.preventDefault();
      setPaletteOpen(true);
    }

    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown);
  }, [paletteOpen]);

  const columnDefs = useMemo<ColDef<BrowserRow>[]>(
    () => [
      { headerName: '', width: 44, cellRenderer: StatusCell, sortable: false, suppressMovable: true },
      {
        field: 'type',
        headerName: 'Type',
        width: 130,
        sortable: false,
        valueFormatter: (params) => (params.value === 'multipleChoice' ? 'Multiple choice' : 'Short answer'),
      },
      {
        field: 'prompt',
        headerName: 'Question',
        flex: 1,
        minWidth: 220,
        sortable: false,
        cellRenderer: PromptCell,
      },
      { field: 'answer', headerName: 'Answer', width: 190, sortable: false },
    ],
    []
  );

  const rowSelection = useMemo(
    () => ({
      mode: 'multiRow' as const,
      checkboxes: false,
      headerCheckbox: false,
      enableClickSelection: true,
      enableSelectionWithoutKeys: false,
    }),
    []
  );

  const handleSelectionChanged = useCallback(
    (event: SelectionChangedEvent<BrowserRow>) => {
      const selectedNodes = event.selectedNodes ?? [];
      const ids = new Set(
        selectedNodes.map((node) => node.data?.id).filter((id): id is string => typeof id === 'string')
      );
      if (event.source !== 'api' && event.source !== 'rowDataChanged') {
        pendingSingleSelectionRef.current = undefined;
      }
      setSelectedIds(ids);
      setActiveId((current) => {
        if (event.source === 'rowDataChanged' && current && questions.some((question) => question.id === current)) {
          return current;
        }
        if (ids.size === 0) return null;
        if (current && ids.has(current)) return current;
        return selectedNodes.at(-1)?.data?.id ?? null;
      });
    },
    [questions]
  );

  return (
    <div className={styles.editor} onKeyDownCapture={handleKeyDown}>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search prompts, choices, answers…"
          aria-label="Search questions"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          <option value="multipleChoice">Multiple choice</option>
          <option value="shortAnswer">Short answer</option>
        </select>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="errors">Errors</option>
          <option value="warnings">Warnings</option>
          <option value="valid">Valid</option>
        </select>

        <span className={styles.toolbarSpacer} />

        <button
          type="button"
          className={styles.toolbarBtn}
          onClick={() => runCommand('open-commands')}
          aria-keyshortcuts="Meta+Shift+P Control+Shift+P"
        >
          Commands
        </button>
        <button type="button" className={styles.toolbarBtn} onClick={() => runCommand('new-multiple-choice')}>
          + Multiple choice
        </button>
        <button type="button" className={styles.toolbarBtn} onClick={() => runCommand('new-short-answer')}>
          + Short answer
        </button>
        <button type="button" className={styles.toolbarBtn} onClick={() => runCommand('import-csv')}>
          Import CSV
        </button>
        <button
          type="button"
          className={styles.toolbarBtn}
          disabled={questions.length === 0}
          onClick={() => runCommand('export-csv')}
        >
          Export CSV
        </button>
      </div>

      {selectedIds.size > 1 && (
        <div className={styles.bulkBar} role="status">
          <span>{selectedIds.size} selected</span>
          <button type="button" className={styles.toolbarBtn} onClick={() => runCommand('duplicate-questions')}>
            Duplicate
          </button>
          <button type="button" className={styles.toolbarBtnDanger} onClick={() => runCommand('delete-questions')}>
            Delete
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={() => selectSingleQuestion(null)}>
            Clear selection
          </button>
        </div>
      )}

      <div className={styles.workspace}>
        <div className={styles.browserPanel}>
          <div className={styles.browser} data-testid="question-browser">
            {questions.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No questions yet.</p>
                <p className={styles.emptyHint}>Start typing in the editor or import a CSV to get started.</p>
              </div>
            ) : (
              <AgGridReact<BrowserRow>
                theme={themeQuartz}
                rowData={rowData}
                columnDefs={columnDefs}
                getRowId={(params) => params.data.id}
                rowSelection={rowSelection}
                suppressCellFocus={false}
                animateRows={false}
                onGridReady={(event: GridReadyEvent<BrowserRow>) => {
                  gridApiRef.current = event.api;
                  flushPendingSingleSelection(event.api, true);
                }}
                onGridPreDestroyed={() => {
                  gridApiRef.current = null;
                }}
                onRowDataUpdated={(event: RowDataUpdatedEvent<BrowserRow>) => {
                  flushPendingSingleSelection(event.api, true);
                }}
                onRowClicked={(event: RowClickedEvent<BrowserRow>) => {
                  pendingSingleSelectionRef.current = undefined;
                  if (event.data && event.node.isSelected()) setActiveId(event.data.id);
                }}
                onSelectionChanged={handleSelectionChanged}
              />
            )}
          </div>
          {questions.length > 1 && (
            <p className={styles.selectionHint}>
              <kbd>⌘/Ctrl-click</kbd> to select multiple · <kbd>Shift-click</kbd> to select a range
            </p>
          )}
        </div>

        <div className={styles.detail}>
          {editableQuestion ? (
            <QuestionDetailEditor
              key={editableQuestion.id}
              question={editableQuestion}
              issues={draftQuestion ? [] : (issuesByQuestion.get(editableQuestion.id) ?? [])}
              isDraft={Boolean(draftQuestion)}
              onChange={updateActive}
              onChangeType={changeActiveType}
              onDuplicate={() => duplicateQuestions(new Set([editableQuestion.id]))}
              onDelete={() => deleteQuestions(new Set([editableQuestion.id]))}
              onMove={(direction) => moveQuestion(editableQuestion.id, direction)}
              canMoveUp={activeIndex > 0}
              canMoveDown={activeIndex >= 0 && activeIndex < questions.length - 1}
            />
          ) : (
            <div className={styles.emptyDetail}>
              <p>Select a question to edit it.</p>
              <p className={styles.emptyHint}>
                Press <kbd>N</kbd> for a new question. Use modifier-click to select rows for bulk actions.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className={styles.statusBar} data-testid="question-bank-status">
        <span>
          {questions.length} question{questions.length === 1 ? '' : 's'}
          {visibleQuestions.length !== questions.length ? ` · ${visibleQuestions.length} shown` : ''}
          {totalErrors > 0 ? ` · ${totalErrors} error${totalErrors === 1 ? '' : 's'}` : ''}
          {totalWarnings > 0 ? ` · ${totalWarnings} warning${totalWarnings === 1 ? '' : 's'}` : ''}
        </span>
        <span className={styles.statusBarHint}>
          {QUESTION_BANK_COMMANDS.filter((command) => command.showInStatusBar).map((command, index) => (
            <span key={command.id}>
              {index > 0 && ' · '}
              <kbd>{commandShortcutLabel(command)}</kbd> {command.statusText}
            </span>
          ))}
        </span>
      </div>

      <p className={styles.srOnly} role="status" aria-live="polite">
        {statusMessage}
      </p>

      {paletteOpen && <CommandPalette items={paletteItems} onClose={() => setPaletteOpen(false)} />}

      {importOpen && (
        <CsvImportDialog
          existingCount={questions.length}
          onImport={handleImport}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
