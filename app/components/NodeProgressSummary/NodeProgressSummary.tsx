import a11y from '@/app/styles/a11y.module.css';
import styles from './NodeProgressSummary.module.css';

interface NodeProgressSummaryProps {
  correct: number;
  total: number;
  coursePercent: number;
}

// "★ 4/5" for the last quiz, next to a bar showing how much of the course is complete.
export default function NodeProgressSummary({ correct, total, coursePercent }: NodeProgressSummaryProps) {
  return (
    <div className={styles.summary}>
      <span className={styles.score}>
        <span aria-hidden="true">☆</span> {correct}/{total}
        <span className={a11y.srOnly}> correct</span>
      </span>
      <span className={styles.course}>
        <span
          className={styles.bar}
          role="progressbar"
          aria-valuenow={coursePercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Course complete"
        >
          <span className={styles.fill} style={{ width: `${coursePercent}%` }} />
        </span>
        <span className={styles.caption}>{coursePercent}% Course Complete</span>
      </span>
    </div>
  );
}
