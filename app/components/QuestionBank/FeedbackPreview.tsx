import MarkdownPreview from './MarkdownPreview';
import styles from './QuestionBank.module.css';

export default function FeedbackPreview({
  question,
}: {
  question: { feedbackCorrect?: string | null; feedbackIncorrect?: string | null };
}) {
  return (
    <>
      {(
        [
          ['Feedback for correct answer', question.feedbackCorrect],
          ['Feedback for incorrect answer', question.feedbackIncorrect],
        ] as const
      ).map(([label, content]) =>
        content?.trim() ? (
          <div key={label} className={styles.questionPreview}>
            <span className={styles.questionPreviewLabel}>{label}</span>
            <MarkdownPreview content={content} />
          </div>
        ) : null
      )}
    </>
  );
}
