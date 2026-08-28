import MarkdownPreview from '@/app/components/QuestionBank/MarkdownPreview';
import type { FormQuestion } from './types';
import styles from './NodeForm.module.css';

type Props = {
  question: FormQuestion;
};

export default function QevItemPreview({ question }: Props) {
  const promptLabel = question.questionType === 'note' ? 'Note' : 'Question';

  return (
    <div className={styles.qevItemPreview} data-testid="qev-item-preview">
      <div className={styles.qevPreviewPrompt}>
        <span className={styles.qevPreviewLabel}>{promptLabel}</span>
        {question.prompt.trim() === '' ? (
          <span className={styles.qevPreviewEmpty}>(empty {promptLabel.toLowerCase()})</span>
        ) : (
          <MarkdownPreview content={question.prompt} />
        )}
      </div>

      {question.questionType === 'multipleChoice' && (
        <div>
          <span className={styles.qevPreviewLabel}>Answer choices</span>
          <ol className={styles.qevPreviewChoices}>
            {question.choices.map((choice, index) => (
              <li key={index} className={styles.qevPreviewChoice}>
                <div className={styles.qevPreviewChoiceContent}>
                  {choice.trim() === '' ? (
                    <span className={styles.qevPreviewEmpty}>(empty choice)</span>
                  ) : (
                    <MarkdownPreview content={choice} />
                  )}
                </div>
                {question.correctIndices.includes(index) && <span className={styles.previewCorrect}>Correct</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {question.questionType === 'shortAnswer' && (
        <p className={styles.qevPreviewAnswer}>
          {question.answerMode === 'exact'
            ? `Expected answer: ${question.expectedAnswer.trim() || '—'}`
            : `Accepted range: ${question.minimumAnswer.trim() || '—'}–${question.maximumAnswer.trim() || '—'}`}
        </p>
      )}
    </div>
  );
}
