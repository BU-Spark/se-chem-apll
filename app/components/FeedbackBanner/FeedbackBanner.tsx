import styles from './FeedbackBanner.module.css';

// "Correct" / "Incorrect" after a video question. Announced to screen readers when it appears.
export default function FeedbackBanner({ correct }: { correct: boolean }) {
  return (
    <div
      className={correct ? `${styles.banner} ${styles.correct}` : `${styles.banner} ${styles.incorrect}`}
      role="status"
    >
      <span className={styles.icon} aria-hidden="true">
        {correct ? '✓' : '✕'}
      </span>
      <span className={styles.label}>{correct ? 'Correct' : 'Incorrect'}</span>
    </div>
  );
}
