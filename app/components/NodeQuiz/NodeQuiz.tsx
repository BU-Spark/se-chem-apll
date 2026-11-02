'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useAttemptApi from '@/app/hooks/useAttemptApi';
import useRunOnce from '@/app/hooks/useRunOnce';
import NodeScreenFrame from '@/app/components/NodeScreenFrame/NodeScreenFrame';
import QuizProgress from '@/app/components/QuizProgress/QuizProgress';
import QuizQuestionView from '@/app/components/QuizQuestionView/QuizQuestionView';
import { isAnswered, type QuizAnswer, type QuizQuestion } from '@/app/components/QuizQuestionView/types';
import buttons from '@/app/styles/buttons.module.css';
import NotSureDialog from './NotSureDialog';
import styles from './NodeQuiz.module.css';

interface NodeQuizProps {
  courseLessonId: string;
  lessonNodeId: string;
  nodeTitle: string;
  lessonHref: string;
  // Page to show after submitting (the node page picks the result screen).
  doneHref: string;
  // Skip the intro, e.g. when retaking the quiz after the video lesson.
  startImmediately?: boolean;
}

/**
 * Intro, then the node's quiz one question at a time, using the team's attempt API
 * (start picks random questions or resumes; finish grades and saves). After submitting, the page
 * reloads its data and shows "Node complete" or "Refresh your knowledge".
 */
export default function NodeQuiz({
  courseLessonId,
  lessonNodeId,
  nodeTitle,
  lessonHref,
  doneHref,
  startImmediately = false,
}: NodeQuizProps) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<{ id: string; questions: QuizQuestion[] } | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [notSureOpen, setNotSureOpen] = useState(false);
  const { post, run, busy, error } = useAttemptApi(courseLessonId);

  const start = () =>
    run(async () => {
      const started = await post({
        action: 'start',
        nodeId: lessonNodeId,
        kind: 'QUIZ',
        key: crypto.randomUUID(),
      });
      setAttempt({ id: started.id, questions: started.questions });
    });

  // finalAnswers: pass the latest answers when submitting in the same click that sets one.
  const submit = (finalAnswers: Record<string, QuizAnswer> = answers) =>
    run(async () => {
      await post({
        action: 'finish',
        attemptId: attempt!.id,
        answers: attempt!.questions.map((question) => ({ questionId: question.id, ...finalAnswers[question.id] })),
      });
      router.push(doneHref);
      router.refresh();
    });

  useRunOnce(() => {
    if (startImmediately) start();
  });

  if (!attempt && startImmediately) {
    return (
      <NodeScreenFrame closeHref={lessonHref}>
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : (
          <p>Loading quiz…</p>
        )}
      </NodeScreenFrame>
    );
  }

  if (!attempt) {
    return (
      <NodeScreenFrame closeHref={lessonHref}>
        <h1 className={styles.introTitle}>{nodeTitle}</h1>
        <p className={styles.introLead}>Take your first step forward in your learning journey.</p>
        <p className={styles.introText}>
          We&rsquo;ll take a quick look at what you already know. If you don&rsquo;t know an answer, that&rsquo;s
          okay&mdash;this is just a starting point, not a test.
        </p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Link href={lessonHref} className={buttons.secondary}>
            Back
          </Link>
          <button type="button" className={buttons.primary} onClick={start} disabled={busy}>
            {busy ? 'Starting…' : 'Continue'}
          </button>
        </div>
      </NodeScreenFrame>
    );
  }

  const { questions } = attempt;
  const question = questions[index];
  const isLast = index === questions.length - 1;
  const setAnswer = (answer: QuizAnswer) => setAnswers((prev) => ({ ...prev, [question.id]: answer }));

  // "I'm Not Sure" counts the question as wrong; on the last question it also submits the quiz.
  function confirmNotSure() {
    const updated: Record<string, QuizAnswer> = { ...answers, [question.id]: { notSure: true } };
    setAnswers(updated);
    setNotSureOpen(false);
    if (isLast) submit(updated);
    else setIndex(index + 1);
  }

  return (
    <NodeScreenFrame closeHref={lessonHref}>
      {/* While the dialog is open, the quiz behind it can't be reached by keyboard or screen reader. */}
      <div className={styles.quizBody} inert={notSureOpen}>
        <QuizProgress
          title={`${nodeTitle} Knowledge Check`}
          filled={index + 1}
          current={index + 1}
          total={questions.length}
        />

        <QuizQuestionView
          key={question.id}
          question={question}
          answer={answers[question.id]}
          onChoose={(choiceIndex) => setAnswer({ selectedIndices: [choiceIndex] })}
          onType={(rawAnswer) => setAnswer({ rawAnswer })}
        />

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <footer className={styles.quizFooter}>
          <button type="button" className={buttons.secondary} onClick={() => setNotSureOpen(true)} disabled={busy}>
            I&rsquo;m Not Sure
          </button>
          {isLast ? (
            <button
              type="button"
              className={buttons.primary}
              onClick={() => submit()}
              disabled={busy || !questions.every((q) => isAnswered(answers[q.id]))}
            >
              {busy ? 'Submitting…' : 'Submit'}
            </button>
          ) : (
            <button
              type="button"
              className={buttons.primary}
              onClick={() => setIndex(index + 1)}
              disabled={!isAnswered(answers[question.id])}
            >
              Next
            </button>
          )}
        </footer>
      </div>

      {notSureOpen && <NotSureDialog onNext={confirmNotSure} />}
    </NodeScreenFrame>
  );
}
