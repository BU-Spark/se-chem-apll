'use client';

import dynamic from 'next/dynamic';
import { useId, useState } from 'react';
import '@mdxeditor/editor/style.css';
import MarkdownPreview from './MarkdownPreview';
import styles from './QuestionBank.module.css';

const RichMarkdownEditor = dynamic(() => import('./RichMarkdownEditor'), {
  ssr: false,
  loading: () => <div className={styles.richMarkdownLoading}>Loading visual editor…</div>,
});

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

/** Markdown-backed visual editor with source and rendered preview modes. */
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
  const [mode, setMode] = useState<'visual' | 'source' | 'preview'>('visual');
  const [visualError, setVisualError] = useState<string | null>(null);
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  const descriptionId = error || visualError ? `${id}-description` : undefined;

  function updateValue(nextValue: string) {
    setVisualError(null);
    onChange(nextValue);
  }

  return (
    <div className={styles.markdownField}>
      <div className={styles.markdownFieldHeader}>
        <label className={styles.markdownFieldLabel} htmlFor={id} id={labelId}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
        <div className={styles.markdownFieldTabs} role="group" aria-label={`${label} view`}>
          <button
            type="button"
            className={mode === 'visual' ? styles.markdownTabActive : styles.markdownTab}
            onClick={() => setMode('visual')}
            aria-pressed={mode === 'visual'}
          >
            Visual
          </button>
          <button
            type="button"
            className={mode === 'source' ? styles.markdownTabActive : styles.markdownTab}
            onClick={() => setMode('source')}
            aria-pressed={mode === 'source'}
          >
            Markdown
          </button>
          {!compact && (
            <button
              type="button"
              className={mode === 'preview' ? styles.markdownTabActive : styles.markdownTab}
              onClick={() => setMode('preview')}
              aria-pressed={mode === 'preview'}
            >
              Preview
            </button>
          )}
        </div>
      </div>

      {mode === 'visual' ? (
        <div className={compact ? styles.richMarkdownSlotCompact : styles.richMarkdownSlot}>
          <RichMarkdownEditor
            value={value}
            onChange={updateValue}
            placeholder={placeholder}
            compact={compact}
            contentEditableId={id}
            labelledBy={labelId}
            describedBy={descriptionId}
            invalid={Boolean(error || visualError)}
            onMarkdownError={(message) => {
              setVisualError(message);
              setMode('source');
            }}
          />
        </div>
      ) : mode === 'source' ? (
        <textarea
          id={id}
          className={compact ? styles.markdownInputCompact : styles.markdownInput}
          rows={compact ? 1 : rows}
          value={value}
          onChange={(e) => updateValue(e.target.value)}
          placeholder={placeholder}
          aria-invalid={Boolean(error || visualError)}
          aria-describedby={descriptionId}
        />
      ) : (
        <div className={styles.markdownPreviewBox} aria-labelledby={labelId}>
          {value.trim() === '' ? (
            <span className={styles.markdownPreviewEmpty}>Nothing to preview</span>
          ) : (
            <MarkdownPreview content={value} />
          )}
        </div>
      )}

      {(error || visualError) && (
        <p className={styles.fieldError} id={descriptionId ?? errorId} role="alert">
          {error ?? 'This content could not be opened visually. Edit the Markdown and try Visual mode again.'}
        </p>
      )}
    </div>
  );
}
