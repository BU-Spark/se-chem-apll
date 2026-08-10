'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
  type RowClickedEvent,
  type SelectionChangedEvent,
} from 'ag-grid-community';
import { downloadCsvFile } from '@/app/utils/csv';
import { questionsToCsv } from '@/app/utils/questionBankCsv';
import CsvImportDialog from './CsvImportDialog';
import QuestionDetailEditor from './QuestionDetailEditor';
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

function firstLine(text: string): string {
  const line = text.split('\n', 1)[0].trim();
  return line === '' ? '(empty prompt)' : line;
}

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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

/**
 * Hybrid question-bank editor: a virtualized read-only browser for scanning,
 * filtering, and selecting, plus a focused detail editor for the active
 * question. Bulk operations work on multi-selected rows.
 */
export default function QuestionBankEditor({ questions, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [importOpen, setImportOpen] = useState(false);
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
          prompt: firstLine(q.prompt),
          answer: summarizeAnswer(q),
          hasError: issues.some((issue) => issue.severity === 'error'),
          hasWarning: issues.some((issue) => issue.severity === 'warning'),
        };
      }),
    [visibleQuestions, issuesByQuestion]
  );

  const activeQuestion = questions.find((q) => q.id === activeId) ?? null;
  const activeIndex = activeQuestion ? questions.indexOf(activeQuestion) : -1;

  const announce = useCallback((message: string) => setStatusMessage(message), []);

  const addQuestion = useCallback(
    (type: AuthoringQuestion['type']) => {
      const question = type === 'multipleChoice' ? makeMultipleChoiceQuestion() : makeShortAnswerQuestion();
      const insertAt = activeIndex >= 0 ? activeIndex + 1 : questions.length;
      const next = [...questions.slice(0, insertAt), question, ...questions.slice(insertAt)];
      onChange(next);
      setActiveId(question.id);
      announce(`Added a new ${type === 'multipleChoice' ? 'multiple-choice' : 'short-answer'} question.`);
    },
    [questions, activeIndex, onChange, announce]
  );

  const deleteQuestions = useCallback(
    (ids: ReadonlySet<string>) => {
      if (ids.size === 0) return;
      const next = questions.filter((q) => !ids.has(q.id));
      onChange(next);
      if (activeId && ids.has(activeId)) setActiveId(null);
      setSelectedIds(new Set());
      announce(`Deleted ${ids.size} question${ids.size === 1 ? '' : 's'}.`);
    },
    [questions, onChange, activeId, announce]
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
      if (firstCopyId) setActiveId(firstCopyId);
      announce(`Duplicated ${ids.size} question${ids.size === 1 ? '' : 's'}.`);
    },
    [questions, onChange, announce]
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
      onChange(questions.map((q) => (q.id === next.id ? next : q)));
    },
    [questions, onChange]
  );

  const changeActiveType = useCallback(
    (nextType: AuthoringQuestion['type']) => {
      if (!activeQuestion || activeQuestion.type === nextType) return;
      const stash = typeStashRef.current.get(activeQuestion.id) ?? {};
      if (activeQuestion.type === 'multipleChoice') stash.multipleChoice = activeQuestion;
      else stash.shortAnswer = activeQuestion;
      typeStashRef.current.set(activeQuestion.id, stash);

      const restored = nextType === 'multipleChoice' ? stash.multipleChoice : stash.shortAnswer;
      const next: AuthoringQuestion =
        restored ??
        (nextType === 'multipleChoice'
          ? { ...makeMultipleChoiceQuestion(activeQuestion.id), prompt: activeQuestion.prompt }
          : { ...makeShortAnswerQuestion(activeQuestion.id), prompt: activeQuestion.prompt });
      updateActive(next);
    },
    [activeQuestion, updateActive]
  );

  const handleImport = useCallback(
    (imported: AuthoringQuestion[], mode: 'append' | 'replace') => {
      onChange(mode === 'append' ? [...questions, ...imported] : imported);
      announce(
        `Imported ${imported.length} question${imported.length === 1 ? '' : 's'} (${mode === 'append' ? 'appended' : 'replaced bank'}).`
      );
    },
    [questions, onChange, announce]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        containerRef.current?.closest('form')?.requestSubmit();
        return;
      }

      if (isEditableTarget(event.target)) return;

      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateQuestions(selectedIds.size > 0 ? selectedIds : new Set(activeId ? [activeId] : []));
        return;
      }

      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        if (activeId) {
          event.preventDefault();
          moveQuestion(activeId, event.key === 'ArrowUp' ? -1 : 1);
        }
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedIds.size > 0) {
          event.preventDefault();
          deleteQuestions(selectedIds);
        }
        return;
      }

      if (!mod && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        addQuestion(activeQuestion?.type ?? 'multipleChoice');
      }
    },
    [selectedIds, activeId, activeQuestion, duplicateQuestions, moveQuestion, deleteQuestions, addQuestion]
  );

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
      { field: 'prompt', headerName: 'Question', flex: 1, minWidth: 220, sortable: false },
      { field: 'answer', headerName: 'Answer', width: 190, sortable: false },
    ],
    []
  );

  const rowSelection = useMemo(
    () => ({ mode: 'multiRow' as const, checkboxes: true, headerCheckbox: true, enableClickSelection: false }),
    []
  );

  return (
    <div ref={containerRef} className={styles.editor} onKeyDown={handleKeyDown}>
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

        <button type="button" className={styles.toolbarBtn} onClick={() => addQuestion('multipleChoice')}>
          + Multiple choice
        </button>
        <button type="button" className={styles.toolbarBtn} onClick={() => addQuestion('shortAnswer')}>
          + Short answer
        </button>
        <button type="button" className={styles.toolbarBtn} onClick={() => setImportOpen(true)}>
          Import CSV
        </button>
        <button
          type="button"
          className={styles.toolbarBtn}
          disabled={questions.length === 0}
          onClick={() => downloadCsvFile('quiz-questions.csv', questionsToCsv(questions))}
        >
          Export CSV
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className={styles.bulkBar} role="status">
          <span>{selectedIds.size} selected</span>
          <button type="button" className={styles.toolbarBtn} onClick={() => duplicateQuestions(selectedIds)}>
            Duplicate
          </button>
          <button type="button" className={styles.toolbarBtnDanger} onClick={() => deleteQuestions(selectedIds)}>
            Delete
          </button>
          <button type="button" className={styles.toolbarBtn} onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      <div className={styles.workspace}>
        <div className={styles.browser} data-testid="question-browser">
          {questions.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No questions yet.</p>
              <p className={styles.emptyHint}>Add a question or import a CSV to get started.</p>
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
              onRowClicked={(event: RowClickedEvent<BrowserRow>) => {
                if (event.data) setActiveId(event.data.id);
              }}
              onSelectionChanged={(event: SelectionChangedEvent<BrowserRow>) => {
                const ids = new Set(
                  (event.selectedNodes ?? [])
                    .map((node) => node.data?.id)
                    .filter((id): id is string => typeof id === 'string')
                );
                setSelectedIds(ids);
              }}
            />
          )}
        </div>

        <div className={styles.detail}>
          {activeQuestion ? (
            <QuestionDetailEditor
              question={activeQuestion}
              issues={issuesByQuestion.get(activeQuestion.id) ?? []}
              onChange={updateActive}
              onChangeType={changeActiveType}
              onDuplicate={() => duplicateQuestions(new Set([activeQuestion.id]))}
              onDelete={() => deleteQuestions(new Set([activeQuestion.id]))}
              onMove={(direction) => moveQuestion(activeQuestion.id, direction)}
              canMoveUp={activeIndex > 0}
              canMoveDown={activeIndex >= 0 && activeIndex < questions.length - 1}
            />
          ) : (
            <div className={styles.emptyDetail}>
              <p>Select a question to edit it.</p>
              <p className={styles.emptyHint}>
                Press <kbd>N</kbd> for a new question. Select rows with checkboxes for bulk actions.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className={styles.statusBar}>
        <span>
          {questions.length} question{questions.length === 1 ? '' : 's'}
          {visibleQuestions.length !== questions.length ? ` · ${visibleQuestions.length} shown` : ''}
          {totalErrors > 0 ? ` · ${totalErrors} error${totalErrors === 1 ? '' : 's'}` : ''}
          {totalWarnings > 0 ? ` · ${totalWarnings} warning${totalWarnings === 1 ? '' : 's'}` : ''}
        </span>
        <span className={styles.statusBarHint}>
          <kbd>N</kbd> new · <kbd>⌘/Ctrl+D</kbd> duplicate · <kbd>Del</kbd> delete selected · <kbd>Alt+↑/↓</kbd> move ·{' '}
          <kbd>⌘/Ctrl+S</kbd> save
        </span>
      </div>

      <p className={styles.srOnly} role="status" aria-live="polite">
        {statusMessage}
      </p>

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
