import { useState, type ReactNode } from 'react';
import type { FormCheckpoint } from './types';
import QevItemPreview from './QevItemPreview';
import { formatTimeOffsetSeconds } from '@/app/utils/questionTimestamps';
import styles from './CheckpointPlacement.module.css';

type Props = { checkpoint: FormCheckpoint; index: number; open?: boolean; onSelect?: () => void; children?: ReactNode };
export default function CheckpointGroupPreview({ checkpoint, index, open, onSelect, children }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isOpen = open ?? expanded;
  const notes = checkpoint.questions.filter((q) => q.questionType === 'note').length;
  const questions = checkpoint.questions.length - notes;
  return (
    <details className={styles.group} open={isOpen}>
      <summary
        className={styles.groupHeader}
        onClick={(event) => {
          event.preventDefault();
          if (onSelect) onSelect();
          else setExpanded(!expanded);
        }}
      >
        <span className={styles.groupName}>{checkpoint.checkpointKey ?? `checkpoint-${index + 1}`}</span>
        <span className={styles.count}>
          {questions} question{questions === 1 ? '' : 's'}
          {notes > 0 && ` · ${notes} note${notes === 1 ? '' : 's'}`}
        </span>
        <span className={checkpoint.timeOffsetSeconds === null ? styles.unplaced : styles.time}>
          {formatTimeOffsetSeconds(checkpoint.timeOffsetSeconds)}
        </span>
      </summary>
      {isOpen && (
        <div className={styles.groupBody}>
          {checkpoint.placementHint && <p className={styles.hint}>{checkpoint.placementHint}</p>}
          {children}
          <div className={styles.previews}>
            {checkpoint.questions.map((question) => (
              <QevItemPreview key={question.id} question={question} />
            ))}
          </div>
        </div>
      )}
    </details>
  );
}
