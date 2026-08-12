'use client';

import { useState, useEffect } from 'react';
import type { PaletteNode } from '@/app/components/LessonBuilder/NodePalette';
import styles from './LessonRoadmapBuilder.module.css';

interface Props {
  nodes: PaletteNode[];
  onSelect: (node: PaletteNode) => void;
  onClose: () => void;
}

export default function NodeSearchPopup({ nodes, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const filtered = nodes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      (n.summary ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={styles.popupBackdrop} onClick={onClose}>
      <div className={styles.popupPanel} role="dialog" aria-label="Add node" onClick={(e) => e.stopPropagation()}>
        <div className={styles.popupHeader}>
          <h2 className={styles.popupTitle}>Add node</h2>
          <button type="button" className={styles.popupClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {/* search input */}
        <input
          className={styles.popupSearch}
          placeholder="Search nodes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        {/* filtered list -> onSelect(node) */}
        <ul className={styles.popupList}>
          {filtered.length === 0 && <li className={styles.popupEmpty}>No nodes match your search.</li>}
          {filtered.map((node) => (
            <li key={node.id}>
              <button type="button" className={styles.popupItem} onClick={() => onSelect(node)}>
                <div className={styles.popupItemTitleRow}>
                  <span className={styles.popupItemTitle}>{node.title}</span>
                  {node.quizBankCount > 0 && <span className={styles.quizBankBadge}>Quiz bank</span>}
                </div>
                {node.summary && <span className={styles.popupItemMeta}>{node.summary}</span>}
                <span className={styles.popupItemMeta}>
                  {node.checkpointCount} checkpoint{node.checkpointCount !== 1 ? 's' : ''} · {node.quizBankCount} quiz
                  question{node.quizBankCount !== 1 ? 's' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
