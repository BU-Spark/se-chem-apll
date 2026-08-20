'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  BoldItalicUnderlineToggles,
  CreateLink,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  Separator,
  toolbarPlugin,
  UndoRedo,
} from '@mdxeditor/editor';
import { normalizeVisualMarkdown } from './normalizeVisualMarkdown';
import styles from './QuestionBank.module.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  compact?: boolean;
  contentEditableId: string;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
  onMarkdownError: (message: string) => void;
};

/**
 * Client-only Markdown-backed rich text surface.
 *
 * MDXEditor reads `markdown` only on mount. The ref synchronization below is
 * therefore required when the active question changes without remounting this
 * component. `currentMarkdown` prevents a prop-driven update from echoing back
 * through onChange and overwriting the newly selected question.
 */
export default function RichMarkdownEditor({
  value,
  onChange,
  placeholder,
  compact = false,
  contentEditableId,
  labelledBy,
  describedBy,
  invalid = false,
  onMarkdownError,
}: Props) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentMarkdown = useRef(value);
  const propValue = useRef(value);

  propValue.current = value;

  useEffect(() => {
    if (value === currentMarkdown.current) return;
    currentMarkdown.current = value;
    editorRef.current?.setMarkdown(value);
  }, [value]);

  // MDXEditor does not expose native aria attributes for its contenteditable,
  // so associate the generated textbox with our visible label and error text.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function labelEditable() {
      const editable = root?.querySelector<HTMLElement>('[contenteditable="true"]');
      if (!editable) return;

      editable.id = contentEditableId;
      editable.setAttribute('aria-labelledby', labelledBy);
      if (describedBy) editable.setAttribute('aria-describedby', describedBy);
      else editable.removeAttribute('aria-describedby');
      editable.setAttribute('aria-invalid', String(invalid));
    }

    labelEditable();
    const observer = new MutationObserver(labelEditable);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [contentEditableId, describedBy, invalid, labelledBy]);

  const plugins = useMemo(
    () => [
      ...(!compact ? [listsPlugin(), linkPlugin(), linkDialogPlugin()] : []),
      toolbarPlugin({
        toolbarClassName: styles.richMarkdownToolbar,
        toolbarContents: () => (
          <>
            <UndoRedo />
            <Separator />
            <BoldItalicUnderlineToggles options={['Bold', 'Italic']} />
            {!compact && (
              <>
                <Separator />
                <ListsToggle options={['bullet', 'number']} />
                <CreateLink />
              </>
            )}
          </>
        ),
      }),
    ],
    [compact]
  );

  return (
    <div
      ref={rootRef}
      className={`${styles.richMarkdownEditor}${invalid ? ` ${styles.richMarkdownEditorInvalid}` : ''}`}
      onKeyDownCapture={(event) => {
        if (compact && event.key === 'Enter') event.preventDefault();
      }}
    >
      <MDXEditor
        ref={editorRef}
        markdown={value}
        onChange={(nextValue) => {
          const normalizedValue = normalizeVisualMarkdown(nextValue);
          currentMarkdown.current = normalizedValue;

          if (normalizedValue !== nextValue) {
            // Reflect stripped clipboard-only formatting in the visual surface
            // after MDXEditor finishes its current update.
            queueMicrotask(() => {
              if (currentMarkdown.current === normalizedValue) {
                editorRef.current?.setMarkdown(normalizedValue);
              }
            });
          }

          if (normalizedValue !== propValue.current) onChange(normalizedValue);
        }}
        onError={({ error }) => onMarkdownError(error)}
        placeholder={placeholder}
        plugins={plugins}
        className={styles.richMarkdownRoot}
        contentEditableClassName={compact ? styles.richMarkdownContentCompact : styles.richMarkdownContent}
        suppressHtmlProcessing
        trim={false}
      />
    </div>
  );
}
