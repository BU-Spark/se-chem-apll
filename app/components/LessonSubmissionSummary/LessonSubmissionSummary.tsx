import type { StudentLessonSubmission } from '@/lib/studentLessonSubmission';
import DeadlineTime from './DeadlineTime';
import styles from './LessonSubmissionSummary.module.css';

const windowLabels = {
  NOT_OPEN: 'Not yet open',
  ON_TIME: 'Open for on-time submissions',
  LATE: 'Open for late submissions',
  CLOSED: 'Closed',
} satisfies Record<StudentLessonSubmission['window'], string>;

export default function LessonSubmissionSummary({
  submission: { dueDate, lateDeadline, penalty, window, best },
  showPenalty = false,
}: {
  submission: StudentLessonSubmission;
  showPenalty?: boolean;
}) {
  return (
    <span className={styles.summary}>
      <span>
        {dueDate ? (
          <>
            Due: <DeadlineTime isoDate={dueDate.toISOString()} />
          </>
        ) : (
          'No due date'
        )}
      </span>
      <span>
        {lateDeadline ? (
          <>
            Late deadline: <DeadlineTime isoDate={lateDeadline.toISOString()} />
          </>
        ) : (
          'No late submissions'
        )}
      </span>
      <span>
        Submission window: <strong>{windowLabels[window]}</strong>
      </span>
      {showPenalty && <span>{penalty}</span>}
      <span>{best ? 'Submitted' : 'Not submitted'}</span>
      {best && (
        <span>
          {best.finalPercent === null ? 'Completion only' : `Best grade: ${Number(best.finalPercent.toFixed(2))}%`}
        </span>
      )}
    </span>
  );
}
