'use client';

import selectStyles from '@/app/components/Select/Select.module.css';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { generateClientId } from '@/lib/generateClientId';
import { questionVariables } from '@/app/utils/questionVariants';
import type { AuthoringVariant, ShortAnswerQuestion } from './types';
import QuestionPreview from './QuestionPreview';
import VariantActions from './VariantActions';
import styles from './QuestionBank.module.css';

const EMPTY_VARIANTS: AuthoringVariant[] = [];

function numberError(value: string) {
  return !value.trim() ? 'Required' : !Number.isFinite(Number(value)) ? 'Enter a number' : undefined;
}

export default function VariantsEditor({
  question,
  onChange,
  error,
}: {
  question: ShortAnswerQuestion;
  onChange: (question: ShortAnswerQuestion) => void;
  error?: string;
}) {
  const id = useId();
  const rows = question.variants ?? EMPTY_VARIANTS;
  const variables = questionVariables(question.prompt);
  const [selectedId, setSelectedId] = useState('');
  const activeId = rows.find((row) => row.id === selectedId)?.id ?? rows[0]?.id;
  const container = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef(false);
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    const activeRow = Array.from(container.current?.querySelectorAll('tr[data-variant-id]') ?? []).find(
      (row) => row.getAttribute('data-variant-id') === activeId
    );
    const target = activeRow?.querySelector<HTMLInputElement>('input') ?? addButton.current;
    target?.focus();
  }, [rows, activeId]);
  function update(rowId: string, patch: Partial<AuthoringVariant>) {
    onChange({ ...question, variants: rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)) });
  }
  function add(source?: AuthoringVariant) {
    const row = {
      id: generateClientId('variant'),
      values: source ? { ...source.values } : Object.fromEntries(variables.map((name) => [name, ''])),
      answer: source ? { ...source.answer } : { mode: 'exact' as const, expected: '' },
    };
    setSelectedId(row.id);
    pendingFocus.current = true;
    onChange({ ...question, variants: [...rows, row] });
  }
  function remove(rowId: string) {
    const index = rows.findIndex((row) => row.id === rowId);
    const remaining = rows.filter((row) => row.id !== rowId);
    setSelectedId(remaining[Math.min(index, remaining.length - 1)]?.id ?? '');
    pendingFocus.current = true;
    onChange({ ...question, variants: remaining });
  }
  const cellErrors = rows.map((row) => {
    const fields: Record<string, string | undefined> = Object.fromEntries(
      variables.map((name) => [
        `value:${name}`,
        !Object.hasOwn(row.values, name) || !row.values[name].trim() ? 'Required' : undefined,
      ])
    );
    if (row.answer.mode === 'exact') fields.answer = numberError(row.answer.expected);
    else {
      fields.minimum = numberError(row.answer.minimum);
      fields.maximum = numberError(row.answer.maximum);
      if (!fields.minimum && !fields.maximum && Number(row.answer.minimum) > Number(row.answer.maximum))
        fields.maximum = 'Must be ≥ minimum';
    }
    return fields;
  });
  const hasCellErrors = cellErrors.some((fields) => Object.values(fields).some(Boolean));
  function errorProps(index: number, field: string) {
    return {
      'aria-invalid': !!cellErrors[index][field],
      'aria-describedby': cellErrors[index][field] ? `${id}-${index}-${field}` : undefined,
      ...(cellErrors[index][field] === 'Required' ? { placeholder: 'Required' } : {}),
    };
  }
  function message(index: number, field: string) {
    return cellErrors[index][field] ? (
      <span
        id={`${id}-${index}-${field}`}
        className={cellErrors[index][field] === 'Required' ? styles.srOnly : styles.variantCellError}
      >
        {cellErrors[index][field]}
      </span>
    ) : null;
  }
  return (
    <div ref={container} className={styles.variantsEditor}>
      <div className={styles.variantsHeader}>
        <h3>
          Variants <span>· {rows.length}</span>
        </h3>
        <button
          ref={addButton}
          type="button"
          className={styles.toolbarBtn}
          aria-label="Add variant"
          onClick={() => add()}
        >
          + Add variant
        </button>
      </div>
      <p className={styles.variantsCaption}>Students receive one randomly selected variant per attempt.</p>
      <details className={styles.variantsHelp}>
        <summary>How variables work</summary>
        <p>
          Use placeholders such as <code>{'{{compound}}'}</code> and <code>{'{{mass}}'}</code> in the prompt. Fill in
          their values and an answer for each row. Names are case-sensitive, start with a letter, and may contain
          letters, numbers, and underscores.
        </p>
      </details>
      <div className={styles.variantsTableScroll}>
        <table className={styles.variantsTable} aria-label="Question variants">
          <thead>
            <tr>
              <th scope="col" className={styles.variantNumberColumn}>
                <span className={styles.srOnly}>Variant</span>#
              </th>
              {variables.map((name) => (
                <th scope="col" key={name}>
                  {name}
                </th>
              ))}
              <th scope="col">Answer</th>
              <th scope="col">
                <span className={styles.srOnly}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr>
                <td colSpan={variables.length + 3} className={styles.variantEmpty}>
                  Add a variant to enter values and an answer.
                </td>
              </tr>
            )}
            {rows.map((row, index) => (
              <tr
                key={row.id}
                data-variant-id={row.id}
                className={row.id === activeId ? styles.variantRowActive : undefined}
                onFocusCapture={() => setSelectedId(row.id)}
                onClick={() => setSelectedId(row.id)}
              >
                <th scope="row" className={styles.variantNumberColumn}>
                  <button
                    type="button"
                    className={styles.variantRowNumber}
                    aria-label={`Preview variant ${index + 1}`}
                    aria-pressed={row.id === activeId}
                    onClick={() => setSelectedId(row.id)}
                  >
                    {index + 1}
                  </button>
                </th>
                {variables.map((name) => (
                  <td key={name}>
                    <input
                      aria-label={`Variant ${index + 1} ${name}`}
                      {...errorProps(index, `value:${name}`)}
                      value={Object.hasOwn(row.values, name) ? row.values[name] : ''}
                      onChange={(event) => update(row.id, { values: { ...row.values, [name]: event.target.value } })}
                    />
                    {message(index, `value:${name}`)}
                  </td>
                ))}
                <td>
                  <div className={styles.variantAnswer}>
                    <select
                      className={`${selectStyles.control} ${selectStyles.compact}`}
                      aria-label={`Variant ${index + 1} answer type`}
                      value={row.answer.mode}
                      onChange={(event) =>
                        update(row.id, {
                          answer:
                            event.target.value === 'exact'
                              ? {
                                  mode: 'exact',
                                  expected: row.answer.mode === 'range' ? row.answer.minimum : row.answer.expected,
                                }
                              : {
                                  mode: 'range',
                                  minimum: row.answer.mode === 'exact' ? row.answer.expected : row.answer.minimum,
                                  maximum: row.answer.mode === 'exact' ? row.answer.expected : row.answer.maximum,
                                },
                        })
                      }
                    >
                      <option value="exact">Exact</option>
                      <option value="range">Range</option>
                    </select>
                    {row.answer.mode === 'exact' ? (
                      <div className={styles.variantAnswerField}>
                        <input
                          inputMode="decimal"
                          placeholder="Answer"
                          aria-label={`Variant ${index + 1} answer`}
                          {...errorProps(index, 'answer')}
                          value={row.answer.expected}
                          onChange={(event) =>
                            update(row.id, { answer: { mode: 'exact', expected: event.target.value } })
                          }
                        />
                        {message(index, 'answer')}
                      </div>
                    ) : (
                      <div className={styles.variantAnswerRange}>
                        <label>
                          Min
                          <input
                            inputMode="decimal"
                            aria-label={`Variant ${index + 1} minimum`}
                            {...errorProps(index, 'minimum')}
                            value={row.answer.minimum}
                            onChange={(event) =>
                              update(row.id, {
                                answer: {
                                  ...row.answer,
                                  mode: 'range',
                                  maximum: row.answer.mode === 'range' ? row.answer.maximum : '',
                                  minimum: event.target.value,
                                },
                              })
                            }
                          />
                          {message(index, 'minimum')}
                        </label>
                        <label>
                          Max
                          <input
                            inputMode="decimal"
                            aria-label={`Variant ${index + 1} maximum`}
                            {...errorProps(index, 'maximum')}
                            value={row.answer.maximum}
                            onChange={(event) =>
                              update(row.id, {
                                answer: {
                                  ...row.answer,
                                  mode: 'range',
                                  minimum: row.answer.mode === 'range' ? row.answer.minimum : '',
                                  maximum: event.target.value,
                                },
                              })
                            }
                          />
                          {message(index, 'maximum')}
                        </label>
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <VariantActions number={index + 1} onDuplicate={() => add(row)} onDelete={() => remove(row.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && (!hasCellErrors || !variables.length || !rows.length) && (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
      <QuestionPreview question={question} selectedVariantId={activeId} onSelectVariant={setSelectedId} />
    </div>
  );
}
