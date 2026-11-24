import MarkdownPreview from '@/app/components/QuestionBank/MarkdownPreview';
import styles from './FeedbackBanner.module.css';

interface FeedbackBannerProps {
  correct: boolean;
  // The instructor's feedback for this result, if they wrote any.
  explanation?: string | null;
}

// "Correct" / "Incorrect" after a video question, with the instructor's explanation under it.
// Announced to screen readers when it appears.
export default function FeedbackBanner({ correct, explanation }: FeedbackBannerProps) {
  return (
    <div
      className={correct ? `${styles.banner} ${styles.correct}` : `${styles.banner} ${styles.incorrect}`}
      role="status"
    >
      <p className={styles.label}>{correct ? 'Correct' : 'Incorrect'}</p>
      {explanation && <MarkdownPreview content={explanation} />}
    </div>
  );
}
