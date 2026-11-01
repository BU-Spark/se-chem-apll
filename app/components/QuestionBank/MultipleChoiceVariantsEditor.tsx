'use client';

import { useId, useState, useLayoutEffect, useRef } from 'react';
import { generateClientId } from '@/lib/generateClientId';
import { questionVariables, type MultipleChoiceVariant } from '@/app/utils/questionVariants';
import { duplicateMultipleChoiceVariant, MAX_CHOICES, MIN_CHOICES, type MultipleChoiceQuestion } from './types';
import MarkdownField from './MarkdownField';
import MarkdownPreview from './MarkdownPreview';
import QuestionPreview from './QuestionPreview';
import VariantActions from './VariantActions';
import styles from './QuestionBank.module.css';

function variableNames(prompt: string, row: MultipleChoiceVariant) {
  return questionVariables([prompt, ...(row.answer.choices ?? []).map((c) => c.content)].join('\n'));
}
function errorCount(prompt: string, row: MultipleChoiceVariant) {
  const choices = row.answer.choices ?? [];
  return (
    variableNames(prompt, row).filter((name) => !Object.hasOwn(row.values, name) || !row.values[name].trim()).length +
    choices.filter((c) => !c.content.trim()).length +
    Number(choices.length < MIN_CHOICES || choices.length > MAX_CHOICES) +
    Number(
      !row.answer.correctChoiceIds.length || row.answer.correctChoiceIds.some((id) => !choices.some((c) => c.id === id))
    )
  );
}

export default function MultipleChoiceVariantsEditor({
  question,
  onChange,
  error,
}: {
  question: MultipleChoiceQuestion;
  onChange: (question: MultipleChoiceQuestion) => void;
  error?: string;
}) {
  const rows = question.variants ?? [];
  const [selected, setSelected] = useState<string | null | undefined>();
  const active = selected === null ? undefined : (rows.find((row) => row.id === selected) ?? rows[0]);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const focusHeader = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (focusHeader.current === null) return;
    const target = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-variant-toggle]') ?? []).find(
      (button) => button.dataset.variantToggle === focusHeader.current
    );
    (target ?? addRef.current)?.focus();
    focusHeader.current = null;
  }, [rows.length, active?.id]);
  function update(row: MultipleChoiceVariant) {
    onChange({ ...question, variants: rows.map((r) => (r.id === row.id ? row : r)) });
  }
  function add(source?: MultipleChoiceVariant) {
    const row: MultipleChoiceVariant = source
      ? duplicateMultipleChoiceVariant(source)
      : {
          id: generateClientId('variant'),
          values: {},
          answer: {
            type: 'multipleChoice',
            choices: Array.from({ length: 2 }, () => ({ id: generateClientId('choice'), content: '' })),
            correctChoiceIds: [],
          },
        };
    setSelected(row.id);
    focusHeader.current = row.id;
    onChange({ ...question, variants: [...rows, row] });
  }
  function remove(rowId: string) {
    const remaining = rows.filter((row) => row.id !== rowId);
    const next =
      remaining[
        Math.min(
          rows.findIndex((row) => row.id === rowId),
          remaining.length - 1
        )
      ];
    if (active?.id === rowId) setSelected(next?.id ?? null);
    focusHeader.current = next?.id ?? '';
    onChange({ ...question, variants: remaining });
  }
  return (
    <div ref={root} className={styles.variantsEditor}>
      <div className={styles.variantsHeader}>
        <h3>
          Variants <span>· {rows.length}</span>
        </h3>
        <button ref={addRef} type="button" className={styles.toolbarBtn} onClick={() => add()}>
          + Add variant
        </button>
      </div>
      <details className={styles.variantsHelp}>
        <summary>How variants work</summary>
        <p>
          Students receive one randomly selected variant per attempt. Each variant has its own choices and correct
          answers. Use placeholders such as {'{{compound}}'} in the prompt or choices, and fill in their values below.
        </p>
      </details>
      <div className={styles.mcAccordion} aria-label="Question variants">
        {rows.map((row, index) => {
          const expanded = active?.id === row.id;
          const count = errorCount(question.prompt, row);
          const summary = variableNames(question.prompt, row)
            .filter((name) => Object.hasOwn(row.values, name))
            .map((name) => row.values[name])
            .filter(Boolean)
            .join(' · ');
          return (
            <div key={row.id} className={styles.mcAccordionItem}>
              <div className={styles.mcAccordionHeader}>
                <button
                  type="button"
                  id={`${id}-${row.id}-toggle`}
                  data-variant-toggle={row.id}
                  aria-expanded={expanded}
                  aria-controls={`${id}-${row.id}-panel`}
                  className={styles.mcAccordionToggle}
                  onClick={() => setSelected(expanded ? null : row.id)}
                >
                  <strong>Variant {index + 1}</strong>
                  {summary && (
                    <span className={styles.mcAccordionSummary}>
                      <MarkdownPreview disableLinks content={summary} />
                    </span>
                  )}
                  <span className={styles.mcAccordionCounts}>
                    {row.answer.choices?.length ?? 0} choices · {row.answer.correctChoiceIds.length} correct
                  </span>
                  {count > 0 && (
                    <span className={styles.mcAccordionErrors}>
                      {count} {count === 1 ? 'error' : 'errors'}
                    </span>
                  )}
                  <span aria-hidden="true">{expanded ? '−' : '+'}</span>
                </button>
                <VariantActions number={index + 1} onDuplicate={() => add(row)} onDelete={() => remove(row.id)} />
              </div>
              <div
                id={`${id}-${row.id}-panel`}
                role="region"
                aria-labelledby={`${id}-${row.id}-toggle`}
                hidden={!expanded}
              >
                {expanded && <VariantPanel key={row.id} question={question} row={row} index={index} update={update} />}
              </div>
            </div>
          );
        })}
      </div>
      {!rows.length && <p className={styles.variantEmpty}>Add a variant to get started.</p>}
      {error && !rows.some((row) => errorCount(question.prompt, row)) && (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function VariantPanel({
  question,
  row,
  index,
  update,
}: {
  question: MultipleChoiceQuestion;
  row: MultipleChoiceVariant;
  index: number;
  update: (row: MultipleChoiceVariant) => void;
}) {
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [editing, setEditing] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const focusChoice = useRef<string | null>(null);
  const choices = row.answer.choices ?? [];
  const variables = variableNames(question.prompt, row);
  const id = useId();
  useLayoutEffect(() => {
    if (!focusChoice.current) return;
    const target = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-choice-edit]') ?? []).find(
      (el) => el.dataset.choiceEdit === focusChoice.current
    );
    target?.focus();
    focusChoice.current = null;
  }, [editing, choices.length]);
  function move(i: number, direction: number) {
    const next = [...choices];
    [next[i], next[i + direction]] = [next[i + direction], next[i]];
    update({ ...row, answer: { ...row.answer, choices: next } });
  }
  return (
    <div ref={root} className={styles.mcAccordionBody}>
      <div className={styles.mcVariantView}>
        <div className={styles.segmented} role="group" aria-label={`Variant ${index + 1} view`}>
          <button
            type="button"
            className={view === 'edit' ? styles.segmentActive : styles.segment}
            aria-pressed={view === 'edit'}
            onClick={() => setView('edit')}
          >
            Edit
          </button>
          <button
            type="button"
            className={view === 'preview' ? styles.segmentActive : styles.segment}
            aria-pressed={view === 'preview'}
            onClick={() => setView('preview')}
          >
            Preview
          </button>
        </div>
      </div>
      {view === 'preview' ? (
        <QuestionPreview question={question} selectedVariantId={row.id} showVariantNavigation={false} />
      ) : (
        <>
          {variables.length > 0 && (
            <div className={styles.mcVariantVariables}>
              {variables.map((name) => {
                const value = Object.hasOwn(row.values, name) ? row.values[name] : '';
                return (
                  <label key={name}>
                    {name}
                    <input
                      aria-label={`Variant ${index + 1} ${name}`}
                      value={value}
                      placeholder={!value.trim() ? 'Required' : undefined}
                      aria-invalid={!value.trim()}
                      aria-describedby={!value.trim() ? `${id}-${name}` : undefined}
                      onChange={(e) => update({ ...row, values: { ...row.values, [name]: e.target.value } })}
                    />
                    {!value.trim() && (
                      <span className={styles.srOnly} id={`${id}-${name}`}>
                        Required
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
          <p className={styles.choiceEditorLabel}>Check every correct answer. Click a choice to edit.</p>
          <div className={styles.mcCompactChoices}>
            {choices.map((choice, i) => (
              <div key={choice.id} className={styles.mcCompactChoice}>
                <input
                  type="checkbox"
                  className={styles.mcChoiceCheckbox}
                  aria-label={`Variant ${index + 1} choice ${i + 1} is correct`}
                  checked={row.answer.correctChoiceIds.includes(choice.id)}
                  onChange={(e) =>
                    update({
                      ...row,
                      answer: {
                        ...row.answer,
                        correctChoiceIds: e.target.checked
                          ? [...row.answer.correctChoiceIds, choice.id]
                          : row.answer.correctChoiceIds.filter((id) => id !== choice.id),
                      },
                    })
                  }
                />
                <span className={styles.mcChoiceLetter} aria-hidden="true">
                  {String.fromCharCode(65 + i)}
                </span>
                <div className={styles.choiceEditorField}>
                  {editing === choice.id ? (
                    <>
                      <MarkdownField
                        label={`Variant ${index + 1} choice ${i + 1}`}
                        hideLabel
                        autoFocus
                        compact
                        value={choice.content}
                        placeholder="Enter an answer choice"
                        error={!choice.content.trim() ? 'Choice text is required.' : undefined}
                        onChange={(content) =>
                          update({
                            ...row,
                            answer: {
                              ...row.answer,
                              choices: choices.map((c) => (c.id === choice.id ? { ...c, content } : c)),
                            },
                          })
                        }
                      />
                      <button
                        type="button"
                        className={styles.mcChoiceDone}
                        onClick={() => {
                          focusChoice.current = choice.id;
                          setEditing(null);
                        }}
                      >
                        Done
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.mcChoiceContent}
                      data-choice-edit={choice.id}
                      aria-label={`Edit variant ${index + 1} choice ${i + 1}`}
                      onClick={() => setEditing(choice.id)}
                    >
                      {choice.content.trim() ? (
                        <MarkdownPreview disableLinks content={choice.content} />
                      ) : (
                        <span className={styles.mcAccordionErrors}>Required</span>
                      )}
                    </button>
                  )}
                </div>
                <div className={styles.choiceEditorActions}>
                  <button
                    type="button"
                    aria-label={`Move choice ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move choice ${i + 1} down`}
                    disabled={i === choices.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove choice ${i + 1}`}
                    disabled={choices.length <= MIN_CHOICES}
                    onClick={() => {
                      const remaining = choices.filter((c) => c.id !== choice.id);
                      focusChoice.current = remaining[Math.min(i, remaining.length - 1)]?.id ?? null;
                      setEditing(null);
                      update({
                        ...row,
                        answer: {
                          ...row.answer,
                          choices: remaining,
                          correctChoiceIds: row.answer.correctChoiceIds.filter((id) => id !== choice.id),
                        },
                      });
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          {choices.length < MAX_CHOICES && (
            <button
              type="button"
              className={styles.mcAddChoice}
              onClick={() => {
                const choice = { id: generateClientId('choice'), content: '' };
                update({ ...row, answer: { ...row.answer, choices: [...choices, choice] } });
                setEditing(choice.id);
              }}
            >
              + Add choice
            </button>
          )}
          {!row.answer.correctChoiceIds.length && (
            <p className={styles.fieldError}>Select at least one correct choice for this variant.</p>
          )}
        </>
      )}
    </div>
  );
}
