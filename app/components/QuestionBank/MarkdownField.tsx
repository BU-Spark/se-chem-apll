'use client';

import { useId, useState } from 'react';
import MarkdownPreview from './MarkdownPreview';
import styles from './QuestionBank.module.css';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  /** Render a compact single-line-height editor for answer choices. */
  compact?: boolean;
  error?: string;
};

/**
 * Markdown source editor with a Write/Preview toggle. Deliberately a plain
 * textarea for now — CodeMirror or a richer editor can replace the internals
 * later without changing the props.
 */
export default function MarkdownField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  required = false,
  compact = false,
  error,
}: Props) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className={styles.markdownField}>
      <div className={styles.markdownFieldHeader}>
        <label className={styles.markdownFieldLabel} htmlFor={id}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
        <div className={styles.markdownFieldTabs} role="group" aria-label={`${label} view`}>
          <button
            type="button"
            className={mode === 'write' ? styles.markdownTabActive : styles.markdownTab}
            onClick={() => setMode('write')}
          >
            Write
          </button>
          <button
            type="button"
            className={mode === 'preview' ? styles.markdownTabActive : styles.markdownTab}
            onClick={() => setMode('preview')}
          >
            Preview
          </button>
        </div>
      </div>

      {mode === 'write' ? (
        <textarea
          id={id}
          className={compact ? styles.markdownInputCompact : styles.markdownInput}
          rows={compact ? 1 : rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
      ) : (
        <div className={compact ? styles.markdownPreviewBoxCompact : styles.markdownPreviewBox}>
          {value.trim() === '' ? (
            <span className={styles.markdownPreviewEmpty}>Nothing to preview</span>
          ) : (
            <MarkdownPreview content={value} />
          )}
        </div>
      )}

      {error && (
        <p className={styles.fieldError} id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
