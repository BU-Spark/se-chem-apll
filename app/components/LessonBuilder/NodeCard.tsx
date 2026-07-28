'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './LessonBuilder.module.css';

export interface LessonNodeEntry {
  instanceId: string; // unique per drop (not the DB nodeId)
  nodeId: string;
  title: string;
  passingPercent: string;
  quizQuestionCount: string;
  isRequired: boolean;
  preLectureCount: number;
}

interface Props {
  entry: LessonNodeEntry;
  index: number;
  onChange: (patch: Partial<LessonNodeEntry>) => void;
  onRemove: () => void;
}

export default function NodeCard({ entry, index, onChange, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.instanceId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const requestedCount = Number(entry.quizQuestionCount);
  const hasRequestedCount = entry.quizQuestionCount !== '' && Number.isInteger(requestedCount);
  const showEqualMessage = entry.preLectureCount > 0 && hasRequestedCount && requestedCount === entry.preLectureCount;
  const showGreaterMessage = entry.preLectureCount > 0 && hasRequestedCount && requestedCount > entry.preLectureCount;

  return (
    <div ref={setNodeRef} style={style} className={styles.nodeCard}>
      {/* Drag handle */}
      <button type="button" className={styles.dragHandle} {...attributes} {...listeners} aria-label="Drag to reorder">
        ≡
      </button>

      <div className={styles.nodeCardBody}>
        <div className={styles.nodeCardHeader}>
          <span className={styles.nodeCardIndex}>{index + 1}</span>
          <span className={styles.nodeCardTitle}>{entry.title}</span>
          {entry.preLectureCount > 0 && <span className={styles.preQuizBadge}>Pre-quiz</span>}
          <button type="button" className={styles.nodeCardRemove} onClick={onRemove}>
            ×
          </button>
        </div>

        <div className={styles.nodeCardControls}>
          <label className={styles.nodeCardField}>
            Pass threshold (%)
            <input
              type="number"
              min={0}
              max={100}
              required
              placeholder="e.g. 70"
              value={entry.passingPercent}
              onChange={(e) => onChange({ passingPercent: e.target.value })}
            />
          </label>
          {entry.preLectureCount > 0 && (
            <label className={styles.nodeCardField}>
              Quiz questions
              <input
                type="number"
                min={0}
                required={entry.preLectureCount > 0}
                placeholder="e.g. 5"
                value={entry.quizQuestionCount}
                onChange={(e) => onChange({ quizQuestionCount: e.target.value })}
              />
            </label>
          )}
          <label className={styles.nodeCardCheckbox}>
            <input
              type="checkbox"
              checked={entry.isRequired}
              onChange={(e) => onChange({ isRequired: e.target.checked })}
            />
            Foundational
          </label>
        </div>
        {showEqualMessage && (
          <p className={styles.nodeCardHint}>
            The amount of questions shown in the quiz [{requestedCount}] is the same amount that is in the question bank
            [{entry.preLectureCount}], so there is no variability in questions.
          </p>
        )}

        {showGreaterMessage && (
          <p className={styles.nodeCardHintWarning}>
            The number of questions shown in the quiz [{requestedCount}] is greater than the amount that is in the
            question bank [{entry.preLectureCount}]. Only [{entry.preLectureCount}] questions will be shown.
          </p>
        )}
      </div>
    </div>
  );
}
