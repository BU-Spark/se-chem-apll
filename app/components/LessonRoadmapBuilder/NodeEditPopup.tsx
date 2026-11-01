'use client';

import { useState, useEffect } from 'react';
import styles from './LessonRoadmapBuilder.module.css';

interface Props {
  title: string;
  quizBankCount: number;
  initialPassingPercent: string;
  initialQuizQuestionCount: string;
  initialIsRequired: boolean;
  onSave: (settings: { passingPercent: string; quizQuestionCount: string; isRequired: boolean }) => void;
  onClose: () => void;
}

export default function NodeEditPopup({
  title,
  quizBankCount,
  initialPassingPercent,
  initialQuizQuestionCount,
  initialIsRequired,
  onSave,
  onClose,
}: Props) {
  const [passingPercent, setPassingPercent] = useState(initialPassingPercent);
  const [quizQuestionCount, setQuizQuestionCount] = useState(initialQuizQuestionCount);
  const [isRequired, setIsRequired] = useState(initialIsRequired);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleSave() {
    if (
      passingPercent === '' ||
      !Number.isInteger(Number(passingPercent)) ||
      Number(passingPercent) < 0 ||
      Number(passingPercent) > 100
    ) {
      setFormError('Choose a whole-number pass threshold between 0 and 100.');
      return;
    }

    if (quizBankCount === 0) {
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

    onSave({ passingPercent, quizQuestionCount, isRequired });
  }

  const requestedCount = Number(quizQuestionCount);
  const hasRequestedCount = quizQuestionCount !== '' && Number.isInteger(requestedCount);
  const showEqualMessage = quizBankCount > 0 && hasRequestedCount && requestedCount === quizBankCount;
  const showGreaterMessage = quizBankCount > 0 && hasRequestedCount && requestedCount > quizBankCount;

  return (
    <div className={styles.popupBackdrop} onClick={onClose}>
      <div
        className={styles.popupPanel}
        role="dialog"
        aria-label="Edit node settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.popupHeader}>
          <h2 className={styles.popupTitle}>{title}</h2>
          <button type="button" className={styles.popupClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.popupSettings}>
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

          {quizBankCount > 0 && (
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
              Requested {requestedCount} but bank only has {quizBankCount}; only {quizBankCount} will be shown.
            </p>
          )}

          {formError && <p className={styles.popupFormError}>{formError}</p>}

          <button type="button" className={styles.popupAddBtn} onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
