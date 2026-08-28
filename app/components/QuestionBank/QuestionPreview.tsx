import MarkdownPreview from './MarkdownPreview';
import type { AuthoringQuestion } from './types';
import styles from './QuestionBank.module.css';

export default function QuestionPreview({ question }: { question: AuthoringQuestion }) {
  return (
    <section className={styles.questionPreview} aria-label="Question preview" data-testid="question-preview">
      <div className={styles.questionPreviewPrompt}>
        <span className={styles.questionPreviewLabel}>Question</span>
        {question.prompt.trim() === '' ? (
          <span className={styles.questionPreviewEmpty}>(empty question)</span>
        ) : (
          <MarkdownPreview content={question.prompt} />
        )}
      </div>

      {question.type === 'multipleChoice' ? (
        <div>
          <span className={styles.questionPreviewLabel}>Answer choices</span>
          <ol className={styles.questionPreviewChoices}>
            {question.choices.map((choice) => (
              <li key={choice.id} className={styles.questionPreviewChoice}>
                <div className={styles.questionPreviewChoiceContent}>
                  {choice.content.trim() === '' ? (
                    <span className={styles.questionPreviewEmpty}>(empty choice)</span>
                  ) : (
                    <MarkdownPreview content={choice.content} />
                  )}
                </div>
                {choice.correct && <span className={styles.questionPreviewCorrect}>Correct</span>}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className={styles.questionPreviewAnswer}>
          {question.answer.mode === 'exact'
            ? `Expected answer: ${question.answer.expected.trim() || '—'}`
            : `Accepted range: ${question.answer.minimum.trim() || '—'}–${question.answer.maximum.trim() || '—'}`}
        </p>
      )}
    </section>
  );
}
