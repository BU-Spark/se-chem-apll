'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Node, NodeQuestion } from '@prisma/client';
import { generateClientId } from '@/lib/generateClientId';
import {
  combineTimestampParts,
  splitTimeOffsetSeconds,
  validateQuestionTimestamps,
  validateTimestampParts,
} from '@/app/utils/questionTimestamps';
import { getMultipleChoiceChoices, validateMultipleChoiceAnswers } from '@/app/utils/multipleChoice';
import { parseShortAnswerOptions, validateShortAnswerOptions } from '@/app/utils/shortAnswer';
import styles from '../../new/page.module.css';

type QuestionType = 'multipleChoice' | 'shortAnswer';
type ShortAnswerMode = 'exact' | 'range';

interface LocalQuestion {
  id: string;
  dbId: string | null;
  prompt: string;
  questionType: QuestionType;
  isPreLecture: boolean;
  choices: string[];
  correctIndices: number[];
  answerMode: ShortAnswerMode;
  expectedAnswer: string;
  minimumAnswer: string;
  maximumAnswer: string;
  timestampMinutes: string;
  timestampSeconds: string;
}

function dbQuestionToLocal(q: NodeQuestion): LocalQuestion {
  const shortAnswer = parseShortAnswerOptions(q.options);
  const isShortAnswer = shortAnswer !== null;
  const timestamp = splitTimeOffsetSeconds(q.timeOffsetSeconds);
  return {
    id: q.id,
    dbId: q.id,
    prompt: q.prompt,
    questionType: isShortAnswer ? 'shortAnswer' : 'multipleChoice',
    isPreLecture: q.isPreLecture,
    choices: isShortAnswer ? [] : (getMultipleChoiceChoices(q.options) ?? []),
    correctIndices: q.correctIndices,
    answerMode: shortAnswer?.answerMode ?? 'exact',
    expectedAnswer: shortAnswer?.answerMode === 'exact' ? String(shortAnswer.expectedAnswer) : '',
    minimumAnswer: shortAnswer?.answerMode === 'range' ? String(shortAnswer.minimumAnswer) : '',
    maximumAnswer: shortAnswer?.answerMode === 'range' ? String(shortAnswer.maximumAnswer) : '',
    timestampMinutes: timestamp.minutes,
    timestampSeconds: timestamp.seconds,
  };
}

function makeQuestion(isPreLecture = false, id = generateClientId('question')): LocalQuestion {
  return {
    id,
    dbId: null,
    prompt: '',
    questionType: 'multipleChoice',
    isPreLecture,
    choices: ['', ''],
    correctIndices: [],
    answerMode: 'exact',
    expectedAnswer: '',
    minimumAnswer: '',
    maximumAnswer: '',
    timestampMinutes: '',
    timestampSeconds: '',
  };
}

function serializeOptions(q: LocalQuestion) {
  if (q.questionType === 'multipleChoice') {
    return { type: 'multipleChoice', choices: q.choices };
  }
  if (q.answerMode === 'exact') {
    return {
      type: 'shortAnswer',
      answerMode: 'exact',
      expectedAnswer: q.expectedAnswer.trim() === '' ? Number.NaN : Number(q.expectedAnswer),
    };
  }
  return {
    type: 'shortAnswer',
    answerMode: 'range',
    minimumAnswer: q.minimumAnswer.trim() === '' ? Number.NaN : Number(q.minimumAnswer),
    maximumAnswer: q.maximumAnswer.trim() === '' ? Number.NaN : Number(q.maximumAnswer),
  };
}

interface Props {
  node: Node & { questions: NodeQuestion[] };
}

export default function NodeEditForm({ node }: Props) {
  const router = useRouter();
  const initialPreLectureQuestionId = useId();
  const initialCheckpointQuestionId = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(node.title);
  const [summary, setSummary] = useState(node.summary ?? '');
  const [videoUrl, setVideoUrl] = useState(node.videoUrl ?? '');

  const existingPre = node.questions.filter((q) => q.isPreLecture).map(dbQuestionToLocal);
  const existingCheckpoint = node.questions.filter((q) => !q.isPreLecture).map(dbQuestionToLocal);

  const [hasPreLecture, setHasPreLecture] = useState(existingPre.length > 0);
  const [preLectureQuestions, setPreLectureQuestions] = useState<LocalQuestion[]>(
    existingPre.length > 0 ? existingPre : [makeQuestion(true, initialPreLectureQuestionId)]
  );
  const [checkpointQuestions, setCheckpointQuestions] = useState<LocalQuestion[]>(
    existingCheckpoint.length > 0 ? existingCheckpoint : [makeQuestion(false, initialCheckpointQuestionId)]
  );

  function updateQ(
    list: LocalQuestion[],
    setList: (q: LocalQuestion[]) => void,
    id: string,
    patch: Partial<LocalQuestion>
  ) {
    setList(list.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }
  function addQ(list: LocalQuestion[], setList: (q: LocalQuestion[]) => void, isPreLecture: boolean) {
    setList([...list, makeQuestion(isPreLecture)]);
  }
  function removeQ(list: LocalQuestion[], setList: (q: LocalQuestion[]) => void, id: string) {
    setList(list.filter((q) => q.id !== id));
  }
  function updateChoice(
    list: LocalQuestion[],
    setList: (q: LocalQuestion[]) => void,
    qId: string,
    ci: number,
    val: string
  ) {
    setList(
      list.map((q) => {
        if (q.id !== qId) return q;
        const choices = [...q.choices];
        choices[ci] = val;
        return { ...q, choices };
      })
    );
  }
  function addChoice(list: LocalQuestion[], setList: (q: LocalQuestion[]) => void, qId: string) {
    setList(list.map((q) => (q.id === qId ? { ...q, choices: [...q.choices, ''] } : q)));
  }
  function removeChoice(list: LocalQuestion[], setList: (q: LocalQuestion[]) => void, qId: string, ci: number) {
    setList(
      list.map((q) => {
        if (q.id !== qId) return q;
        const choices = q.choices.filter((_, i) => i !== ci);
        const correctIndices = q.correctIndices
          .filter((index) => index !== ci)
          .map((index) => (index > ci ? index - 1 : index));
        return { ...q, choices, correctIndices };
      })
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const timestampPartsError =
      checkpointQuestions
        .map((q) => validateTimestampParts(q.timestampMinutes, q.timestampSeconds))
        .find((timestampError) => timestampError !== null) ?? null;
    if (timestampPartsError) {
      setError(timestampPartsError);
      return;
    }

    const allQuestions = [...(hasPreLecture ? preLectureQuestions : []), ...checkpointQuestions].map((q, idx) => ({
      sortOrder: idx,
      prompt: q.prompt,
      options: serializeOptions(q),
      correctIndices: q.questionType === 'multipleChoice' ? q.correctIndices : [],
      isPreLecture: q.isPreLecture,
      timeOffsetSeconds: q.isPreLecture ? null : combineTimestampParts(q.timestampMinutes, q.timestampSeconds),
    }));

    const timestampError = validateQuestionTimestamps(allQuestions);
    if (timestampError) {
      setError(timestampError);
      return;
    }

    const correctAnswersError = validateMultipleChoiceAnswers(allQuestions);
    if (correctAnswersError) {
      setError(correctAnswersError);
      return;
    }

    const shortAnswerError = validateShortAnswerOptions(allQuestions);
    if (shortAnswerError) {
      setError(shortAnswerError);
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`/api/instructor/nodes/${node.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          summary,
          videoUrl: videoUrl || null,
          questions: allQuestions,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      router.push('/instructor/nodes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this node? It will be removed from all lessons that use it.')) return;
    const res = await fetch(`/api/instructor/nodes/${node.id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/instructor/nodes');
    } else {
      setError('Failed to delete node');
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Edit node</h1>
      </header>

      <form onSubmit={handleSubmit} className={styles.form}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Basic info</h2>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Title <span className={styles.required}>*</span>
              </span>
              <input required value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className={styles.field}>
              Summary
              <input value={summary} onChange={(e) => setSummary(e.target.value)} />
            </label>
          </div>
          <label className={styles.field}>
            Video URL
            <input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
          </label>
        </section>

        <section className={styles.section}>
          <div className={styles.toggleRow}>
            <h2 className={styles.sectionTitle}>Pre-lecture quiz</h2>
            <label className={styles.toggle}>
              <input type="checkbox" checked={hasPreLecture} onChange={(e) => setHasPreLecture(e.target.checked)} />
              <span>Include pre-lecture quiz</span>
            </label>
          </div>
          {hasPreLecture && (
            <div className={styles.questionList}>
              {preLectureQuestions.map((q, idx) => (
                <QuestionEditor
                  key={q.id}
                  q={q}
                  index={idx}
                  onUpdate={(p) => updateQ(preLectureQuestions, setPreLectureQuestions, q.id, p)}
                  onRemove={() => removeQ(preLectureQuestions, setPreLectureQuestions, q.id)}
                  onUpdateChoice={(ci, v) => updateChoice(preLectureQuestions, setPreLectureQuestions, q.id, ci, v)}
                  onAddChoice={() => addChoice(preLectureQuestions, setPreLectureQuestions, q.id)}
                  onRemoveChoice={(ci) => removeChoice(preLectureQuestions, setPreLectureQuestions, q.id, ci)}
                  canRemove={preLectureQuestions.length > 1}
                />
              ))}
              <button
                type="button"
                className={styles.addQuestionBtn}
                onClick={() => addQ(preLectureQuestions, setPreLectureQuestions, true)}
              >
                + Add pre-lecture question
              </button>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Checkpoint questions</h2>
          <div className={styles.questionList}>
            {checkpointQuestions.map((q, idx) => (
              <QuestionEditor
                key={q.id}
                q={q}
                index={idx}
                onUpdate={(p) => updateQ(checkpointQuestions, setCheckpointQuestions, q.id, p)}
                onRemove={() => removeQ(checkpointQuestions, setCheckpointQuestions, q.id)}
                onUpdateChoice={(ci, v) => updateChoice(checkpointQuestions, setCheckpointQuestions, q.id, ci, v)}
                onAddChoice={() => addChoice(checkpointQuestions, setCheckpointQuestions, q.id)}
                onRemoveChoice={(ci) => removeChoice(checkpointQuestions, setCheckpointQuestions, q.id, ci)}
                canRemove={checkpointQuestions.length > 1}
              />
            ))}
            <button
              type="button"
              className={styles.addQuestionBtn}
              onClick={() => addQ(checkpointQuestions, setCheckpointQuestions, false)}
            >
              + Add checkpoint question
            </button>
          </div>
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button
            type="button"
            onClick={handleDelete}
            style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}
          >
            Delete node
          </button>
          <a href="/instructor/nodes" className={styles.cancelLink}>
            Cancel
          </a>
          <button type="submit" className={styles.submitBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── QuestionEditor (shared with create form) ──────────────────────────────────

interface QuestionEditorProps {
  q: LocalQuestion;
  index: number;
  onUpdate: (patch: Partial<LocalQuestion>) => void;
  onRemove: () => void;
  onUpdateChoice: (idx: number, value: string) => void;
  onAddChoice: () => void;
  onRemoveChoice: (idx: number) => void;
  canRemove: boolean;
}

function QuestionEditor({
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
      {!q.isPreLecture && (
        <div className={styles.timestampFields}>
          <span className={styles.timestampLabel}>Video timestamp (optional)</span>
          <label className={styles.field}>
            Minutes
            <input
              type="number"
              min={0}
              step={1}
              value={q.timestampMinutes}
              onChange={(e) => onUpdate({ timestampMinutes: e.target.value })}
              placeholder="0"
            />
          </label>
          <label className={styles.field}>
            Seconds
            <input
              type="number"
              min={0}
              max={59}
              step={1}
              value={q.timestampSeconds}
              onChange={(e) => onUpdate({ timestampSeconds: e.target.value })}
              placeholder="00"
            />
          </label>
          <span className={styles.timestampHelp}>Leave blank to show this question after the video.</span>
        </div>
      )}
      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          Question prompt <span className={styles.required}>*</span>
        </span>
        <textarea required rows={2} value={q.prompt} onChange={(e) => onUpdate({ prompt: e.target.value })} />
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
                />
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
