'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useAttemptApi from '@/app/hooks/useAttemptApi';
import useRunOnce from '@/app/hooks/useRunOnce';
import NodeScreenFrame from '@/app/components/NodeScreenFrame/NodeScreenFrame';
import QuizProgress from '@/app/components/QuizProgress/QuizProgress';
import QevVideo, { type VideoControls } from '@/app/components/QevVideo/QevVideo';
import QuizQuestionView from '@/app/components/QuizQuestionView/QuizQuestionView';
import FeedbackBanner from '@/app/components/FeedbackBanner/FeedbackBanner';
import { isAnswered, type QuizAnswer, type QuizQuestion } from '@/app/components/QuizQuestionView/types';
import buttons from '@/app/styles/buttons.module.css';
import styles from './QevLesson.module.css';

const POLL_MS = 300;
// Players can stop slightly before their reported duration, so count the last second as the end.
const END_TOLERANCE_SECONDS = 1;
// Developer-only shortcut for testing; never set this in production.
const DEV_SKIP = process.env.NEXT_PUBLIC_DEV_QEV_SKIP === 'true';

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
 * last question is done, all answers are saved through the team's attempt API.
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
      const started = await post({
        action: 'start',
        nodeId: lessonNodeId,
        kind: 'CHECKPOINT',
        key: crypto.randomUUID(),
      });
      setAttempt({ id: started.id, questions: byTime(started.questions, questionTimes) });
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

  // Check the answer, show Correct/Incorrect, and keep the video playing. After the last
  // question, save all answers; the student continues once the video has ended.
  const submitAnswer = () =>
    run(async () => {
      const result = await post(
        { attemptId: attempt!.id, answer: { questionId: question.id, ...answers[question.id] } },
        '/check'
      );
      setFeedback(result.correct);
      const next = answeredCount + 1;
      setAnsweredCount(next);
      setQuestionOpen(!hasVideo && next < questions.length);
      if (next === questions.length) {
        await post({
          action: 'finish',
          attemptId: attempt!.id,
          answers: questions.map((q) => ({ questionId: q.id, ...answers[q.id] })),
        });
        setSaved(true);
      }
      if (hasVideo) controls.current?.play();
    });

  function goToResult() {
    router.push(doneHref);
    router.refresh();
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
              onChoose={(choiceIndex) =>
                setAnswers((prev) => ({ ...prev, [question.id]: { selectedIndices: [choiceIndex] } }))
              }
              onType={(rawAnswer) => setAnswers((prev) => ({ ...prev, [question.id]: { rawAnswer } }))}
            />
          ) : (
            attempt && (
              <p className={styles.waiting}>
                {saved
                  ? 'All questions answered. Finish the video to continue.'
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
          {DEV_SKIP && !questionOpen && !videoEnded && (
            <button type="button" className={styles.devSkip} onClick={devSkip}>
              Skip to next question (dev only)
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className={styles.error}>
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
        {saved && videoEnded && (
          <button type="button" className={buttons.primary} onClick={goToResult}>
            Continue
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
