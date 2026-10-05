'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import MarkdownPreview from './MarkdownPreview';
import { commandShortcutLabel, type QuestionBankCommand } from './commands';
import styles from './QuestionBank.module.css';

export type CommandPaletteItem = {
  command: QuestionBankCommand;
  enabled: boolean;
  disabledReason?: string;
  execute?: () => void;
};

type Props = {
  items: CommandPaletteItem[];
  onClose: () => void;
};

const RESULTS_ID = 'question-command-results';

function optionId(commandId: string): string {
  return `question-command-${commandId}`;
}

function matchesQuery(item: CommandPaletteItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const command = item.command;
  return [command.title, command.description, command.group, command.example ?? '', ...(command.searchTerms ?? [])]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

export default function CommandPalette({ items, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('');

  const filteredItems = useMemo(() => items.filter((item) => matchesQuery(item, query)), [items, query]);
  const groupedItems = useMemo(
    () =>
      filteredItems.reduce<Array<{ group: QuestionBankCommand['group']; items: CommandPaletteItem[] }>>(
        (groups, item) => {
          const current = groups.at(-1);
          if (current?.group === item.command.group) current.items.push(item);
          else groups.push({ group: item.command.group, items: [item] });
          return groups;
        },
        []
      ),
    [filteredItems]
  );
  const selectedReference = items.find((item) => item.command.id === referenceId && item.command.kind === 'reference');
  const selectedItem = filteredItems[selectedIndex];

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    searchRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
    setReferenceId(null);
    setCopyStatus('');
  }, [query]);

  useEffect(() => {
    if (!selectedItem) return;
    optionRefs.current.get(selectedItem.command.id)?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedItem]);

  function activate(item: CommandPaletteItem | undefined) {
    if (!item) return;
    if (item.command.kind === 'reference') {
      setReferenceId(item.command.id);
      setCopyStatus('');
      return;
    }
    if (!item.enabled || !item.execute) return;
    item.execute();
    onClose();
  }

  async function copyExample() {
    const example = selectedReference?.command.example;
    if (!example) return;
    try {
      await navigator.clipboard.writeText(example);
      setCopyStatus('Example copied.');
    } catch {
      setCopyStatus('Could not copy the example.');
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (filteredItems.length === 0) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setSelectedIndex((prev) => (prev + direction + filteredItems.length) % filteredItems.length);
      return;
    }
    if (event.key === 'Enter' && document.activeElement === searchRef.current) {
      event.preventDefault();
      activate(filteredItems[selectedIndex]);
      return;
    }
    if (event.key === 'Tab') {
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>('input, button:not([disabled]), [tabindex="0"]') ?? []
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  return (
    <div className={styles.commandOverlay}>
      <div
        ref={dialogRef}
        className={styles.commandPalette}
        role="dialog"
        aria-modal="true"
        aria-labelledby="question-command-title"
        onKeyDown={handleKeyDown}
      >
        <header className={styles.commandHeader}>
          <div>
            <h3 id="question-command-title">Commands and formatting help</h3>
            <p>Run a question-bank command or look up LaTeX and chemistry notation.</p>
          </div>
          <button type="button" className={styles.dialogCloseBtn} onClick={onClose} aria-label="Close command palette">
            ×
          </button>
        </header>

        <input
          ref={searchRef}
          type="search"
          role="combobox"
          className={styles.commandSearch}
          aria-label="Search commands and formatting help"
          aria-autocomplete="list"
          aria-controls={RESULTS_ID}
          aria-expanded="true"
          aria-activedescendant={selectedItem ? optionId(selectedItem.command.id) : undefined}
          placeholder="Search commands, LaTeX, chemistry…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className={styles.commandContent}>
          <div id={RESULTS_ID} className={styles.commandResults} role="listbox" aria-label="Available commands">
            {filteredItems.length === 0 ? (
              <p className={styles.commandEmpty}>No commands or formatting references match “{query}”.</p>
            ) : (
              groupedItems.map((group) => {
                const groupId = `question-command-group-${group.group.toLowerCase().replaceAll(/[^a-z]+/g, '-')}`;
                return (
                  <div key={group.group} className={styles.commandGroup} role="group" aria-labelledby={groupId}>
                    <div id={groupId} className={styles.commandGroupLabel}>
                      {group.group}
                    </div>
                    {group.items.map((item) => {
                      const index = filteredItems.indexOf(item);
                      const shortcut = commandShortcutLabel(item.command);
                      const selected = index === selectedIndex;
                      return (
                        <button
                          key={item.command.id}
                          ref={(node) => {
                            if (node) optionRefs.current.set(item.command.id, node);
                            else optionRefs.current.delete(item.command.id);
                          }}
                          id={optionId(item.command.id)}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          aria-disabled={!item.enabled}
                          className={`${styles.commandItem} ${selected ? styles.commandItemSelected : ''}`}
                          onMouseEnter={() => setSelectedIndex(index)}
                          onClick={() => activate(item)}
                        >
                          <span className={styles.commandItemMain}>
                            <span className={styles.commandItemTitle}>{item.command.title}</span>
                            <span className={styles.commandItemDescription}>
                              {!item.enabled && item.disabledReason ? item.disabledReason : item.command.description}
                            </span>
                          </span>
                          <span className={styles.commandItemMeta}>{shortcut && <kbd>{shortcut}</kbd>}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          <aside className={styles.commandReference} aria-label="Formatting reference">
            {selectedReference?.command.example ? (
              <>
                <div>
                  <h4>{selectedReference.command.title}</h4>
                  <p>{selectedReference.command.description}</p>
                </div>
                <code className={styles.commandExample}>{selectedReference.command.example}</code>
                <div className={styles.commandPreview}>
                  <span>Rendered preview</span>
                  <MarkdownPreview content={selectedReference.command.example} />
                </div>
                <button type="button" className={styles.toolbarBtn} onClick={() => void copyExample()}>
                  Copy example
                </button>
                {copyStatus && (
                  <p className={styles.commandCopyStatus} role="status">
                    {copyStatus}
                  </p>
                )}
              </>
            ) : (
              <div className={styles.commandReferenceEmpty}>
                <h4>Formatting reference</h4>
                <p>Select a LaTeX or mhchem help entry to see its source and rendered result.</p>
              </div>
            )}
          </aside>
        </div>

        <footer className={styles.commandFooter}>
          <span>
            <kbd>↑/↓</kbd> navigate · <kbd>Enter</kbd> open or run
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </footer>
      </div>
    </div>
  );
}
