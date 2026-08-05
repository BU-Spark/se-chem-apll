'use client';

import type { FormQuestion, QuestionType, ShortAnswerMode } from './types';
import styles from './NodeForm.module.css';

interface QuestionEditorProps {
  q: FormQuestion;
  index: number;
  onUpdate: (patch: Partial<FormQuestion>) => void;
  onRemove: () => void;
  onUpdateChoice: (idx: number, value: string) => void;
  onAddChoice: () => void;
  onRemoveChoice: (idx: number) => void;
  canRemove: boolean;
}

export default function QuestionEditor({
  q,
  index,
  onUpdate,
  onRemove,
  onUpdateChoice,
  onAddChoice,
  onRemoveChoice,
  canRemove,
}: QuestionEditorProps) {
  return (
    <div className={styles.questionCard}>
      <div className={styles.questionHeader}>
        <span className={styles.questionIndex}>Q{index + 1}</span>
        <div className={styles.questionHeaderRight}>
          <label className={styles.typeSelect}>
            Type:
            <select
              value={q.questionType}
              onChange={(e) => onUpdate({ questionType: e.target.value as QuestionType, correctIndices: [] })}
            >
              <option value="multipleChoice">Multiple choice</option>
              <option value="shortAnswer">Numeric short answer</option>
            </select>
          </label>
          {canRemove && (
            <button type="button" className={styles.removeBtn} onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          Question prompt <span className={styles.required}>*</span>
        </span>
        <textarea
          required
          rows={2}
          value={q.prompt}
          onChange={(e) => onUpdate({ prompt: e.target.value })}
          placeholder="What happens if the gas flow is too high?"
        />
      </label>

      {q.questionType === 'multipleChoice' ? (
        <div className={styles.choiceList}>
          <p className={styles.choiceLabel}>Answer choices (select all correct answers)</p>
          {q.choices.map((choice, ci) => (
            <div key={ci} className={styles.choiceRow}>
              <input
                type="checkbox"
                checked={q.correctIndices.includes(ci)}
                onChange={() =>
                  onUpdate({
                    correctIndices: q.correctIndices.includes(ci)
                      ? q.correctIndices.filter((index) => index !== ci)
                      : [...q.correctIndices, ci].sort((a, b) => a - b),
                  })
                }
                title="Mark as correct"
              />
              <input
                required
                value={choice}
                onChange={(e) => onUpdateChoice(ci, e.target.value)}
                placeholder={`Choice ${ci + 1}`}
                className={styles.choiceInput}
              />
              {q.choices.length > 2 && (
                <button type="button" className={styles.removeChoiceBtn} onClick={() => onRemoveChoice(ci)}>
                  ×
                </button>
              )}
            </div>
          ))}
          {q.choices.length < 8 && (
            <button type="button" className={styles.addChoiceBtn} onClick={onAddChoice}>
              + Add choice
            </button>
          )}
        </div>
      ) : (
        <>
          <label className={styles.field}>
            Answer mode
            <select
              value={q.answerMode}
              onChange={(e) =>
                onUpdate({
                  answerMode: e.target.value as ShortAnswerMode,
                  expectedAnswer: '',
                  minimumAnswer: '',
                  maximumAnswer: '',
                })
              }
            >
              <option value="exact">Exact answer</option>
              <option value="range">Answer range</option>
            </select>
          </label>
          {q.answerMode === 'exact' ? (
            <label className={styles.field}>
              Expected answer
              <input
                type="number"
                step="any"
                required
                value={q.expectedAnswer}
                onChange={(e) => onUpdate({ expectedAnswer: e.target.value })}
                placeholder="42"
              />
            </label>
          ) : (
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                Minimum answer
                <input
                  type="number"
                  step="any"
                  required
                  value={q.minimumAnswer}
                  onChange={(e) => onUpdate({ minimumAnswer: e.target.value })}
                  placeholder="40"
                />
              </label>
              <label className={styles.field}>
                Maximum answer
                <input
                  type="number"
                  step="any"
                  required
                  value={q.maximumAnswer}
                  onChange={(e) => onUpdate({ maximumAnswer: e.target.value })}
                  placeholder="45"
                />
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
