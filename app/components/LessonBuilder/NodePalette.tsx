'use client';

import { useState } from 'react';
import styles from './LessonBuilder.module.css';

export interface PaletteNode {
  id: string;
  title: string;
  summary: string | null;
  quizBankCount: number;
  checkpointCount: number;
}

interface Props {
  nodes: PaletteNode[];
  onAdd: (node: PaletteNode) => void;
}

export default function NodePalette({ nodes, onAdd }: Props) {
  const [search, setSearch] = useState('');

  const filtered = nodes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      (n.summary ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside className={styles.palette}>
      <p className={styles.paletteTitle}>Node library</p>
      <input
        className={styles.paletteSearch}
        placeholder="Search nodes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ul className={styles.paletteList}>
        {filtered.length === 0 && <li className={styles.paletteEmpty}>No nodes match your search.</li>}
        {filtered.map((node) => (
          <li key={node.id} className={styles.paletteItem}>
            <div className={styles.paletteItemBody}>
              <div className={styles.paletteItemTitleRow}>
                <span className={styles.paletteItemTitle}>{node.title}</span>
                {node.quizBankCount > 0 && <span className={styles.quizBankBadge}>Quiz bank</span>}
              </div>
              {node.summary && <span className={styles.paletteItemMeta}>{node.summary}</span>}
              <span className={styles.paletteItemMeta}>
                {node.checkpointCount} checkpoint{node.checkpointCount !== 1 ? 's' : ''} · {node.quizBankCount} quiz
                question{node.quizBankCount !== 1 ? 's' : ''}
              </span>
            </div>
            <button type="button" className={styles.paletteAddBtn} onClick={() => onAdd(node)} title="Add to lesson">
              +
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
