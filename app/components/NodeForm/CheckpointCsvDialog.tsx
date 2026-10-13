'use client';

import { useEffect, useRef, useState } from 'react';
import {
  appendCheckpoints,
  csvToCheckpoints,
  CHECKPOINT_CSV_MAX_BYTES,
  type CheckpointCsvResult,
} from '@/app/utils/checkpointCsv';
import CheckpointGroupPreview from './CheckpointGroupPreview';
import type { FormCheckpoint } from './types';
import styles from '../QuestionBank/QuestionBank.module.css';
import layout from './CheckpointCsvDialog.module.css';

type Props = { existing: FormCheckpoint[]; onApply: (checkpoints: FormCheckpoint[]) => void; onClose: () => void };
export default function CheckpointCsvDialog({ existing, onApply, onClose }: Props) {
  const [result, setResult] = useState<CheckpointCsvResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [confirmed, setConfirmed] = useState(false);
  const [reading, setReading] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const chooseFileButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    chooseFileButton.current?.focus();
    return () => {
      generation.current += 1;
      prior?.focus();
    };
  }, []);
  let collision: string | null = null;
  if (mode === 'append' && result && !result.errors.length) {
    try {
      appendCheckpoints(existing, result.checkpoints);
    } catch (e) {
      collision = (e as Error).message;
    }
  }
  const needsConfirmation = mode === 'replace' && existing.length > 0;
  return (
    <div className={styles.dialogOverlay}>
      <div
        ref={dialog}
        className={`${styles.dialog} ${layout.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-label="Import checkpoints from CSV"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
          if (event.key === 'Tab') {
            const controls = Array.from(
              dialog.current?.querySelectorAll<HTMLElement>(
                'input:not(:disabled):not([hidden]), button:not(:disabled), summary'
              ) ?? []
            );
            const first = controls[0];
            const last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            }
            if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header className={`${styles.dialogHeader} ${layout.header}`}>
          <h3 className={styles.dialogTitle}>Import checkpoints from CSV</h3>
          <button
            type="button"
            className={`${styles.dialogCloseBtn} ${layout.close}`}
            onClick={onClose}
            aria-label="Close import dialog"
          >
            ×
          </button>
        </header>
        <div className={`${styles.dialogBody} ${layout.body}`}>
          <p className={layout.description}>Review your checkpoint groups. You can assign missing timestamps next.</p>
          <div className={layout.fileRow}>
            <button
              ref={chooseFileButton}
              type="button"
              className={styles.toolbarBtn}
              onClick={() => fileInput.current?.click()}
            >
              {fileName ? 'Change file' : 'Choose CSV'}
            </button>
            <span className={layout.fileName} title={fileName}>
              {fileName || 'No CSV selected'}
            </span>
          </div>
          <input
            ref={fileInput}
            hidden
            aria-label="Choose checkpoint CSV file"
            type="file"
            accept=".csv,text/csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              setFileName(file.name);
              const current = ++generation.current;
              setResult(null);
              setError(null);
              setConfirmed(false);
              setReading(true);
              try {
                if (file.size > CHECKPOINT_CSV_MAX_BYTES) throw new Error('The file limit is 2 MB.');
                const text = await file.text();
                if (current === generation.current) setResult(csvToCheckpoints(text));
              } catch (e) {
                if (current === generation.current) setError((e as Error).message);
              } finally {
                if (current === generation.current) setReading(false);
              }
            }}
          />
          {reading && <p role="status">Reading CSV…</p>}
          {error && (
            <p className={layout.error} role="alert">
              {error}
            </p>
          )}
          {!!result?.errors.length && (
            <ul className={styles.importErrorList} aria-label="Import errors">
              {result.errors.map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          )}
          {result && !result.errors.length && (
            <>
              <p className={layout.summary} role="status">
                {result.checkpoints.length} checkpoints ·{' '}
                {result.checkpoints.reduce((n, c) => n + c.questions.length, 0)} items ·{' '}
                {result.checkpoints.filter((c) => c.timeOffsetSeconds === null).length} need timestamps
              </p>
              <div className={layout.groups}>
                {result.checkpoints.map((checkpoint, index) => (
                  <CheckpointGroupPreview key={checkpoint.id} checkpoint={checkpoint} index={index} />
                ))}
              </div>
              {existing.length > 0 && (
                <fieldset className={layout.mode}>
                  <legend>Import mode</legend>
                  <label className={layout.option}>
                    <input
                      type="radio"
                      name="checkpoint-import-mode"
                      checked={mode === 'append'}
                      onChange={() => {
                        setMode('append');
                        setConfirmed(false);
                      }}
                    />
                    <span>
                      <strong>Append after existing checkpoints</strong>
                      <small>Keep all {existing.length} existing groups and add these after them.</small>
                    </span>
                  </label>
                  <label className={layout.option}>
                    <input
                      type="radio"
                      name="checkpoint-import-mode"
                      checked={mode === 'replace'}
                      onChange={() => setMode('replace')}
                    />
                    <span>
                      <strong>Replace all checkpoints</strong>
                      <small>Replace {existing.length} existing groups with the imported groups.</small>
                    </span>
                  </label>
                </fieldset>
              )}
              {needsConfirmation && (
                <label className={layout.confirmation}>
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  Replace {existing.length} checkpoints and {existing.reduce((n, c) => n + c.questions.length, 0)}{' '}
                  items. Content with student responses cannot be replaced when saving.
                </label>
              )}
              {collision && (
                <p className={layout.error} role="alert">
                  {collision}
                </p>
              )}
            </>
          )}
        </div>
        <footer className={`${styles.dialogFooter} ${layout.footer}`}>
          <button type="button" className={styles.toolbarBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={
              reading ||
              !result?.checkpoints.length ||
              !!result.errors.length ||
              !!collision ||
              (needsConfirmation && !confirmed)
            }
            onClick={() => {
              if (!result || result.errors.length) return;
              try {
                onApply(mode === 'append' ? appendCheckpoints(existing, result.checkpoints) : result.checkpoints);
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Import and assign timestamps
          </button>
        </footer>
      </div>
    </div>
  );
}
