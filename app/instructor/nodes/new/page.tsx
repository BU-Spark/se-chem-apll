'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateClientId } from '@/lib/generateClientId';
import {
  combineTimestampParts,
  validateQuestionTimestamps,
  validateTimestampParts,
} from '@/app/utils/questionTimestamps';
import { validateMultipleChoiceAnswers } from '@/app/utils/multipleChoice';
import { validateShortAnswerOptions } from '@/app/utils/shortAnswer';
import styles from './page.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────

type QuestionType = 'multipleChoice' | 'shortAnswer';
type ShortAnswerMode = 'exact' | 'range';

interface McOptions {
  type: 'multipleChoice';
  choices: string[];
}

type ShortAnswerOptions =
  | { type: 'shortAnswer'; answerMode: 'exact'; expectedAnswer: number }
  | { type: 'shortAnswer'; answerMode: 'range'; minimumAnswer: number; maximumAnswer: number };

interface Question {
  id: string;
  prompt: string;
  questionType: QuestionType;
  isPreLecture: boolean;
  // multiple choice
  choices: string[];
  correctIndices: number[];
  // short answer
  answerMode: ShortAnswerMode;
  expectedAnswer: string;
  minimumAnswer: string;
  maximumAnswer: string;

  // Checkpoint timestamp inputs; pre-lecture questions leave these blank.
  timestampMinutes: string;
  timestampSeconds: string;
}

function makeQuestion(isPreLecture = false, id = generateClientId('question')): Question {
  return {
    id,
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

function serializeOptions(q: Question): McOptions | ShortAnswerOptions {
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function NewNodePage() {
  const router = useRouter();
  const initialPreLectureQuestionId = useId();
  const initialCheckpointQuestionId = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Core fields
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  // Pre-lecture quiz
  const [hasPreLecture, setHasPreLecture] = useState(false);
  const [preLectureQuestions, setPreLectureQuestions] = useState<Question[]>(() => [
    makeQuestion(true, initialPreLectureQuestionId),
  ]);

  // Checkpoint questions
  const [checkpointQuestions, setCheckpointQuestions] = useState<Question[]>(() => [
    makeQuestion(false, initialCheckpointQuestionId),
  ]);

  // ── Question helpers ──────────────────────────────────────────────────────

  function updateQuestion(list: Question[], setList: (q: Question[]) => void, id: string, patch: Partial<Question>) {
    setList(list.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function addQuestion(list: Question[], setList: (q: Question[]) => void, isPreLecture: boolean) {
    setList([...list, makeQuestion(isPreLecture)]);
  }

  function removeQuestion(list: Question[], setList: (q: Question[]) => void, id: string) {
    setList(list.filter((q) => q.id !== id));
  }

  function updateChoice(
    list: Question[],
    setList: (q: Question[]) => void,
    qId: string,
    choiceIdx: number,
    value: string
  ) {
    setList(
      list.map((q) => {
        if (q.id !== qId) return q;
        const choices = [...q.choices];
        choices[choiceIdx] = value;
        return { ...q, choices };
      })
    );
  }

  function addChoice(list: Question[], setList: (q: Question[]) => void, qId: string) {
    setList(list.map((q) => (q.id === qId ? { ...q, choices: [...q.choices, ''] } : q)));
  }

  function removeChoice(list: Question[], setList: (q: Question[]) => void, qId: string, choiceIdx: number) {
    setList(
      list.map((q) => {
        if (q.id !== qId) return q;
        const choices = q.choices.filter((_, i) => i !== choiceIdx);
        const correctIndices = q.correctIndices
          .filter((index) => index !== choiceIdx)
          .map((index) => (index > choiceIdx ? index - 1 : index));
        return { ...q, choices, correctIndices };
      })
    );
  }

  // ── Submit ────────────────────────────────────────────────────────────────

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
      const res = await fetch('/api/instructor/nodes', {
        method: 'POST',
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>New node</h1>
        <p className={styles.pageSubtitle}>
          Nodes are reusable video + question bundles that instructors drop into lessons.
        </p>
      </header>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* ── Core info ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Basic info</h2>
          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Title <span className={styles.required}>*</span>
              </span>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bunsen Burner Ignition"
              />
            </label>
            <label className={styles.field}>
              Summary
              <input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="One-line description shown in the node library"
              />
            </label>
          </div>
          <label className={styles.field}>
            Video URL
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
            />
          </label>
        </section>

        {/* ── Pre-lecture quiz ── */}
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
              {preLectureQuestions.map((q, qIdx) => (
                <QuestionEditor
                  key={q.id}
                  q={q}
                  index={qIdx}
                  onUpdate={(patch) => updateQuestion(preLectureQuestions, setPreLectureQuestions, q.id, patch)}
                  onRemove={() => removeQuestion(preLectureQuestions, setPreLectureQuestions, q.id)}
                  onUpdateChoice={(ci, v) => updateChoice(preLectureQuestions, setPreLectureQuestions, q.id, ci, v)}
                  onAddChoice={() => addChoice(preLectureQuestions, setPreLectureQuestions, q.id)}
                  onRemoveChoice={(ci) => removeChoice(preLectureQuestions, setPreLectureQuestions, q.id, ci)}
                  canRemove={preLectureQuestions.length > 1}
                />
              ))}
              <button
                type="button"
                className={styles.addQuestionBtn}
                onClick={() => addQuestion(preLectureQuestions, setPreLectureQuestions, true)}
              >
                + Add pre-lecture question
              </button>
            </div>
          )}
        </section>

        {/* ── Checkpoint questions ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Checkpoint questions</h2>
          <p className={styles.sectionNote}>These appear as embedded questions during the video playback.</p>
          <div className={styles.questionList}>
            {checkpointQuestions.map((q, qIdx) => (
              <QuestionEditor
                key={q.id}
                q={q}
                index={qIdx}
                onUpdate={(patch) => updateQuestion(checkpointQuestions, setCheckpointQuestions, q.id, patch)}
                onRemove={() => removeQuestion(checkpointQuestions, setCheckpointQuestions, q.id)}
                onUpdateChoice={(ci, v) => updateChoice(checkpointQuestions, setCheckpointQuestions, q.id, ci, v)}
                onAddChoice={() => addChoice(checkpointQuestions, setCheckpointQuestions, q.id)}
                onRemoveChoice={(ci) => removeChoice(checkpointQuestions, setCheckpointQuestions, q.id, ci)}
                canRemove={checkpointQuestions.length > 1}
              />
            ))}
            <button
              type="button"
              className={styles.addQuestionBtn}
              onClick={() => addQuestion(checkpointQuestions, setCheckpointQuestions, false)}
            >
              + Add checkpoint question
            </button>
          </div>
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <a href="/instructor/nodes" className={styles.cancelLink}>
            Cancel
          </a>
          <button type="submit" className={styles.submitBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Create node'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── QuestionEditor sub-component ─────────────────────────────────────────────

interface QuestionEditorProps {
  q: Question;
  index: number;
  onUpdate: (patch: Partial<Question>) => void;
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
