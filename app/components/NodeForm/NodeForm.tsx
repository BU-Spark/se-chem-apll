'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatTimeOffsetSeconds, validateCheckpointTimestamps } from '@/app/utils/questionTimestamps';
import { validateMultipleChoiceAnswers } from '@/app/utils/multipleChoice';
import { validateShortAnswerOptions } from '@/app/utils/shortAnswer';
import { parseYouTubeId } from '@/app/utils/youtube';
import QuestionBankEditor from '@/app/components/QuestionBank/QuestionBankEditor';
import MarkdownPreview from '@/app/components/QuestionBank/MarkdownPreview';
import { authoringQuestionToPayload, dbQuestionToAuthoring } from '@/app/components/QuestionBank/adapters';
import { countIssuesBySeverity, validateQuestionBank } from '@/app/components/QuestionBank/validation';
import type { AuthoringQuestion } from '@/app/components/QuestionBank/types';
import QuestionEditor from './QuestionEditor';
import YouTubeAuthoringPlayer, { type YTPlayer } from './YouTubeAuthoringPlayer';
import {
  dbQuestionToForm,
  makeCheckpoint,
  makeLearningObjective,
  makeQuestion,
  serializeQuestionOptions,
  type FormCheckpoint,
  type FormQuestion,
  type NodeFormInitial,
} from './types';
import styles from './NodeForm.module.css';

type Mode = 'create' | 'edit';
type WizardStep = 'basics' | 'checkpoints' | 'quiz' | 'review' | 'done';

type Props = {
  mode: Mode;
  nodeId?: string;
  initial?: NodeFormInitial;
};

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 'basics', label: 'Basics' },
  { id: 'checkpoints', label: 'Checkpoints' },
  { id: 'quiz', label: 'Quiz bank' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
];

function stepIndex(step: WizardStep): number {
  return STEPS.findIndex((s) => s.id === step);
}

function updateQuestionInList(list: FormQuestion[], id: string, patch: Partial<FormQuestion>): FormQuestion[] {
  return list.map((q) => (q.id === id ? { ...q, ...patch } : q));
}

function updateChoiceInList(list: FormQuestion[], qId: string, choiceIdx: number, value: string): FormQuestion[] {
  return list.map((q) => {
    if (q.id !== qId) return q;
    const choices = [...q.choices];
    choices[choiceIdx] = value;
    return { ...q, choices };
  });
}

function addChoiceInList(list: FormQuestion[], qId: string): FormQuestion[] {
  return list.map((q) => (q.id === qId ? { ...q, choices: [...q.choices, ''] } : q));
}

function removeChoiceInList(list: FormQuestion[], qId: string, choiceIdx: number): FormQuestion[] {
  return list.map((q) => {
    if (q.id !== qId) return q;
    const choices = q.choices.filter((_, i) => i !== choiceIdx);
    const correctIndices = q.correctIndices
      .filter((index) => index !== choiceIdx)
      .map((index) => (index > choiceIdx ? index - 1 : index));
    return { ...q, choices, correctIndices };
  });
}

function buildCheckpointPayload(checkpoints: FormCheckpoint[]) {
  return checkpoints.map((checkpoint, idx) => ({
    sortOrder: idx,
    timeOffsetSeconds: checkpoint.timeOffsetSeconds,
    questions: checkpoint.questions.map((q, qIdx) => ({
      sortOrder: qIdx,
      prompt: q.prompt,
      kind: q.questionType === 'note' ? 'note' : 'question',
      options: serializeQuestionOptions(q),
      correctIndices: q.questionType === 'multipleChoice' ? q.correctIndices : [],
    })),
  }));
}

function buildQuizPayload(quizQuestions: AuthoringQuestion[]) {
  return quizQuestions.map((question, idx) => authoringQuestionToPayload(question, idx));
}

function validateQuestionPayloads(
  checkpointPayload: ReturnType<typeof buildCheckpointPayload>,
  quizPayload: ReturnType<typeof buildQuizPayload>,
  options: { requireCheckpointQuestions: boolean; includeQuiz: boolean }
): string | null {
  const timestampError = validateCheckpointTimestamps(checkpointPayload);
  if (timestampError) return timestampError;

  if (options.requireCheckpointQuestions && checkpointPayload.some((c) => c.questions.length === 0)) {
    return 'Each checkpoint must include at least one question or note.';
  }

  const emptyNote = checkpointPayload
    .flatMap((checkpoint) => checkpoint.questions)
    .find((item) => item.kind === 'note' && item.prompt.trim() === '');
  if (emptyNote) return 'Each note must have non-empty text.';

  const questions = [...checkpointPayload.flatMap((c) => c.questions), ...(options.includeQuiz ? quizPayload : [])];
  const correctAnswersError = validateMultipleChoiceAnswers(questions);
  if (correctAnswersError) return correctAnswersError;
  const shortAnswerError = validateShortAnswerOptions(questions);
  if (shortAnswerError) return shortAnswerError;
  return null;
}

export default function NodeForm({ mode, nodeId, initial }: Props) {
  const router = useRouter();
  const playerRef = useRef<YTPlayer | null>(null);
  const checkpointRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const learningObjectiveRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [step, setStep] = useState<WizardStep>('basics');
  const [maxReachedStep, setMaxReachedStep] = useState<WizardStep>('basics');
  const [savedNodeId, setSavedNodeId] = useState<string | null>(nodeId ?? null);
  const [createdThisSession, setCreatedThisSession] = useState(false);
  const [draftStatus, setDraftStatus] = useState(initial?.isDraft ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [learningObjectives, setLearningObjectives] = useState(() => {
    const initialValues = initial?.learningObjectives ?? [];
    return (initialValues.length > 0 ? initialValues : ['']).map((value) => makeLearningObjective(value));
  });
  const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<FormCheckpoint[]>(() =>
    (initial?.checkpoints ?? []).map((checkpoint) => ({
      id: checkpoint.id,
      timeOffsetSeconds: checkpoint.timeOffsetSeconds,
      questions: checkpoint.questions.map(dbQuestionToForm),
    }))
  );
  const [expandedQuestionByCheckpoint, setExpandedQuestionByCheckpoint] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(
      (initial?.checkpoints ?? []).map((checkpoint) => [checkpoint.id, checkpoint.questions[0]?.id ?? null])
    )
  );
  const [quizQuestions, setQuizQuestions] = useState<AuthoringQuestion[]>(() =>
    (initial?.quizQuestions ?? []).map(dbQuestionToAuthoring)
  );

  const youtubeId = parseYouTubeId(videoUrl.trim());
  const objectiveValues = learningObjectives.map((objective) => objective.value.trim()).filter(Boolean);
  const currentStepIndex = stepIndex(step);
  const maxReachedIndex = stepIndex(maxReachedStep);

  function goToStep(next: WizardStep) {
    setStep(next);
    setMaxReachedStep((prev) => (stepIndex(next) > stepIndex(prev) ? next : prev));
    setError(null);
  }

  function focusCheckpoint(id: string) {
    setActiveCheckpointId(id);
    requestAnimationFrame(() => {
      checkpointRefs.current[id]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function addCheckpointAt(timeOffsetSeconds: number) {
    const existing = checkpoints.find((c) => c.timeOffsetSeconds === timeOffsetSeconds);
    if (existing) {
      setExpandedQuestionByCheckpoint((prev) =>
        prev[existing.id] === undefined ? { ...prev, [existing.id]: existing.questions[0]?.id ?? null } : prev
      );
      focusCheckpoint(existing.id);
      return;
    }
    const checkpoint = makeCheckpoint(timeOffsetSeconds);
    setCheckpoints((prev) => [...prev, checkpoint].sort((a, b) => a.timeOffsetSeconds - b.timeOffsetSeconds));
    setExpandedQuestionByCheckpoint((prev) => ({
      ...prev,
      [checkpoint.id]: checkpoint.questions[0]?.id ?? null,
    }));
    focusCheckpoint(checkpoint.id);
  }

  function removeCheckpoint(checkpointId: string) {
    const removedIndex = checkpoints.findIndex((checkpoint) => checkpoint.id === checkpointId);
    const remaining = checkpoints.filter((checkpoint) => checkpoint.id !== checkpointId);
    const fallbackId = remaining[Math.min(Math.max(removedIndex, 0), remaining.length - 1)]?.id ?? null;

    setCheckpoints(remaining);
    setExpandedQuestionByCheckpoint((prev) => {
      const next = { ...prev };
      delete next[checkpointId];
      return next;
    });
    setActiveCheckpointId((prev) => (prev === checkpointId ? fallbackId : prev));
  }

  function toggleCheckpoint(checkpointId: string) {
    setActiveCheckpointId((prev) => (prev === checkpointId ? null : checkpointId));
  }

  function toggleCheckpointQuestion(checkpointId: string, questionId: string) {
    setExpandedQuestionByCheckpoint((prev) => ({
      ...prev,
      [checkpointId]: prev[checkpointId] === questionId ? null : questionId,
    }));
  }

  function addQuestionToCheckpoint(checkpointId: string) {
    const question = makeQuestion();
    setCheckpoints((prev) =>
      prev.map((checkpoint) =>
        checkpoint.id === checkpointId ? { ...checkpoint, questions: [...checkpoint.questions, question] } : checkpoint
      )
    );
    setExpandedQuestionByCheckpoint((prev) => ({ ...prev, [checkpointId]: question.id }));
  }

  function addNoteToCheckpoint(checkpointId: string) {
    const note: FormQuestion = { ...makeQuestion(), questionType: 'note' };
    setCheckpoints((prev) =>
      prev.map((checkpoint) =>
        checkpoint.id === checkpointId ? { ...checkpoint, questions: [...checkpoint.questions, note] } : checkpoint
      )
    );
    setExpandedQuestionByCheckpoint((prev) => ({ ...prev, [checkpointId]: note.id }));
  }

  function removeQuestionFromCheckpoint(checkpointId: string, questionId: string) {
    const checkpoint = checkpoints.find((item) => item.id === checkpointId);
    if (!checkpoint) return;

    const removedIndex = checkpoint.questions.findIndex((question) => question.id === questionId);
    const remaining = checkpoint.questions.filter((question) => question.id !== questionId);
    const fallbackId = remaining[Math.min(Math.max(removedIndex, 0), remaining.length - 1)]?.id ?? null;

    setCheckpoints((prev) => prev.map((item) => (item.id === checkpointId ? { ...item, questions: remaining } : item)));
    setExpandedQuestionByCheckpoint((prev) =>
      prev[checkpointId] === questionId ? { ...prev, [checkpointId]: fallbackId } : prev
    );
  }

  function nextManualCheckpointOffset(): number {
    const used = new Set(checkpoints.map((c) => c.timeOffsetSeconds));
    let offset = 0;
    while (used.has(offset)) offset += 60;
    return offset;
  }

  function handleAddCheckpointFromVideo() {
    const player = playerRef.current;
    if (!player) {
      setError('Wait for the video player to finish loading, then try again.');
      return;
    }
    const raw = player.getCurrentTime();
    if (!Number.isFinite(raw)) {
      setError('Could not read the current video time. Try again in a moment.');
      return;
    }
    const seconds = Math.floor(raw);
    try {
      player.pauseVideo();
    } catch {
      // ignore if player is not ready to pause
    }
    setError(null);
    addCheckpointAt(Math.max(0, seconds));
  }

  function addTag(raw: string) {
    const value = raw.trim();
    if (!value) return;
    const exists = tags.some((item) => item.toLowerCase() === value.toLowerCase());
    if (exists) {
      setTagDraft('');
      return;
    }
    setTags((prev) => [...prev, value]);
    setTagDraft('');
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(tagDraft);
    }
  }

  function addLearningObjective() {
    const objective = makeLearningObjective();
    setLearningObjectives((prev) => [...prev, objective]);
    requestAnimationFrame(() => learningObjectiveRefs.current[objective.id]?.focus());
  }

  function updateLearningObjective(id: string, value: string) {
    setLearningObjectives((prev) =>
      prev.map((objective) => (objective.id === id ? { ...objective, value } : objective))
    );
  }

  function removeLearningObjective(id: string) {
    setLearningObjectives((prev) => {
      const remaining = prev.filter((objective) => objective.id !== id);
      return remaining.length > 0 ? remaining : [makeLearningObjective()];
    });
  }
  function validateBasicsStep(): string | null {
    if (!title.trim()) {
      return 'Title is required.';
    }
    if (!youtubeId) {
      return 'A valid YouTube video URL is required.';
    }
    return null;
  }

  function validateCheckpointsStep(): string | null {
    const checkpointPayload = buildCheckpointPayload(checkpoints);
    return validateQuestionPayloads(checkpointPayload, [], {
      requireCheckpointQuestions: true,
      includeQuiz: false,
    });
  }

  function validateQuizStep(): string | null {
    if (quizQuestions.length === 0) {
      return 'Add at least one quiz bank question.';
    }
    const quizIssues = validateQuestionBank(quizQuestions);
    const { errors: quizErrorCount } = countIssuesBySeverity(quizIssues);
    if (quizErrorCount > 0) {
      return `Fix ${quizErrorCount} quiz question error${quizErrorCount === 1 ? '' : 's'} before continuing.`;
    }
    const quizPayload = buildQuizPayload(quizQuestions);
    return validateQuestionPayloads([], quizPayload, {
      requireCheckpointQuestions: false,
      includeQuiz: true,
    });
  }

  function validateAll(): string | null {
    return (
      validateBasicsStep() ??
      validateCheckpointsStep() ??
      validateQuizStep() ??
      validateQuestionPayloads(buildCheckpointPayload(checkpoints), buildQuizPayload(quizQuestions), {
        requireCheckpointQuestions: true,
        includeQuiz: true,
      })
    );
  }

  function handleNext() {
    let stepError: string | null = null;
    if (step === 'basics') stepError = validateBasicsStep();
    if (step === 'checkpoints') stepError = validateCheckpointsStep();
    if (step === 'quiz') stepError = validateQuizStep();

    if (stepError) {
      setError(stepError);
      return;
    }

    const next = STEPS[currentStepIndex + 1];
    // Done is only reachable via a successful save, never via Next.
    if (next && next.id !== 'done') goToStep(next.id);
  }

  function handleBack() {
    if (step === 'done') {
      leaveDoneTo('review');
      return;
    }
    const prev = STEPS[currentStepIndex - 1];
    if (prev) goToStep(prev.id);
  }

  function leaveDoneTo(target: WizardStep) {
    if (target === 'done') return;
    setError(null);
    setMaxReachedStep('review');
    setStep(target);
  }

  function handleStepTabClick(target: WizardStep) {
    if (target === 'done') return;
    if (step === 'done') {
      leaveDoneTo(target);
      return;
    }
    const targetIdx = stepIndex(target);
    if (targetIdx > maxReachedIndex) return;
    if (targetIdx === currentStepIndex) return;
    if (targetIdx < currentStepIndex) {
      goToStep(target);
      return;
    }
    // Only allow forward within already-visited steps after re-validating current
    let stepError: string | null = null;
    if (step === 'basics') stepError = validateBasicsStep();
    if (step === 'checkpoints') stepError = validateCheckpointsStep();
    if (step === 'quiz') stepError = validateQuizStep();
    if (stepError) {
      setError(stepError);
      return;
    }
    goToStep(target);
  }

  async function persistNode(asDraft: boolean) {
    if (saving) return;
    setError(null);
    if (!asDraft) {
      const allError = validateAll();
      if (allError) {
        setError(allError);
        return;
      }
    }

    const checkpointPayload = buildCheckpointPayload(checkpoints);
    const quizPayload = buildQuizPayload(quizQuestions);
    const updatingExisting = Boolean(savedNodeId);

    setSaving(true);
    try {
      const res = await fetch(updatingExisting ? `/api/instructor/nodes/${savedNodeId}` : '/api/instructor/nodes', {
        method: updatingExisting ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          summary,
          videoUrl: videoUrl || null,
          tags,
          learningObjectives: objectiveValues,
          checkpoints: checkpointPayload,
          quizQuestions: quizPayload,
          isDraft: asDraft,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      const idFromResponse = typeof data.id === 'string' ? data.id : null;
      setSavedNodeId(idFromResponse ?? savedNodeId ?? nodeId ?? null);
      if (asDraft) {
        setDraftStatus(true);
        router.push('/instructor/nodes');
        return;
      }
      setDraftStatus(false);
      setCreatedThisSession(!updatingExisting && mode === 'create');
      goToStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function saveNode() {
    await persistNode(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== 'review') return;
    await persistNode(false);
  }

  function renderPreviewSummary() {
    return (
      <>
        <div className={styles.previewBlock}>
          <h3 className={styles.previewHeading}>Basics</h3>
          <dl className={styles.previewDl}>
            <div>
              <dt>Title</dt>
              <dd>{title.trim() || '—'}</dd>
            </div>
            <div>
              <dt>Summary</dt>
              <dd>{summary.trim() || '—'}</dd>
            </div>
            <div>
              <dt>Video URL</dt>
              <dd className={styles.previewMono}>{videoUrl.trim() || '—'}</dd>
            </div>
            <div>
              <dt>Tags</dt>
              <dd>
                {tags.length === 0 ? (
                  '—'
                ) : (
                  <ul className={styles.tagList}>
                    {tags.map((tag) => (
                      <li key={tag} className={styles.tag}>
                        <span>{tag}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            <div>
              <dt>Learning objectives</dt>
              <dd>
                {objectiveValues.length === 0 ? (
                  '—'
                ) : (
                  <ol className={styles.objectivePreviewList}>
                    {objectiveValues.map((objective, index) => (
                      <li key={`${index}-${objective}`}>{objective}</li>
                    ))}
                  </ol>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className={styles.previewBlock}>
          <h3 className={styles.previewHeading}>Checkpoints ({checkpoints.length})</h3>
          {checkpoints.length === 0 ? (
            <p className={styles.sectionNote} style={{ margin: 0 }}>
              No checkpoints.
            </p>
          ) : (
            <ul className={styles.previewList}>
              {checkpoints.map((checkpoint, idx) => (
                <li key={checkpoint.id}>
                  <strong>
                    Checkpoint {idx + 1} · {formatTimeOffsetSeconds(checkpoint.timeOffsetSeconds)}
                  </strong>
                  <span className={styles.previewMeta}>
                    {checkpoint.questions.filter((item) => item.questionType !== 'note').length} question
                    {checkpoint.questions.filter((item) => item.questionType !== 'note').length === 1 ? '' : 's'} ·{' '}
                    {checkpoint.questions.filter((item) => item.questionType === 'note').length} note
                    {checkpoint.questions.filter((item) => item.questionType === 'note').length === 1 ? '' : 's'}
                  </span>
                  <ul className={styles.previewSublist}>
                    {checkpoint.questions.map((q, qIdx) => (
                      <li key={q.id}>
                        {q.questionType === 'note' ? `Note ${qIdx + 1}` : `Q${qIdx + 1}`}:{' '}
                        {q.prompt.trim() || '(empty prompt)'}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.previewBlock}>
          <h3 className={styles.previewHeading}>Quiz bank ({quizQuestions.length})</h3>
          {quizQuestions.length === 0 ? (
            <p className={styles.sectionNote} style={{ margin: 0 }}>
              No quiz questions.
            </p>
          ) : (
            <ul className={styles.previewList}>
              {quizQuestions.map((q, idx) => (
                <li key={q.id}>
                  <div className={styles.previewQuestionPrompt}>
                    <strong>Q{idx + 1}</strong>
                    {q.prompt.trim() === '' ? (
                      <span>(empty prompt)</span>
                    ) : (
                      <div className={styles.previewRenderedContent}>
                        <MarkdownPreview content={q.prompt} />
                      </div>
                    )}
                  </div>
                  {q.type === 'multipleChoice' ? (
                    <ul className={styles.previewSublist}>
                      {q.choices.map((choice, choiceIdx) => (
                        <li key={choice.id} className={styles.previewChoice}>
                          <span>{choiceIdx + 1}.</span>
                          <div className={styles.previewRenderedContent}>
                            {choice.content.trim() === '' ? (
                              <span>(empty choice)</span>
                            ) : (
                              <MarkdownPreview content={choice.content} />
                            )}
                          </div>
                          {choice.correct && <span className={styles.previewCorrect}>Correct</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.previewAnswer}>
                      {q.answer.mode === 'exact'
                        ? `Expected answer: ${q.answer.expected.trim() || '—'}`
                        : `Accepted range: ${q.answer.minimum.trim() || '—'}–${q.answer.maximum.trim() || '—'}`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  return (
    <div>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{mode === 'create' ? 'New node' : 'Edit node'}</h1>
        <p className={styles.pageSubtitle}>
          Create the node in steps: basics, in-video checkpoints, quiz bank, then preview and submit.
        </p>
      </header>

      <nav className={styles.tabs} aria-label="Node authoring steps">
        {STEPS.map((s, idx) => {
          const isActive = s.id === step;
          const reachable =
            s.id === 'done' ? step === 'done' : step === 'done' ? idx <= stepIndex('review') : idx <= maxReachedIndex;
          return (
            <button
              key={s.id}
              type="button"
              className={isActive ? styles.tabActive : styles.tab}
              disabled={!reachable}
              aria-current={isActive ? 'step' : undefined}
              onClick={() => handleStepTabClick(s.id)}
            >
              <span className={styles.tabNumber}>{idx + 1}</span>
              {s.label}
            </button>
          );
        })}
      </nav>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        {step === 'basics' && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Basic info</h2>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  Title <span className={styles.required}>*</span>
                </span>
                <input
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
              <span className={styles.fieldLabel}>
                Video URL <span className={styles.required}>*</span>
              </span>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
              />
            </label>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Tags</span>
              <p className={styles.sectionNote} style={{ margin: 0 }}>
                Add short labels to help organize nodes. Press Enter or click Add.
              </p>
              <div className={styles.tagInputRow}>
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="e.g. lab safety"
                  aria-label="New tag"
                />
                <button type="button" className={styles.tagAddBtn} onClick={() => addTag(tagDraft)}>
                  Add
                </button>
              </div>
              {tags.length > 0 && (
                <ul className={styles.tagList}>
                  {tags.map((tag) => (
                    <li key={tag} className={styles.tag}>
                      <span>{tag}</span>
                      <button
                        type="button"
                        className={styles.tagRemove}
                        aria-label={`Remove ${tag}`}
                        onClick={() => setTags((prev) => prev.filter((item) => item !== tag))}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Learning objectives</span>
              <span className={styles.sectionNote}>
                Add student-facing statements describing what this node will help them learn.
              </span>
              <div className={styles.objectiveList}>
                {learningObjectives.map((objective, index) => (
                  <div key={objective.id} className={styles.objectiveRow}>
                    <input
                      ref={(element) => {
                        learningObjectiveRefs.current[objective.id] = element;
                      }}
                      aria-label={`Learning objective ${index + 1}`}
                      value={objective.value}
                      onChange={(event) => updateLearningObjective(objective.id, event.target.value)}
                      placeholder={`Learning objective ${index + 1}`}
                    />
                    {learningObjectives.length > 1 && (
                      <button
                        type="button"
                        className={styles.objectiveRemoveBtn}
                        aria-label={`Remove learning objective ${index + 1}`}
                        onClick={() => removeLearningObjective(objective.id)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className={styles.objectiveAddBtn}
                aria-label="Add learning objective"
                onClick={addLearningObjective}
              >
                <span aria-hidden="true">+</span>
                <span>Add objective</span>
              </button>
            </div>
          </section>
        )}

        {step === 'checkpoints' && (
          <section className={`${styles.section} ${styles.checkpointSection}`}>
            <h2 className={styles.sectionTitle}>Checkpoints (QEV)</h2>
            <p className={styles.sectionNote}>
              Watch the video and click Add checkpoint to capture the current timestamp. Each checkpoint can hold
              multiple questions or notes.
            </p>

            {!youtubeId && (
              <p className={styles.videoHint}>
                Enter a YouTube URL on the Basics step to scrub the video and capture checkpoints at the current
                playback time. Without a video, add checkpoints manually — each gets the next free offset (0:00, 1:00,
                2:00, …).
              </p>
            )}

            <div className={`${styles.checkpointWorkspace} ${youtubeId ? '' : styles.checkpointWorkspaceWithoutVideo}`}>
              {youtubeId && (
                <aside className={styles.videoPane} aria-label="Checkpoint video controls">
                  <div className={styles.videoWrap}>
                    <YouTubeAuthoringPlayer
                      videoId={youtubeId}
                      onReady={(player) => {
                        playerRef.current = player;
                      }}
                    />
                  </div>
                  <div className={styles.checkpointToolbar}>
                    <button type="button" className={styles.addQuestionBtn} onClick={handleAddCheckpointFromVideo}>
                      + Add checkpoint
                    </button>
                    <span className={styles.videoHelp}>
                      Pauses the video and uses the current playback time. If the player does not load, add a checkpoint
                      manually.
                    </span>
                  </div>
                </aside>
              )}

              <div className={styles.checkpointPane}>
                <div className={styles.checkpointPaneHeader}>
                  <h3>Checkpoint questions</h3>
                  <span>
                    {checkpoints.length} checkpoint{checkpoints.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className={styles.questionList} role="region" aria-label="Checkpoint list" tabIndex={0}>
                  {checkpoints.map((checkpoint, checkpointIdx) => (
                    <div
                      key={checkpoint.id}
                      ref={(el) => {
                        checkpointRefs.current[checkpoint.id] = el;
                      }}
                      className={styles.checkpointCard}
                    >
                      <div className={styles.checkpointHeader}>
                        <button
                          type="button"
                          className={styles.checkpointToggle}
                          onClick={() => toggleCheckpoint(checkpoint.id)}
                          aria-expanded={activeCheckpointId === checkpoint.id}
                          aria-controls={`checkpoint-${checkpoint.id}-questions`}
                          aria-label={`Checkpoint ${checkpointIdx + 1} at ${formatTimeOffsetSeconds(
                            checkpoint.timeOffsetSeconds
                          )}`}
                        >
                          <span className={styles.questionIndex}>
                            Checkpoint {checkpointIdx + 1} · {formatTimeOffsetSeconds(checkpoint.timeOffsetSeconds)}
                          </span>
                          <span className={styles.checkpointQuestionCount}>
                            {checkpoint.questions.length} item{checkpoint.questions.length === 1 ? '' : 's'}
                          </span>
                          <span className={styles.questionChevron} aria-hidden="true">
                            {activeCheckpointId === checkpoint.id ? '−' : '+'}
                          </span>
                        </button>
                        {youtubeId && (
                          <button
                            type="button"
                            className={styles.seekBtn}
                            onClick={() => {
                              setActiveCheckpointId(checkpoint.id);
                              playerRef.current?.seekTo(checkpoint.timeOffsetSeconds, true);
                            }}
                          >
                            Seek to time
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => removeCheckpoint(checkpoint.id)}
                        >
                          Remove checkpoint
                        </button>
                      </div>

                      {activeCheckpointId === checkpoint.id && (
                        <div className={styles.checkpointBody} id={`checkpoint-${checkpoint.id}-questions`}>
                          {checkpoint.questions.map((q, qIdx) => (
                            <QuestionEditor
                              key={q.id}
                              q={q}
                              index={qIdx}
                              expanded={expandedQuestionByCheckpoint[checkpoint.id] === q.id}
                              onToggle={() => toggleCheckpointQuestion(checkpoint.id, q.id)}
                              onUpdate={(patch) =>
                                setCheckpoints((prev) =>
                                  prev.map((c) =>
                                    c.id === checkpoint.id
                                      ? { ...c, questions: updateQuestionInList(c.questions, q.id, patch) }
                                      : c
                                  )
                                )
                              }
                              onRemove={() => removeQuestionFromCheckpoint(checkpoint.id, q.id)}
                              onUpdateChoice={(ci, v) =>
                                setCheckpoints((prev) =>
                                  prev.map((c) =>
                                    c.id === checkpoint.id
                                      ? { ...c, questions: updateChoiceInList(c.questions, q.id, ci, v) }
                                      : c
                                  )
                                )
                              }
                              onAddChoice={() =>
                                setCheckpoints((prev) =>
                                  prev.map((c) =>
                                    c.id === checkpoint.id ? { ...c, questions: addChoiceInList(c.questions, q.id) } : c
                                  )
                                )
                              }
                              onRemoveChoice={(ci) =>
                                setCheckpoints((prev) =>
                                  prev.map((c) =>
                                    c.id === checkpoint.id
                                      ? { ...c, questions: removeChoiceInList(c.questions, q.id, ci) }
                                      : c
                                  )
                                )
                              }
                              canRemove={checkpoint.questions.length > 1}
                              allowNotes
                            />
                          ))}
                          <div className={styles.checkpointItemActions}>
                            <button
                              type="button"
                              className={styles.addQuestionBtn}
                              onClick={() => addQuestionToCheckpoint(checkpoint.id)}
                            >
                              + Add question to checkpoint
                            </button>
                            <button
                              type="button"
                              className={styles.addQuestionBtn}
                              onClick={() => addNoteToCheckpoint(checkpoint.id)}
                            >
                              + Add note
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    className={styles.addQuestionBtn}
                    onClick={() => addCheckpointAt(nextManualCheckpointOffset())}
                  >
                    + Add checkpoint manually
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {step === 'quiz' && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Quiz question bank <span className={styles.required}>*</span>
            </h2>
            <p className={styles.sectionNote}>
              These questions are sampled for the node quiz (after the QEV, or first for foundational nodes). No
              timestamps. Rich text, LaTeX math, and mhchem chemistry notation are supported.
            </p>
            <QuestionBankEditor
              questions={quizQuestions}
              onChange={setQuizQuestions}
              onSave={saveNode}
              saving={saving}
            />
          </section>
        )}

        {step === 'review' && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Preview & submit</h2>
            <p className={styles.sectionNote}>Review the node contents below, then create or save.</p>
            {renderPreviewSummary()}
          </section>
        )}

        {step === 'done' && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{createdThisSession ? 'Node created' : 'Changes saved'}</h2>
            <p className={styles.successNote}>
              {createdThisSession
                ? 'Your node was created successfully. Review the saved summary below, or go back to make changes.'
                : 'Your changes were saved successfully. Review the saved summary below, or go back to make changes.'}
            </p>
            {renderPreviewSummary()}
          </section>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          {step !== 'done' && (
            <a href="/instructor/nodes" className={styles.cancelLink}>
              Cancel
            </a>
          )}
          <div className={styles.actionButtons}>
            {step === 'done' ? (
              <>
                <button type="button" className={styles.secondaryBtn} onClick={handleBack}>
                  Edit again
                </button>
                <button type="button" className={styles.submitBtn} onClick={() => router.push('/instructor/nodes')}>
                  Back to nodes
                </button>
              </>
            ) : (
              <>
                <button type="button" className={styles.draftBtn} onClick={() => persistNode(true)} disabled={saving}>
                  {saving ? 'Saving…' : 'Save as draft'}
                </button>
                {currentStepIndex > 0 && (
                  <button type="button" className={styles.secondaryBtn} onClick={handleBack}>
                    Back
                  </button>
                )}
                {step !== 'review' ? (
                  <button type="button" className={styles.submitBtn} onClick={handleNext}>
                    Next
                  </button>
                ) : (
                  <button type="submit" className={styles.submitBtn} disabled={saving}>
                    {saving ? 'Saving…' : draftStatus ? 'Publish node' : savedNodeId ? 'Save changes' : 'Create node'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
