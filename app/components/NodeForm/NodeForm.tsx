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

type Props = {
  mode: Mode;
  nodeId?: string;
  initial?: NodeFormInitial;
};

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

export default function NodeForm({ mode, nodeId, initial }: Props) {
  const router = useRouter();
  const playerRef = useRef<YTPlayer | null>(null);
  const checkpointRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const quizCsvInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quizCsvErrors, setQuizCsvErrors] = useState<string[] | null>(null);
  const [quizCsvStatus, setQuizCsvStatus] = useState<string | null>(null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? '');
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const checkpointPayload = checkpoints.map((checkpoint, idx) => ({
      sortOrder: idx,
      timeOffsetSeconds: checkpoint.timeOffsetSeconds,
      questions: checkpoint.questions.map((q, qIdx) => ({
        sortOrder: qIdx,
        prompt: q.prompt,
        options: serializeQuestionOptions(q),
        correctIndices: q.questionType === 'multipleChoice' ? q.correctIndices : [],
      })),
    }));

    const quizPayload = quizQuestions.map((q, idx) => ({
      sortOrder: idx,
      prompt: q.prompt,
      options: serializeQuestionOptions(q),
      correctIndices: q.questionType === 'multipleChoice' ? q.correctIndices : [],
    }));

    const timestampError = validateCheckpointTimestamps(checkpointPayload);
    if (timestampError) {
      setError(timestampError);
      return;
    }

    const allQuestions = [...checkpointPayload.flatMap((c) => c.questions), ...quizPayload];
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
    if (checkpointPayload.some((c) => c.questions.length === 0)) {
      setError('Each checkpoint must include at least one question.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(mode === 'create' ? '/api/instructor/nodes' : `/api/instructor/nodes/${nodeId}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          summary,
          videoUrl: videoUrl || null,
          checkpoints: checkpointPayload,
          quizQuestions: quizPayload,
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

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{mode === 'create' ? 'New node' : 'Edit node'}</h1>
        <p className={styles.pageSubtitle}>
          Nodes are reusable video + question bundles. Add checkpoints while watching the video, then build a quiz
          question bank.
        </p>
      </header>

      <form onSubmit={handleSubmit} className={styles.form}>
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

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Checkpoints (QEV)</h2>
          <p className={styles.sectionNote}>
            Watch the video and click Add checkpoint to capture the current timestamp. Each checkpoint can hold multiple
            questions.
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
                  Pauses the video and uses the current playback time.
                </span>
              </div>
            </>
          ) : (
            <p className={styles.videoHint}>
              Enter a YouTube URL above to scrub the video and capture checkpoints at the current playback time. Without
              a video, add checkpoints manually — each gets the next free offset (0:00, 1:00, 2:00, …).
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
                          c.id === checkpoint.id ? { ...c, questions: updateChoiceInList(c.questions, q.id, ci, v) } : c
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

            {!youtubeId && (
              <button
                type="button"
                className={styles.addQuestionBtn}
                onClick={() => addCheckpointAt(nextManualCheckpointOffset())}
              >
                + Add checkpoint manually
              </button>
            )}
          </div>
        </section>

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

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <a href="/instructor/nodes" className={styles.cancelLink}>
            Cancel
          </a>
          <button type="submit" className={styles.submitBtn} disabled={saving}>
            {saving ? 'Saving…' : mode === 'create' ? 'Create node' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
