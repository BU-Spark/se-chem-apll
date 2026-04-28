'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './LessonBuilder.module.css';

export interface LessonNodeEntry {
  instanceId: string; // unique per drop (not the DB nodeId)
  nodeId: string;
  title: string;
  defaultPassingPercent: number;
  passingPercentOverride: string; // empty string = use default
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
              placeholder={`Default (${entry.defaultPassingPercent}%)`}
              value={entry.passingPercentOverride}
              onChange={(e) => onChange({ passingPercentOverride: e.target.value })}
            />
          </label>
          <label className={styles.nodeCardCheckbox}>
            <input
              type="checkbox"
              checked={entry.isRequired}
              onChange={(e) => onChange({ isRequired: e.target.checked })}
            />
            Required
          </label>
        </div>
      </div>
    </div>
  );
}
