'use client';

import MarkdownField from './MarkdownField';
import type { QuestionIssue } from './validation';
import {
  MAX_CHOICES,
  MIN_CHOICES,
  makeChoice,
  type AuthoringQuestion,
  type MultipleChoiceQuestion,
  type ShortAnswerQuestion,
} from './types';
import styles from './QuestionBank.module.css';

type Props = {
  question: AuthoringQuestion;
  /** An uncommitted question shown when the bank is empty. */
  isDraft?: boolean;
  /** Issues for this question only. */
  issues: QuestionIssue[];
  onChange: (next: AuthoringQuestion) => void;
  onChangeType: (nextType: AuthoringQuestion['type']) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

function issuesForField(issues: QuestionIssue[], field: string): string | undefined {
  return issues.find((issue) => issue.field === field)?.message;
}

function MultipleChoiceEditor({
  question,
  issues,
  onChange,
}: {
  question: MultipleChoiceQuestion;
  issues: QuestionIssue[];
  onChange: (next: AuthoringQuestion) => void;
}) {
  function updateChoice(choiceId: string, patch: Partial<(typeof question.choices)[number]>) {
    onChange({
      ...question,
      choices: question.choices.map((choice) => (choice.id === choiceId ? { ...choice, ...patch } : choice)),
    });
  }

  function moveChoice(choiceId: string, direction: -1 | 1) {
    const idx = question.choices.findIndex((choice) => choice.id === choiceId);
    const target = idx + direction;
    if (idx === -1 || target < 0 || target >= question.choices.length) return;
    const choices = [...question.choices];
    [choices[idx], choices[target]] = [choices[target], choices[idx]];
    onChange({ ...question, choices });
  }

  function removeChoice(choiceId: string) {
    if (question.choices.length <= MIN_CHOICES) return;
    onChange({ ...question, choices: question.choices.filter((choice) => choice.id !== choiceId) });
  }

  const choicesIssue = issuesForField(issues, 'choices');

  return (
    <div className={styles.choiceEditor}>
      <p className={styles.choiceEditorLabel}>Answer choices — check every correct answer</p>
      {question.choices.map((choice, idx) => (
        <div key={choice.id} className={styles.choiceEditorRow}>
          <input
            type="checkbox"
            className={styles.choiceCorrect}
            checked={choice.correct}
            onChange={(e) => updateChoice(choice.id, { correct: e.target.checked })}
            aria-label={`Choice ${idx + 1} is correct`}
            title="Mark as correct"
          />
          <div className={styles.choiceEditorField}>
            <MarkdownField
              label={`Choice ${idx + 1}`}
              compact
              value={choice.content}
              onChange={(content) => updateChoice(choice.id, { content })}
              placeholder={`Choice ${idx + 1} — Markdown and $\\ce{...}$ supported`}
              error={issuesForField(issues, `choice:${choice.id}`)}
            />
          </div>
          <div className={styles.choiceEditorActions}>
            <button
              type="button"
              onClick={() => moveChoice(choice.id, -1)}
              disabled={idx === 0}
              aria-label={`Move choice ${idx + 1} up`}
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveChoice(choice.id, 1)}
              disabled={idx === question.choices.length - 1}
              aria-label={`Move choice ${idx + 1} down`}
              title="Move down"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => removeChoice(choice.id)}
              disabled={question.choices.length <= MIN_CHOICES}
              aria-label={`Remove choice ${idx + 1}`}
              title="Remove choice"
            >
              ×
            </button>
          </div>
        </div>
      ))}
      {question.choices.length < MAX_CHOICES && (
        <button
          type="button"
          className={styles.addChoiceBtn}
          onClick={() => onChange({ ...question, choices: [...question.choices, makeChoice()] })}
        >
          + Add choice
        </button>
      )}
      {choicesIssue && (
        <p className={styles.fieldError} role="alert">
          {choicesIssue}
        </p>
      )}
    </div>
  );
}

function ShortAnswerEditor({
  question,
  issues,
  onChange,
}: {
  question: ShortAnswerQuestion;
  issues: QuestionIssue[];
  onChange: (next: AuthoringQuestion) => void;
}) {
  const answerIssue = issuesForField(issues, 'answer');
  const answer = question.answer;

  return (
    <div className={styles.shortAnswerEditor}>
      <div className={styles.segmented} role="group" aria-label="Answer mode">
        <button
          type="button"
          className={answer.mode === 'exact' ? styles.segmentActive : styles.segment}
          onClick={() => onChange({ ...question, answer: { mode: 'exact', expected: '' } })}
          aria-pressed={answer.mode === 'exact'}
        >
          Exact answer
        </button>
        <button
          type="button"
          className={answer.mode === 'range' ? styles.segmentActive : styles.segment}
          onClick={() => onChange({ ...question, answer: { mode: 'range', minimum: '', maximum: '' } })}
          aria-pressed={answer.mode === 'range'}
        >
          Answer range
        </button>
      </div>

      {answer.mode === 'exact' ? (
        <label className={styles.numericField}>
          Expected answer
          <input
            type="text"
            inputMode="decimal"
            value={answer.expected}
            onChange={(e) => onChange({ ...question, answer: { mode: 'exact', expected: e.target.value } })}
            placeholder="42"
            aria-label="Expected answer"
          />
        </label>
      ) : (
        <div className={styles.numericRow}>
          <label className={styles.numericField}>
            Minimum
            <input
              type="text"
              inputMode="decimal"
              value={answer.minimum}
              onChange={(e) =>
                onChange({ ...question, answer: { mode: 'range', minimum: e.target.value, maximum: answer.maximum } })
              }
              placeholder="3.1"
              aria-label="Minimum answer"
            />
          </label>
          <label className={styles.numericField}>
            Maximum
            <input
              type="text"
              inputMode="decimal"
              value={answer.maximum}
              onChange={(e) =>
                onChange({ ...question, answer: { mode: 'range', minimum: answer.minimum, maximum: e.target.value } })
              }
              placeholder="3.2"
              aria-label="Maximum answer"
            />
          </label>
        </div>
      )}
      {answerIssue && (
        <p className={styles.fieldError} role="alert">
          {answerIssue}
        </p>
      )}
    </div>
  );
}

/**
 * Focused editor for one question. This is the only place where full question
 * content is edited; the grid is a read-only browser.
 */
export default function QuestionDetailEditor({
  question,
  isDraft = false,
  issues,
  onChange,
  onChangeType,
  onDuplicate,
  onDelete,
  onMove,
  canMoveUp,
  canMoveDown,
}: Props) {
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.length - errorCount;

  return (
    <section className={styles.detailEditor} aria-label="Question editor">
      <header className={styles.detailHeader}>
        <label className={styles.detailTypeSelect}>
          Type
          <select
            value={question.type}
            onChange={(e) => onChangeType(e.target.value as AuthoringQuestion['type'])}
            aria-label="Question type"
          >
            <option value="multipleChoice">Multiple choice</option>
            <option value="shortAnswer">Numeric short answer</option>
          </select>
        </label>
        {isDraft ? (
          <span className={styles.draftBadge}>New question</span>
        ) : (
          <div className={styles.detailHeaderActions}>
            <button type="button" onClick={() => onMove(-1)} disabled={!canMoveUp} title="Move question up">
              ↑
            </button>
            <button type="button" onClick={() => onMove(1)} disabled={!canMoveDown} title="Move question down">
              ↓
            </button>
            <button type="button" onClick={onDuplicate} title="Duplicate question">
              Duplicate
            </button>
            <button type="button" className={styles.detailDeleteBtn} onClick={onDelete} title="Delete question">
              Delete
            </button>
          </div>
        )}
      </header>

      {(errorCount > 0 || warningCount > 0) && (
        <p className={errorCount > 0 ? styles.detailIssueError : styles.detailIssueWarning} role="status">
          {errorCount > 0 ? `${errorCount} error${errorCount === 1 ? '' : 's'}` : ''}
          {errorCount > 0 && warningCount > 0 ? ' · ' : ''}
          {warningCount > 0 ? `${warningCount} warning${warningCount === 1 ? '' : 's'}` : ''}
        </p>
      )}

      <MarkdownField
        label="Question prompt"
        required
        value={question.prompt}
        onChange={(prompt) => onChange({ ...question, prompt })}
        placeholder={'What is the $K_a$ of $\\ce{CH3COOH}$?'}
        rows={3}
        error={issuesForField(issues, 'prompt')}
      />

      {question.type === 'multipleChoice' ? (
        <MultipleChoiceEditor question={question} issues={issues} onChange={onChange} />
      ) : (
        <ShortAnswerEditor question={question} issues={issues} onChange={onChange} />
      )}
    </section>
  );
}
