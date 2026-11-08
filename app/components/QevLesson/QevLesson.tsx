'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useAttemptApi from '@/app/hooks/useAttemptApi';
import useRunOnce from '@/app/hooks/useRunOnce';
import NodeScreenFrame from '@/app/components/NodeScreenFrame/NodeScreenFrame';
import QuizProgress from '@/app/components/QuizProgress/QuizProgress';
import QevVideo, { END_TOLERANCE_SECONDS, hasEnded, type VideoControls } from '@/app/components/QevVideo/QevVideo';
import DevSkipButton from '@/app/components/DevSkipButton/DevSkipButton';
import QuizQuestionView from '@/app/components/QuizQuestionView/QuizQuestionView';
import MarkdownPreview from '@/app/components/QuestionBank/MarkdownPreview';
import FeedbackBanner from '@/app/components/FeedbackBanner/FeedbackBanner';
import { isAnswered, type QuizAnswer, type QuizQuestion } from '@/app/components/QuizQuestionView/types';
import type { TimelineItem } from '@/lib/studentNode';
import buttons from '@/app/styles/buttons.module.css';
import screen from '@/app/components/NodeScreenFrame/nodeScreen.module.css';
import styles from './QevLesson.module.css';

const POLL_MS = 300;

interface QevLessonProps {
  courseLessonId: string;
  lessonNodeId: string;
  nodeTitle: string;
  video: { url: string | null; muxPlaybackId: string | null };
  // The video's questions and notes, in the instructor's order.
  timeline: TimelineItem[];
  lessonHref: string;
  // Where Continue goes after the video (the video result, or the quiz when there are no questions).
  doneHref: string;
}

// One place the video pauses: a question to answer, or a note to read.
type Stop = Extract<TimelineItem, { kind: 'NOTE' }> | { kind: 'QUESTION'; at: number | null; question: QuizQuestion };

/**
 * The video's pauses by time, untimed ones last. The sort keeps equal times in the instructor's
 * order. Questions use the attempt's copy; one no longer in the video still gets asked at the end,
 * since the attempt needs every answer.
 */
function buildStops(timeline: TimelineItem[], questions: QuizQuestion[]): Stop[] {
  const timed = timeline.flatMap((item): Stop[] => {
    if (item.kind === 'NOTE') return [item];
    const question = questions.find((q) => q.id === item.id);
    return question ? [{ kind: 'QUESTION', at: item.at, question }] : [];
  });
  const leftover = questions
    .filter((question) => !timeline.some((item) => item.id === question.id))
    .map((question): Stop => ({ kind: 'QUESTION', at: null, question }));
  return [...timed, ...leftover].sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
}

/**
 * The video lesson: plays the node's video and pauses at each question or note. Each answer is
 * checked right away ("Correct"/"Incorrect"); a note just shows until the student continues.
 * When the last question is done, all answers are saved through the team's attempt API. Notes
 * are never answered, graded or counted.
 */
export default function QevLesson({
  courseLessonId,
  lessonNodeId,
  nodeTitle,
  video,
  timeline,
  lessonHref,
  doneHref,
}: QevLessonProps) {
  const router = useRouter();
  const controls = useRef<VideoControls | null>(null);
  const hasVideo = Boolean(video.url || video.muxPlaybackId);
  // Only videos with questions have an attempt to start and save.
  const hasQuestions = timeline.some((item) => item.kind === 'QUESTION');
  const [attempt, setAttempt] = useState<{ id: string; questions: QuizQuestion[] } | null>(null);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [stopIndex, setStopIndex] = useState(0);
  const [stopOpen, setStopOpen] = useState(!hasVideo);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  // Without a video there's nothing to wait for.
  const [videoEnded, setVideoEnded] = useState(!hasVideo);
  // All answers saved (nothing to save without questions); the student can move on once the
  // video has ended.
  const [saved, setSaved] = useState(!hasQuestions);
  const { post, run, busy, error } = useAttemptApi(courseLessonId);

  // Start (or resume) the video-question attempt once.
  useRunOnce(() => {
    if (!hasQuestions) return;
    run(async () => {
      const started = await post({
        action: 'start',
        nodeId: lessonNodeId,
        kind: 'CHECKPOINT',
        key: crypto.randomUUID(),
      });
      setAttempt({ id: started.id, questions: started.questions });
    });
  });

  // Wait for the attempt's questions before stopping anywhere, so the order never shifts.
  const stops = useMemo(
    () => (hasQuestions && !attempt ? null : buildStops(timeline, attempt?.questions ?? [])),
    [attempt, hasQuestions, timeline]
  );
  const stop = stops?.[stopIndex];
  const questionCount = stops?.filter((s) => s.kind === 'QUESTION').length ?? 0;
  const questionsDone = stops?.slice(0, stopIndex).filter((s) => s.kind === 'QUESTION').length ?? 0;

  // While the video plays, pause it at the next stop's time, and notice when it ends
  // (untimed stops appear then).
  useEffect(() => {
    if (stopOpen || videoEnded) return;
    const timer = setInterval(() => {
      const player = controls.current;
      if (!player) return;
      const ended = hasEnded(player);
      if (ended) setVideoEnded(true);
      if (!stop) return;
      // At the end, every remaining stop opens, even one timed past the video's real length.
      if (ended || (stop.at != null && player.currentTime() >= stop.at)) {
        player.pause();
        setFeedback(null);
        setStopOpen(true);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [stop, stopOpen, videoEnded]);

  // Dev-only: jump to the next stop's time (or the end) instead of watching.
  function devSkip() {
    const player = controls.current;
    if (!player) return;
    // Land inside the end tolerance, so the lesson sees the video as finished.
    const end = Math.max(0, player.duration() - END_TOLERANCE_SECONDS / 2);
    player.seekTo(stop?.at ?? end);
  }

  // Move past the current stop: after the video has ended the next stop opens right away,
  // otherwise the video keeps playing until it gets there.
  function nextStop() {
    const next = stopIndex + 1;
    const afterVideo = !hasVideo || videoEnded;
    setStopIndex(next);
    setStopOpen(afterVideo && next < stops!.length);
    if (!afterVideo) controls.current?.play();
  }

  function continueAfterNote() {
    setFeedback(null);
    nextStop();
  }

  // Check the answer and show Correct/Incorrect. After the last question, save all answers.
  const submitAnswer = (question: QuizQuestion) =>
    run(async () => {
      const result = await post(
        { attemptId: attempt!.id, answer: { questionId: question.id, ...answers[question.id] } },
        '/check'
      );
      setFeedback(result.correct);
      if (questionsDone + 1 === questionCount) {
        await post({
          action: 'finish',
          attemptId: attempt!.id,
          answers: attempt!.questions.map((q) => ({ questionId: q.id, ...answers[q.id] })),
        });
        setSaved(true);
      }
      nextStop();
    });

  function goToResult() {
    router.push(doneHref);
    router.refresh();
  }

  const openStop = stopOpen ? stop : undefined;
  // Every pause handled, answers saved and the video over: the student can move on.
  const done = Boolean(stops) && !stop && saved && videoEnded;

  return (
    <NodeScreenFrame closeHref={lessonHref}>
      <div className={styles.layout}>
        <section className={styles.panel} aria-label="Video questions and notes">
          <QuizProgress
            title={`${nodeTitle} Video Lesson`}
            filled={questionsDone + (openStop?.kind === 'QUESTION' ? 1 : 0)}
            current={Math.min(questionsDone + 1, questionCount)}
            total={questionCount}
          />

          {openStop?.kind === 'QUESTION' && (
            <QuizQuestionView
              key={openStop.question.id}
              question={openStop.question}
              answer={answers[openStop.question.id]}
              onSelect={(selectedIndices) =>
                setAnswers((prev) => ({ ...prev, [openStop.question.id]: { selectedIndices } }))
              }
              onType={(rawAnswer) => setAnswers((prev) => ({ ...prev, [openStop.question.id]: { rawAnswer } }))}
            />
          )}
          {openStop?.kind === 'NOTE' && (
            <section className={styles.note} aria-label="Note">
              <p className={styles.noteLabel}>Note</p>
              <MarkdownPreview content={openStop.prompt} />
            </section>
          )}
          {stops && !openStop && !done && (
            <p className={styles.waiting}>
              {stop ? 'Watch the video. It pauses here for questions and notes.' : 'Finish the video to continue.'}
            </p>
          )}
        </section>

        <div className={styles.videoColumn}>
          <QevVideo
            videoUrl={video.url}
            muxPlaybackId={video.muxPlaybackId}
            onReady={(c) => (controls.current = c)}
            playLocked={stopOpen}
          />
          {!stopOpen && !videoEnded && <DevSkipButton onClick={devSkip}>Skip to next pause (dev only)</DevSkipButton>}
        </div>
      </div>

      {error && (
        <p role="alert" className={screen.error}>
          {error}
        </p>
      )}

      <footer className={styles.footer}>
        {feedback !== null && <FeedbackBanner correct={feedback} />}
        {openStop?.kind === 'QUESTION' && (
          <button
            type="button"
            className={buttons.primary}
            onClick={() => submitAnswer(openStop.question)}
            disabled={busy || !isAnswered(answers[openStop.question.id])}
          >
            Continue
          </button>
        )}
        {openStop?.kind === 'NOTE' && (
          <button type="button" className={buttons.primary} onClick={continueAfterNote}>
            Continue
          </button>
        )}
        {done && (
          <button type="button" className={buttons.primary} onClick={goToResult}>
            Continue
          </button>
        )}
        {error && hasQuestions && !attempt && (
          <Link href={lessonHref} className={buttons.secondary}>
            Back to lesson
          </Link>
        )}
      </footer>
    </NodeScreenFrame>
  );
}
