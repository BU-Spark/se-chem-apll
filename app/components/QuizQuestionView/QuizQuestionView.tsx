import MarkdownPreview from '@/app/components/QuestionBank/MarkdownPreview';
import type { QuizAnswer, QuizQuestion } from './types';
import styles from './QuizQuestionView.module.css';

const LETTERS = 'ABCDEFGH';

interface QuizQuestionViewProps {
  question: QuizQuestion;
  answer: QuizAnswer | undefined;
  onSelect: (selectedIndices: number[]) => void;
  onType: (rawAnswer: string) => void;
}

// One question: lettered choices for multiple choice (pick one, or several when more than one
// is correct), a number box otherwise.
export default function QuizQuestionView({ question, answer, onSelect, onType }: QuizQuestionViewProps) {
  const selected = answer && 'selectedIndices' in answer ? answer.selectedIndices : [];
  const toggle = (index: number) =>
    onSelect(selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index]);
  const rawAnswer = answer && 'rawAnswer' in answer ? answer.rawAnswer : '';
  const showNumberError = rawAnswer.trim() !== '' && !Number.isFinite(Number(rawAnswer));

  return (
    <section className={styles.question} aria-label="Question">
      <MarkdownPreview content={question.prompt} />
      {question.choices ? (
        <div
          className={styles.choices}
          role={question.allowsMultiple ? 'group' : 'radiogroup'}
          aria-label={question.allowsMultiple ? 'Select all that apply' : 'Choose one answer'}
        >
          {question.allowsMultiple && <p className={styles.hint}>Select all that apply</p>}
          {question.choices.map((choice, index) => (
            <button
              key={index}
              type="button"
              role={question.allowsMultiple ? 'checkbox' : 'radio'}
              aria-checked={selected.includes(index)}
              className={selected.includes(index) ? `${styles.choice} ${styles.selected}` : styles.choice}
              onClick={() => (question.allowsMultiple ? toggle(index) : onSelect([index]))}
            >
              <span className={styles.letter}>{LETTERS[index]}</span>
              <MarkdownPreview content={choice} />
            </button>
          ))}
        </div>
      ) : (
        <label className={styles.numberField}>
          <span className={styles.hint}>Your answer (number)</span>
          <input
            type="text"
            inputMode="decimal"
            className={styles.numberInput}
            value={rawAnswer}
            onChange={(event) => onType(event.target.value)}
            aria-invalid={showNumberError}
          />
          {showNumberError && (
            <span role="alert" className={styles.error}>
              Please enter a number, e.g. 7 or 0.5.
            </span>
          )}
        </label>
      )}
    </section>
  );
}
