'use client';

import { useState, useEffect } from 'react';
import type { PaletteNode } from '@/app/types';
import styles from './LessonRoadmapBuilder.module.css';

export type NodeSelectPayload = {
  node: PaletteNode;
  passingPercent: string;
  quizQuestionCount: string;
  isRequired: boolean;
};

interface Props {
  nodes: PaletteNode[];
  onSelect: (payload: NodeSelectPayload) => void;
  onClose: () => void;
}

export default function NodeSearchPopup({ nodes, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PaletteNode | null>(null);
  const [passingPercent, setPassingPercent] = useState('');
  const [quizQuestionCount, setQuizQuestionCount] = useState('0');
  const [isRequired, setIsRequired] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (selected) {
        setSelected(null);
        setFormError(null);
      } else {
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, selected]);

  const filtered = nodes.filter(
    (n) =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      (n.summary ?? '').toLowerCase().includes(search.toLowerCase())
  );

  function handlePickNode(node: PaletteNode) {
    setSelected(node);
    setPassingPercent('');
    setQuizQuestionCount(node.quizBankCount > 0 ? String(node.quizBankCount) : '0');
    setIsRequired(true);
    setFormError(null);
  }

  function handleAdd() {
    if (!selected) return;

    if (
      passingPercent === '' ||
      !Number.isInteger(Number(passingPercent)) ||
      Number(passingPercent) < 0 ||
      Number(passingPercent) > 100
    ) {
      setFormError('Choose a whole-number pass threshold between 0 and 100.');
      return;
    }

    if (selected.quizBankCount === 0) {
      if (quizQuestionCount !== '0' && quizQuestionCount !== '') {
        setFormError('Quiz question count must be 0 when there is no quiz bank.');
        return;
      }
    } else if (
      quizQuestionCount === '' ||
      !Number.isInteger(Number(quizQuestionCount)) ||
      Number(quizQuestionCount) < 1
    ) {
      setFormError('Quiz question count must be a whole number of at least 1.');
      return;
    }

    onSelect({
      node: selected,
      passingPercent,
      quizQuestionCount,
      isRequired,
    });
  }

  const requestedCount = Number(quizQuestionCount);
  const hasRequestedCount = quizQuestionCount !== '' && Number.isInteger(requestedCount);
  const showEqualMessage =
    selected != null && selected.quizBankCount > 0 && hasRequestedCount && requestedCount === selected.quizBankCount;
  const showGreaterMessage =
    selected != null && selected.quizBankCount > 0 && hasRequestedCount && requestedCount > selected.quizBankCount;

  return (
    <div className={styles.popupBackdrop} onClick={onClose}>
      <div className={styles.popupPanel} role="dialog" aria-label="Add node" onClick={(e) => e.stopPropagation()}>
        <div className={styles.popupHeader}>
          <h2 className={styles.popupTitle}>{selected ? selected.title : 'Add node'}</h2>
          <button type="button" className={styles.popupClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {!selected ? (
          <>
            <input
              className={styles.popupSearch}
              placeholder="Search nodes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <ul className={styles.popupList}>
              {filtered.length === 0 && <li className={styles.popupEmpty}>No nodes match your search.</li>}
              {filtered.map((node) => (
                <li key={node.id}>
                  <button type="button" className={styles.popupItem} onClick={() => handlePickNode(node)}>
                    <div className={styles.popupItemTitleRow}>
                      <span className={styles.popupItemTitle}>{node.title}</span>
                      {node.quizBankCount > 0 && <span className={styles.quizBankBadge}>Quiz bank</span>}
                    </div>
                    {node.summary && <span className={styles.popupItemMeta}>{node.summary}</span>}
                    <span className={styles.popupItemMeta}>
                      {node.checkpointCount} checkpoint{node.checkpointCount !== 1 ? 's' : ''} · {node.quizBankCount}
                      quiz question{node.quizBankCount !== 1 ? 's' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className={styles.popupSettings}>
            <button type="button" className={styles.popupBackBtn} onClick={() => setSelected(null)}>
              ← Back
            </button>

            <label className={styles.popupField}>
              Pass threshold (%)
              <input
                type="number"
                min={0}
                max={100}
                required
                placeholder="e.g. 70"
                value={passingPercent}
                onChange={(e) => {
                  setFormError(null);
                  setPassingPercent(e.target.value);
                }}
                autoFocus
              />
            </label>

            {selected.quizBankCount > 0 && (
              <label className={styles.popupField}>
                Quiz questions
                <input
                  type="number"
                  min={1}
                  required
                  placeholder="e.g. 5"
                  value={quizQuestionCount}
                  onChange={(e) => {
                    setFormError(null);
                    setQuizQuestionCount(e.target.value);
                  }}
                />
              </label>
            )}

            <label className={styles.popupCheckbox}>
              <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
              Foundational
            </label>

            {showEqualMessage && (
              <p className={styles.popupHint}>Quiz will show all {requestedCount} bank questions — no variability.</p>
            )}
            {showGreaterMessage && (
              <p className={styles.popupHintWarning}>
                Requested {requestedCount} but bank only has {selected.quizBankCount}; only {selected.quizBankCount}
                will be shown.
              </p>
            )}

            {formError && <p className={styles.popupFormError}>{formError}</p>}

            <button type="button" className={styles.popupAddBtn} onClick={handleAdd}>
              Add to lesson
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
