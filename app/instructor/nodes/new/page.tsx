'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateClientId } from '@/lib/generateClientId';
import { combineTimestampParts, validateQuestionTimestamps } from '@/app/utils/questionTimestamps';
import styles from './page.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────

type QuestionType = 'multipleChoice' | 'shortAnswer';

interface McOptions {
  type: 'multipleChoice';
  choices: string[];
}

interface ShortAnswerOptions {
  type: 'shortAnswer';
  expectedAnswer: number;
  tolerancePercent: number;
}

interface Question {
  id: string;
  prompt: string;
  questionType: QuestionType;
  isPreLecture: boolean;
  // multiple choice
  choices: string[];
  correctIndex: number | null;
  // short answer
  expectedAnswer: string;
  tolerancePercent: string;

  // Checkpoint timestamp inputs; pre-lecture questions leave these blank.
  timestampMinutes: string;
  timestampSeconds: string;
}

function makeQuestion(isPreLecture = false): Question {
  return {
    id: generateClientId('question'),
    prompt: '',
    questionType: 'multipleChoice',
    isPreLecture,
    choices: ['', ''],
    correctIndex: null,
    expectedAnswer: '',
    tolerancePercent: '5',
    timestampMinutes: '',
    timestampSeconds: '',
  };
}

function serializeOptions(q: Question): McOptions | ShortAnswerOptions {
  if (q.questionType === 'multipleChoice') {
    return { type: 'multipleChoice', choices: q.choices };
  }
  return {
    type: 'shortAnswer',
    expectedAnswer: Number(q.expectedAnswer),
    tolerancePercent: Number(q.tolerancePercent),
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NewNodePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Core fields
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  // Pre-lecture quiz
  const [hasPreLecture, setHasPreLecture] = useState(false);
  const [preLectureQuestions, setPreLectureQuestions] = useState<Question[]>([makeQuestion(true)]);

  // Checkpoint questions
  const [checkpointQuestions, setCheckpointQuestions] = useState<Question[]>([makeQuestion(false)]);

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
        const correctIndex =
          q.correctIndex === choiceIdx
            ? null
            : q.correctIndex !== null && q.correctIndex > choiceIdx
              ? q.correctIndex - 1
              : q.correctIndex;
        return { ...q, choices, correctIndex };
      })
    );
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const allQuestions = [...(hasPreLecture ? preLectureQuestions : []), ...checkpointQuestions].map((q, idx) => ({
      sortOrder: idx,
      prompt: q.prompt,
      options: serializeOptions(q),
      correctIndex: q.questionType === 'multipleChoice' ? q.correctIndex : null,
      isPreLecture: q.isPreLecture,
      timeOffsetSeconds: q.isPreLecture ? null : combineTimestampParts(q.timestampMinutes, q.timestampSeconds),
    }));

    const timestampError = validateQuestionTimestamps(allQuestions);
    if (timestampError) {
      setError(timestampError);
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
              onChange={(e) => onUpdate({ questionType: e.target.value as QuestionType, correctIndex: null })}
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
          <span className={styles.timestampLabel}>
            Video timestamp <span className={styles.required}>*</span>
          </span>
          <label className={styles.field}>
            Minutes
            <input
              type="number"
              min={0}
              step={1}
              required
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
              required
              value={q.timestampSeconds}
              onChange={(e) => onUpdate({ timestampSeconds: e.target.value })}
              placeholder="00"
            />
          </label>
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
          <p className={styles.choiceLabel}>Answer choices (select the correct one)</p>
          {q.choices.map((choice, ci) => (
            <div key={ci} className={styles.choiceRow}>
              <input
                type="radio"
                name={`correct-${q.id}`}
                checked={q.correctIndex === ci}
                onChange={() => onUpdate({ correctIndex: ci })}
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
          {q.choices.length < 6 && (
            <button type="button" className={styles.addChoiceBtn} onClick={onAddChoice}>
              + Add choice
            </button>
          )}
        </div>
      ) : (
        <div className={styles.fieldRow}>
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
          <label className={styles.field}>
            Tolerance (%)
            <input
              type="number"
              min={0}
              max={100}
              required
              value={q.tolerancePercent}
              onChange={(e) => onUpdate({ tolerancePercent: e.target.value })}
              placeholder="5"
            />
          </label>
        </div>
      )}
    </div>
  );
}
