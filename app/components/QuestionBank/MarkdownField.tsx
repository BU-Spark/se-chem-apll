'use client';

import dynamic from 'next/dynamic';
import { useId, useState } from 'react';
import '@mdxeditor/editor/style.css';
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
  hideLabel?: boolean;
  autoFocus?: boolean;
};

/** Visual editor backed by Markdown, with a source repair fallback for unsupported content. */
export default function MarkdownField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  required = false,
  compact = false,
  error,
  hideLabel = false,
  autoFocus = false,
}: Props) {
  const [visualError, setVisualError] = useState<string | null>(null);
  const [isRepairingSource, setIsRepairingSource] = useState(false);
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  const descriptionId = error || visualError ? `${id}-description` : undefined;
  const requiredPlaceholder = !value.trim() && Boolean(error?.endsWith(' is required.'));
  const effectivePlaceholder = requiredPlaceholder ? 'Required' : placeholder;

  function updateValue(nextValue: string) {
    setVisualError(null);
    onChange(nextValue);
  }

  return (
    <div className={styles.markdownField}>
      <div className={hideLabel ? styles.srOnly : styles.markdownFieldHeader}>
        <label className={styles.markdownFieldLabel} htmlFor={id} id={labelId}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      </div>

      {!isRepairingSource ? (
        <div className={compact ? styles.richMarkdownSlotCompact : styles.richMarkdownSlot}>
          <RichMarkdownEditor
            autoFocus={autoFocus}
            value={value}
            onChange={updateValue}
            placeholder={effectivePlaceholder}
            compact={compact}
            contentEditableId={id}
            labelledBy={labelId}
            describedBy={descriptionId}
            invalid={Boolean(error || visualError)}
            onMarkdownError={(message) => {
              setVisualError(message);
              setIsRepairingSource(true);
            }}
          />
        </div>
      ) : (
        <div className={styles.markdownRepair}>
          <textarea
            autoFocus={autoFocus}
            id={id}
            className={compact ? styles.markdownInputCompact : styles.markdownInput}
            rows={compact ? 1 : rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={effectivePlaceholder}
            aria-invalid={Boolean(error || visualError)}
            aria-describedby={descriptionId}
          />
          <button
            type="button"
            className={styles.markdownRepairButton}
            onClick={() => {
              setVisualError(null);
              setIsRepairingSource(false);
            }}
          >
            Try visual editor again
          </button>
        </div>
      )}

      {(error || visualError) && (
        <p
          className={requiredPlaceholder && !visualError ? styles.srOnly : styles.fieldError}
          id={descriptionId ?? errorId}
          role="alert"
        >
          {error ?? 'This content could not be opened visually. Edit the source, then try the visual editor again.'}
        </p>
      )}
    </div>
  );
}
