'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useAttemptApi from '@/app/hooks/useAttemptApi';
import useRunOnce from '@/app/hooks/useRunOnce';
import NodeScreenFrame from '@/app/components/NodeScreenFrame/NodeScreenFrame';
import QuizProgress from '@/app/components/QuizProgress/QuizProgress';
import QevVideo, { END_TOLERANCE_SECONDS, type VideoControls } from '@/app/components/QevVideo/QevVideo';
import DevSkipButton from '@/app/components/DevSkipButton/DevSkipButton';
import QuizQuestionView from '@/app/components/QuizQuestionView/QuizQuestionView';
import FeedbackBanner from '@/app/components/FeedbackBanner/FeedbackBanner';
import { isAnswered, type QuizAnswer, type QuizQuestion } from '@/app/components/QuizQuestionView/types';
import buttons from '@/app/styles/buttons.module.css';
import screen from '@/app/components/NodeScreenFrame/nodeScreen.module.css';
import styles from './QevLesson.module.css';

const POLL_MS = 300;

interface QevLessonProps {
  courseLessonId: string;
  lessonNodeId: string;
  nodeTitle: string;
  video: { url: string | null; muxPlaybackId: string | null };
  // When each question appears, in seconds; null means after the video ends.
  questionTimes: Record<string, number | null>;
  lessonHref: string;
  // Where to go once every question is answered (the node page shows the video result).
  doneHref: string;
}

// Untimed questions go last, keeping their order.
function byTime(questions: QuizQuestion[], times: Record<string, number | null>) {
  const at = (question: QuizQuestion) => times[question.id] ?? Infinity;
  return [...questions].sort((a, b) => at(a) - at(b));
}

/**
 * The video lesson: plays the node's video and pauses when it reaches each question's time.
 * Each answer is checked right away ("Correct"/"Incorrect"), then the video continues. When the
 * answers are saved as drafts; completion waits for every answer and the video end.
 */
export default function QevLesson({
  courseLessonId,
  lessonNodeId,
  nodeTitle,
  video,
  questionTimes,
  lessonHref,
  doneHref,
}: QevLessonProps) {
  const router = useRouter();
  const controls = useRef<VideoControls | null>(null);
  const hasVideo = Boolean(video.url || video.muxPlaybackId);
  const [attempt, setAttempt] = useState<{ id: string; questions: QuizQuestion[] } | null>(null);
  const startKey = useRef<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [answeredCount, setAnsweredCount] = useState(0);
  const [questionOpen, setQuestionOpen] = useState(!hasVideo);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  // Without a video there's nothing to wait for.
  const [videoEnded, setVideoEnded] = useState(!hasVideo);
  // All answers saved; the student can move on once the video has ended.
  const [saved, setSaved] = useState(false);
  const { post, run, busy, error } = useAttemptApi(courseLessonId);

  // Start (or resume) the video-question attempt once.
  useRunOnce(() => {
    run(async () => {
      startKey.current ??= crypto.randomUUID();
      const started = await post({
        action: 'start',
        nodeId: lessonNodeId,
        kind: 'CHECKPOINT',
        key: startKey.current,
      });
      const ordered = byTime(started.questions, questionTimes);
      setAttempt({ id: started.id, questions: ordered });
      const drafts = Object.fromEntries(
        (started.draftAnswers ?? []).map((a: QuizAnswer & { questionId: string }) => [a.questionId, a])
      );
      setAnswers(drafts);
      const firstMissing = ordered.findIndex((q) => !drafts[q.id]);
      setAnsweredCount(firstMissing === -1 ? ordered.length : firstMissing);
      const ended = !hasVideo || Boolean(started.videoCompletedAt);
      setVideoEnded(ended);
      setSaved(Boolean(started.completedAt));
      setQuestionOpen(firstMissing !== -1 && ended);
    });
  });

  const questions = attempt?.questions ?? [];
  const question = questions[answeredCount];

  // While the video plays, pause it at the next question's time, and notice when it ends
  // (untimed questions appear then).
  useEffect(() => {
    if (questionOpen || videoEnded) return;
    const timer = setInterval(() => {
      const player = controls.current;
      if (!player) return;
      const ended = player.duration() > 0 && player.currentTime() >= player.duration() - END_TOLERANCE_SECONDS;
      if (ended) setVideoEnded(true);
      if (!question) return;
      const at = questionTimes[question.id];
      // At the end, every remaining question opens, even one timed past the video's real length.
      if (ended || (at != null && player.currentTime() >= at)) {
        player.pause();
        setFeedback(null);
        setQuestionOpen(true);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [question, questionOpen, questionTimes, videoEnded]);

  // Dev-only: jump to the next question's time (or the end) instead of watching.
  function devSkip() {
    const player = controls.current;
    if (!player) return;
    // Land inside the end tolerance, so the lesson sees the video as finished.
    const end = Math.max(0, player.duration() - END_TOLERANCE_SECONDS / 2);
    player.seekTo(question ? (questionTimes[question.id] ?? end) : end);
  }

  // Save each answer, show Correct/Incorrect, and keep the video playing.
  // Completion waits for both the last answer and the video end.
  const submitAnswer = () =>
    run(async () => {
      const result = await post({
        action: 'saveCheckpoint',
        attemptId: attempt!.id,
        answer: { questionId: question.id, ...answers[question.id] },
        videoEnded,
      });
      setFeedback(result.correct);
      const next = answeredCount + 1;
      setAnsweredCount(next);
      setQuestionOpen(videoEnded && next < questions.length);
      setSaved(Boolean(result.completedAt));
      if (hasVideo && !videoEnded) controls.current?.play();
    });

  async function goToResult() {
    await run(async () => {
      if (!saved) {
        const result = await post({ action: 'saveCheckpoint', attemptId: attempt!.id, videoEnded: true });
        if (!result.completedAt) throw new Error('Save every answer before completing the video lesson.');
        setSaved(true);
      }
      router.push(doneHref);
      router.refresh();
    });
  }

  return (
    <NodeScreenFrame closeHref={lessonHref}>
      <div className={styles.layout}>
        <section className={styles.panel} aria-label="Video questions">
          <QuizProgress
            title={`${nodeTitle} Video Lesson`}
            filled={answeredCount + (questionOpen ? 1 : 0)}
            current={Math.min(answeredCount + 1, questions.length)}
            total={questions.length}
          />

          {question && questionOpen ? (
            <QuizQuestionView
              key={question.id}
              question={question}
              answer={answers[question.id]}
              onSelect={(selectedIndices) => setAnswers((prev) => ({ ...prev, [question.id]: { selectedIndices } }))}
              onType={(rawAnswer) => setAnswers((prev) => ({ ...prev, [question.id]: { rawAnswer } }))}
            />
          ) : (
            attempt && (
              <p className={styles.waiting}>
                {answeredCount === questions.length
                  ? 'All answers saved. Finish the video to continue.'
                  : 'Watch the video. Questions will appear here.'}
              </p>
            )
          )}
        </section>

        <div className={styles.videoColumn}>
          <QevVideo
            videoUrl={video.url}
            muxPlaybackId={video.muxPlaybackId}
            onReady={(c) => (controls.current = c)}
            playLocked={questionOpen}
          />
          {!questionOpen && !videoEnded && (
            <DevSkipButton onClick={devSkip}>Skip to next question (dev only)</DevSkipButton>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className={screen.error}>
          {error}
        </p>
      )}

      <footer className={styles.footer}>
        {feedback !== null && <FeedbackBanner correct={feedback} />}
        {question && questionOpen && (
          <button
            type="button"
            className={buttons.primary}
            onClick={submitAnswer}
            disabled={busy || !isAnswered(answers[question.id])}
          >
            Continue
          </button>
        )}
        {attempt && answeredCount === questions.length && videoEnded && (
          <button type="button" className={buttons.primary} disabled={busy} onClick={goToResult}>
            {busy ? 'Saving…' : error ? 'Retry completing video lesson' : 'Continue'}
          </button>
        )}
        {error && !attempt && (
          <Link href={lessonHref} className={buttons.secondary}>
            Back to lesson
          </Link>
        )}
      </footer>
    </NodeScreenFrame>
  );
}
