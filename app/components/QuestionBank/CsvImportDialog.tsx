'use client';

import { useEffect, useRef, useState } from 'react';
import { csvToQuestions, sampleQuestionBankCsv, type CsvImportResult } from '@/app/utils/questionBankCsv';
import { downloadCsvFile } from '@/app/utils/csv';
import type { AuthoringQuestion } from './types';
import styles from './QuestionBank.module.css';

type ImportMode = 'append' | 'replace';

type Props = {
  existingCount: number;
  onImport: (questions: AuthoringQuestion[], mode: ImportMode) => void;
  onClose: () => void;
};

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB — a question bank is text
const MAX_ROWS = 5000;

/**
 * Staged CSV import: select → review diagnostics → choose append/replace.
 * Nothing is applied until the instructor confirms.
 */
export default function CsvImportDialog({ existingCount, onImport, onClose }: Props) {
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>('append');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = dialog.querySelector<HTMLElement>('input, button, select, [tabindex]');
    focusable?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  async function handleFile(file: File) {
    setFileError(null);
    setResult(null);

    if (file.size > MAX_FILE_BYTES) {
      setFileError(`That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The import limit is 2 MB.`);
      return;
    }

    try {
      const text = await file.text();
      const parsed = csvToQuestions(text);
      if (parsed.questions.length > MAX_ROWS) {
        setFileError(`That file has ${parsed.questions.length} questions. The import limit is ${MAX_ROWS}.`);
        return;
      }
      setResult(parsed);
    } catch {
      setFileError('Could not read that CSV file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleApply() {
    if (!result || result.questions.length === 0) return;
    onImport(result.questions, mode);
    onClose();
  }

  const validCount = result?.questions.length ?? 0;
  const errorCount = result?.errors.length ?? 0;
  const replaceNeedsConfirm = mode === 'replace' && existingCount > 0;

  return (
    <div className={styles.dialogOverlay}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Import questions from CSV"
      >
        <header className={styles.dialogHeader}>
          <h3 className={styles.dialogTitle}>Import questions from CSV</h3>
          <button type="button" className={styles.dialogCloseBtn} onClick={onClose} aria-label="Close import dialog">
            ×
          </button>
        </header>

        <div className={styles.dialogBody}>
          <div className={styles.dialogRow}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className={styles.dialogFileInput}
              aria-label="Choose CSV file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <button
              type="button"
              className={styles.toolbarBtn}
              onClick={() => downloadCsvFile('quiz-questions-sample.csv', sampleQuestionBankCsv())}
            >
              Download sample CSV
            </button>
          </div>

          {fileError && (
            <p className={styles.fieldError} role="alert">
              {fileError}
            </p>
          )}

          {result && (
            <>
              <p className={styles.importSummary} role="status">
                {validCount} valid question{validCount === 1 ? '' : 's'}
                {errorCount > 0 ? ` · ${errorCount} row error${errorCount === 1 ? '' : 's'}` : ''}
              </p>

              {errorCount > 0 && (
                <ul className={styles.importErrorList} aria-label="Import errors">
                  {result.errors.map((err, idx) => (
                    <li key={`${err.row}-${idx}`}>{err.message}</li>
                  ))}
                </ul>
              )}

              {validCount > 0 && (
                <fieldset className={styles.importMode}>
                  <legend className={styles.importModeLegend}>Import mode</legend>
                  <label className={styles.importModeOption}>
                    <input
                      type="radio"
                      name="import-mode"
                      checked={mode === 'append'}
                      onChange={() => setMode('append')}
                    />
                    Append {validCount} question{validCount === 1 ? '' : 's'} to the bank
                    {existingCount > 0 ? ` (keeps existing ${existingCount})` : ''}
                  </label>
                  <label className={styles.importModeOption}>
                    <input
                      type="radio"
                      name="import-mode"
                      checked={mode === 'replace'}
                      onChange={() => setMode('replace')}
                    />
                    Replace the whole bank
                    {existingCount > 0 ? ` (discards ${existingCount} existing)` : ''}
                  </label>
                </fieldset>
              )}
            </>
          )}
        </div>

        <footer className={styles.dialogFooter}>
          <button type="button" className={styles.toolbarBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={!result || validCount === 0}
            onClick={() => {
              if (
                replaceNeedsConfirm &&
                !window.confirm(`Replace all ${existingCount} existing questions with ${validCount} imported ones?`)
              ) {
                return;
              }
              handleApply();
            }}
          >
            Import {validCount > 0 ? validCount : ''} question{validCount === 1 ? '' : 's'}
          </button>
        </footer>
      </div>
    </div>
  );
}
