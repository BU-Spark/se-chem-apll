'use client';

import { useState } from 'react';
import { renderQuestionVariant } from '@/app/utils/questionVariants';
import MarkdownPreview from './MarkdownPreview';
import type { AuthoringQuestion } from './types';
import styles from './QuestionBank.module.css';

export default function QuestionPreview({
  question,
  selectedVariantId,
  onSelectVariant,
  showVariantNavigation = true,
}: {
  question: AuthoringQuestion;
  selectedVariantId?: string;
  onSelectVariant?: (id: string) => void;
  showVariantNavigation?: boolean;
}) {
  const [selectedId, setSelectedId] = useState('');
  const variants = question.variants;
  const variant = variants?.find((row) => row.id === (selectedVariantId ?? selectedId)) ?? variants?.[0];
  const variantIndex = variant ? variants!.findIndex((row) => row.id === variant.id) : -1;
  function selectVariant(index: number) {
    const row = variants?.[index];
    if (!row) return;
    setSelectedId(row.id);
    onSelectVariant?.(row.id);
  }
  let preview: AuthoringQuestion = question;
  if (variant) {
    const prompt = renderQuestionVariant(question.prompt, variant.values);
    if (question.type === 'multipleChoice' && 'correctChoiceIds' in variant.answer) {
      const correct = variant.answer.correctChoiceIds;
      preview = {
        ...question,
        prompt,
        choices: (variant.answer.choices ?? []).map((c) => ({
          ...c,
          content: renderQuestionVariant(c.content, variant.values),
          correct: correct.includes(c.id),
        })),
      };
    } else if (question.type === 'shortAnswer' && 'mode' in variant.answer) {
      preview = { ...question, prompt, answer: variant.answer };
    }
  }
  return (
    <section
      className={`${styles.questionPreview} ${variants ? styles.variantPreview : ''}`}
      aria-label="Question preview"
      data-testid="question-preview"
    >
      {variants && (
        <div className={styles.variantPreviewHeader}>
          <strong>Student preview</strong>
          {showVariantNavigation && (
            <div className={styles.variantPreviewNavigation}>
              <span aria-live="polite">
                {variant ? `Variant ${variantIndex + 1} of ${variants.length}` : 'No variants'}
              </span>
              <button
                type="button"
                aria-label="Previous variant"
                disabled={variantIndex <= 0}
                onClick={() => selectVariant(variantIndex - 1)}
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Next variant"
                disabled={variantIndex < 0 || variantIndex >= variants.length - 1}
                onClick={() => selectVariant(variantIndex + 1)}
              >
                →
              </button>
            </div>
          )}
        </div>
      )}
      <div className={styles.questionPreviewPrompt}>
        {!variants && <span className={styles.questionPreviewLabel}>Question</span>}
        {preview.prompt.trim() === '' ? (
          <span className={styles.questionPreviewEmpty}>(empty question)</span>
        ) : (
          <MarkdownPreview content={preview.prompt} />
        )}
      </div>

      {preview.type === 'multipleChoice' ? (
        <div>
          <span className={styles.questionPreviewLabel}>
            {variants ? 'Answer choices · select all correct answers' : 'Answer choices'}
          </span>
          <ol className={styles.questionPreviewChoices} type={variants ? 'A' : '1'}>
            {preview.choices.map((choice) => (
              <li key={choice.id} className={styles.questionPreviewChoice}>
                <div className={styles.questionPreviewChoiceContent}>
                  {choice.content.trim() === '' ? (
                    <span className={styles.questionPreviewEmpty}>(empty choice)</span>
                  ) : (
                    <MarkdownPreview content={choice.content} />
                  )}
                </div>
                {choice.correct && !variants && <span className={styles.questionPreviewCorrect}>Correct</span>}
              </li>
            ))}
          </ol>
          {variants && (
            <div className={styles.variantAnswerKey}>
              <span className={styles.questionPreviewLabel}>Instructor answer key</span>
              <p className={styles.questionPreviewAnswer}>
                Correct choices:{' '}
                {preview.choices
                  .flatMap((choice, index) => (choice.correct ? [String.fromCharCode(65 + index)] : []))
                  .join(', ') || '—'}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className={variants ? styles.variantAnswerKey : undefined}>
          {variants && <span className={styles.questionPreviewLabel}>Instructor answer key</span>}
          <p className={styles.questionPreviewAnswer}>
            {preview.answer.mode === 'exact'
              ? `Expected answer: ${preview.answer.expected.trim() || '—'}`
              : `Accepted range: ${preview.answer.minimum.trim() || '—'}–${preview.answer.maximum.trim() || '—'}`}
          </p>
        </div>
      )}
    </section>
  );
}
