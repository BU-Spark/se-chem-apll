'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatTimeOffsetSeconds, validateCheckpointTimestamps } from '@/app/utils/questionTimestamps';
import { downloadCsvFile } from '@/app/utils/csv';
import { validateMultipleChoiceAnswers } from '@/app/utils/multipleChoice';
import { csvToFormQuestions, formQuestionsToCsv, sampleQuizQuestionsCsv } from '@/app/utils/quizQuestionCsv';
import { validateShortAnswerOptions } from '@/app/utils/shortAnswer';
import { parseYouTubeId } from '@/app/utils/youtube';
import QuestionEditor from './QuestionEditor';
import YouTubeAuthoringPlayer, { type YTPlayer } from './YouTubeAuthoringPlayer';
import {
  dbQuestionToForm,
  makeCheckpoint,
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
      options: serializeQuestionOptions(q),
      correctIndices: q.questionType === 'multipleChoice' ? q.correctIndices : [],
    })),
  }));
}

function buildQuizPayload(quizQuestions: FormQuestion[]) {
  return quizQuestions.map((q, idx) => ({
    sortOrder: idx,
    prompt: q.prompt,
    options: serializeQuestionOptions(q),
    correctIndices: q.questionType === 'multipleChoice' ? q.correctIndices : [],
  }));
}

function validateQuestionPayloads(
  checkpointPayload: ReturnType<typeof buildCheckpointPayload>,
  quizPayload: ReturnType<typeof buildQuizPayload>,
  options: { requireCheckpointQuestions: boolean; includeQuiz: boolean }
): string | null {
  const timestampError = validateCheckpointTimestamps(checkpointPayload);
  if (timestampError) return timestampError;

  if (options.requireCheckpointQuestions && checkpointPayload.some((c) => c.questions.length === 0)) {
    return 'Each checkpoint must include at least one question.';
  }

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
  const quizCsvInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>('basics');
  const [maxReachedStep, setMaxReachedStep] = useState<WizardStep>('basics');
  const [savedNodeId, setSavedNodeId] = useState<string | null>(nodeId ?? null);
  const [createdThisSession, setCreatedThisSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quizCsvErrors, setQuizCsvErrors] = useState<string[] | null>(null);
  const [quizCsvStatus, setQuizCsvStatus] = useState<string | null>(null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [learningObjectives, setLearningObjectives] = useState(initial?.learningObjectives ?? '');
  const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<FormCheckpoint[]>(() =>
    (initial?.checkpoints ?? []).map((checkpoint) => ({
      id: checkpoint.id,
      timeOffsetSeconds: checkpoint.timeOffsetSeconds,
      questions: checkpoint.questions.map(dbQuestionToForm),
    }))
  );
  const [quizQuestions, setQuizQuestions] = useState<FormQuestion[]>(() =>
    (initial?.quizQuestions ?? []).map(dbQuestionToForm)
  );

  const youtubeId = parseYouTubeId(videoUrl.trim());
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
      focusCheckpoint(existing.id);
      return;
    }
    const checkpoint = makeCheckpoint(timeOffsetSeconds);
    setCheckpoints((prev) => [...prev, checkpoint].sort((a, b) => a.timeOffsetSeconds - b.timeOffsetSeconds));
    focusCheckpoint(checkpoint.id);
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

  function handleDownloadSampleQuizCsv() {
    downloadCsvFile('quiz-questions-sample.csv', sampleQuizQuestionsCsv());
  }

  function handleDownloadCurrentQuizCsv() {
    downloadCsvFile('quiz-questions.csv', formQuestionsToCsv(quizQuestions));
  }

  async function handleQuizCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setQuizCsvErrors(null);
    setQuizCsvStatus(null);

    try {
      const text = await file.text();
      const result = csvToFormQuestions(text);
      if (!result.ok) {
        setQuizCsvErrors(result.errors);
        return;
      }
      setQuizQuestions(result.questions);
      setQuizCsvStatus(
        result.questions.length === 0
          ? 'Loaded 0 questions. Save the node to persist.'
          : `Loaded ${result.questions.length} question${result.questions.length === 1 ? '' : 's'}. Review and save the node to persist.`
      );
    } catch {
      setQuizCsvErrors(['Could not read that CSV file.']);
    } finally {
      if (quizCsvInputRef.current) quizCsvInputRef.current.value = '';
    }
  }

  function validateBasicsStep(): string | null {
    if (!title.trim()) return 'Title is required.';
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
    if (quizQuestions.length === 0) return null;
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== 'review') return;

    setError(null);
    const allError = validateAll();
    if (allError) {
      setError(allError);
      return;
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
          learningObjectives,
          checkpoints: checkpointPayload,
          quizQuestions: quizPayload,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      const idFromResponse = typeof data.id === 'string' ? data.id : null;
      setSavedNodeId(idFromResponse ?? savedNodeId ?? nodeId ?? null);
      setCreatedThisSession(!updatingExisting && mode === 'create');
      goToStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
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
              <dd>{learningObjectives.trim() || '—'}</dd>
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
                    {checkpoint.questions.length} question
                    {checkpoint.questions.length === 1 ? '' : 's'}
                  </span>
                  <ul className={styles.previewSublist}>
                    {checkpoint.questions.map((q, qIdx) => (
                      <li key={q.id}>
                        Q{qIdx + 1}: {q.prompt.trim() || '(empty prompt)'}
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
                  Q{idx + 1}: {q.prompt.trim() || '(empty prompt)'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  return (
    <div className={styles.page}>
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
              Video URL
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
            <label className={styles.field}>
              Learning objectives
              <textarea
                aria-label="Learning objectives"
                value={learningObjectives}
                onChange={(e) => setLearningObjectives(e.target.value)}
                placeholder="e.g. This node will help you understand the basics of the mole concept."
                rows={4}
              />
              <span className={styles.sectionNote}>
                A student-facing description of what this node will help them learn.
              </span>
            </label>
          </section>
        )}

        {step === 'checkpoints' && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Checkpoints (QEV)</h2>
            <p className={styles.sectionNote}>
              Watch the video and click Add checkpoint to capture the current timestamp. Each checkpoint can hold
              multiple questions.
            </p>

            {youtubeId ? (
              <>
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
                  <span className={styles.sectionNote} style={{ margin: 0 }}>
                    Pauses the video and uses the current playback time. If the player does not load, use Add checkpoint
                    manually below.
                  </span>
                </div>
              </>
            ) : (
              <p className={styles.videoHint}>
                Enter a YouTube URL on the Basics step to scrub the video and capture checkpoints at the current
                playback time. Without a video, add checkpoints manually — each gets the next free offset (0:00, 1:00,
                2:00, …).
              </p>
            )}

            <div className={styles.questionList}>
              {checkpoints.map((checkpoint, checkpointIdx) => (
                <div
                  key={checkpoint.id}
                  ref={(el) => {
                    checkpointRefs.current[checkpoint.id] = el;
                  }}
                  className={`${styles.checkpointCard} ${
                    activeCheckpointId === checkpoint.id ? styles.checkpointCardActive : ''
                  }`}
                >
                  <div className={styles.checkpointHeader}>
                    <div className={styles.checkpointMeta}>
                      <span className={styles.questionIndex}>
                        Checkpoint {checkpointIdx + 1} · {formatTimeOffsetSeconds(checkpoint.timeOffsetSeconds)}
                      </span>
                      {youtubeId && (
                        <button
                          type="button"
                          className={styles.seekBtn}
                          onClick={() => playerRef.current?.seekTo(checkpoint.timeOffsetSeconds, true)}
                        >
                          Seek to time
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => setCheckpoints((prev) => prev.filter((c) => c.id !== checkpoint.id))}
                    >
                      Remove checkpoint
                    </button>
                  </div>

                  {checkpoint.questions.map((q, qIdx) => (
                    <QuestionEditor
                      key={q.id}
                      q={q}
                      index={qIdx}
                      onUpdate={(patch) =>
                        setCheckpoints((prev) =>
                          prev.map((c) =>
                            c.id === checkpoint.id
                              ? { ...c, questions: updateQuestionInList(c.questions, q.id, patch) }
                              : c
                          )
                        )
                      }
                      onRemove={() =>
                        setCheckpoints((prev) =>
                          prev.map((c) =>
                            c.id === checkpoint.id
                              ? { ...c, questions: c.questions.filter((question) => question.id !== q.id) }
                              : c
                          )
                        )
                      }
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
                            c.id === checkpoint.id ? { ...c, questions: removeChoiceInList(c.questions, q.id, ci) } : c
                          )
                        )
                      }
                      canRemove={checkpoint.questions.length > 1}
                    />
                  ))}
                  <button
                    type="button"
                    className={styles.addQuestionBtn}
                    onClick={() =>
                      setCheckpoints((prev) =>
                        prev.map((c) =>
                          c.id === checkpoint.id ? { ...c, questions: [...c.questions, makeQuestion()] } : c
                        )
                      )
                    }
                  >
                    + Add question to checkpoint
                  </button>
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
          </section>
        )}

        {step === 'quiz' && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Quiz question bank</h2>
            <p className={styles.sectionNote}>
              These questions are sampled for the node quiz (after the QEV, or first for foundational nodes). No
              timestamps.
            </p>
            <div className={styles.quizCsvToolbar}>
              <button type="button" className={styles.quizCsvBtn} onClick={handleDownloadSampleQuizCsv}>
                Download sample CSV
              </button>
              <button type="button" className={styles.quizCsvBtn} onClick={handleDownloadCurrentQuizCsv}>
                Download current CSV
              </button>
              <button type="button" className={styles.quizCsvBtn} onClick={() => quizCsvInputRef.current?.click()}>
                Upload CSV
              </button>
              <input
                ref={quizCsvInputRef}
                type="file"
                accept=".csv,text/csv"
                className={styles.quizCsvInput}
                onChange={handleQuizCsvUpload}
              />
            </div>
            <p className={styles.sectionNote}>Upload replaces the quiz bank below. Save the node to persist.</p>
            {quizCsvStatus && <p className={styles.quizCsvStatus}>{quizCsvStatus}</p>}
            {quizCsvErrors && quizCsvErrors.length > 0 && (
              <div className={styles.quizCsvErrors}>
                <p className={styles.quizCsvErrorsTitle}>
                  Could not import CSV ({quizCsvErrors.length} error
                  {quizCsvErrors.length === 1 ? '' : 's'}):
                </p>
                <ul className={styles.quizCsvErrorList}>
                  {quizCsvErrors.map((message, idx) => (
                    <li key={`${idx}-${message}`}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className={styles.questionList}>
              {quizQuestions.map((q, qIdx) => (
                <QuestionEditor
                  key={q.id}
                  q={q}
                  index={qIdx}
                  onUpdate={(patch) => setQuizQuestions((prev) => updateQuestionInList(prev, q.id, patch))}
                  onRemove={() => setQuizQuestions((prev) => prev.filter((question) => question.id !== q.id))}
                  onUpdateChoice={(ci, v) => setQuizQuestions((prev) => updateChoiceInList(prev, q.id, ci, v))}
                  onAddChoice={() => setQuizQuestions((prev) => addChoiceInList(prev, q.id))}
                  onRemoveChoice={(ci) => setQuizQuestions((prev) => removeChoiceInList(prev, q.id, ci))}
                  canRemove={quizQuestions.length > 0}
                />
              ))}
              <button
                type="button"
                className={styles.addQuestionBtn}
                onClick={() => setQuizQuestions((prev) => [...prev, makeQuestion()])}
              >
                + Add quiz question
              </button>
            </div>
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
                    {saving ? 'Saving…' : savedNodeId ? 'Save changes' : 'Create node'}
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
