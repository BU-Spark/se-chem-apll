import styles from './StudentQuizTaskList.module.css';
import Link from 'next/link';
import { getFoundationalAccess, getPreQuizOutcome } from '@/app/utils/foundationalAccess';

type Attempt = {
  id: string;
  isPassing: boolean | null;
  completedAt: Date | null;
  responses: {
    question: {
      id: string;
      isPreLecture: boolean;
    };
  }[];
};

type QuizTaskStatus = 'available' | 'completed' | 'locked' | 'needs-retry' | 'skipped';

type QuizTask = {
  key: 'pre' | 'regular';
  label: string;
  status: QuizTaskStatus;
  actionLabel: string;
};

type BuildQuizTasksInput = {
  isFoundational: boolean;
  preQuestionCount: number;
  regularQuestionCount: number;
  attempts: Attempt[];
};

export function buildQuizTasks({
  isFoundational,
  preQuestionCount,
  regularQuestionCount,
  attempts,
}: BuildQuizTasksInput): QuizTask[] {
  const preAnsweredIds = new Set<string>();
  const regularAnsweredIds = new Set<string>();

  for (const attempt of attempts) {
    for (const response of attempt.responses) {
      if (response.question.isPreLecture) {
        preAnsweredIds.add(response.question.id);
      } else {
        regularAnsweredIds.add(response.question.id);
      }
    }
  }

  const preQuizOutcome = getPreQuizOutcome(attempts);
  const access = getFoundationalAccess({
    isFoundational,
    hasPreQuiz: preQuestionCount > 0,
    preQuizOutcome,
  });

  const preTaken = preQuizOutcome === 'passed' || preQuizOutcome === 'failed';
  const regularCompleted = regularQuestionCount > 0 && regularAnsweredIds.size >= regularQuestionCount;

  const latestRegularAttempt =
    attempts.find(
      (attempt) => attempt.completedAt !== null && attempt.responses.some((response) => !response.question.isPreLecture)
    ) ?? null;

  const needsRetry = regularQuestionCount > 0 && !regularCompleted && latestRegularAttempt?.isPassing === false;

  const tasks: QuizTask[] = [];

  if (access.showPreQuiz && preQuestionCount > 0) {
    tasks.push({
      key: 'pre',
      label: 'Pre-quiz',
      status: preTaken ? 'completed' : 'available',
      actionLabel: preTaken ? 'Review pre-quiz' : 'Start pre-quiz',
    });
  }

  if (regularQuestionCount > 0) {
    let status: QuizTaskStatus = 'available';

    if (access.qevSkipped) {
      status = 'skipped';
    } else if (regularCompleted) {
      status = 'completed';
    } else if (access.qevLocked) {
      status = 'locked';
    } else if (needsRetry) {
      status = 'needs-retry';
    }

    tasks.push({
      key: 'regular',
      label: 'Quiz',
      status,
      actionLabel:
        status === 'completed'
          ? 'Review quiz'
          : status === 'skipped'
            ? 'Skipped — passed foundational quiz'
            : status === 'needs-retry'
              ? 'Retry quiz'
              : status === 'locked'
                ? 'Complete pre-quiz first'
                : 'Start quiz',
    });
  }

  return tasks;
}

function statusLabel(status: QuizTaskStatus) {
  if (status === 'completed') return 'Completed';
  if (status === 'skipped') return 'Skipped';
  if (status === 'needs-retry') return 'Needs retry';
  if (status === 'locked') return 'Locked';
  return 'Available';
}

function statusClass(status: QuizTaskStatus) {
  if (status === 'completed') return styles.statusCompleted;
  if (status === 'skipped') return styles.statusSkipped;
  if (status === 'needs-retry') return styles.statusNeedsRetry;
  if (status === 'locked') return styles.statusLocked;
  return styles.statusAvailable;
}

export default function StudentQuizTaskList({
  isFoundational,
  preQuestionCount,
  regularQuestionCount,
  attempts,
  lessonNodeId,
}: BuildQuizTasksInput & { lessonNodeId: string }) {
  const tasks = buildQuizTasks({
    isFoundational,
    preQuestionCount,
    regularQuestionCount,
    attempts,
  });
  if (tasks.length === 0) return null;

  return (
    <div className={styles.container}>
      <p className={styles.heading}>Tasks</p>
      <ul className={styles.list}>
        {tasks.map((task) => (
          <li key={task.key} className={styles.taskRow}>
            <div className={styles.taskMeta}>
              <span className={styles.taskName}>{task.label}</span>
              <span className={`${styles.statusPill} ${statusClass(task.status)}`}>{statusLabel(task.status)}</span>
            </div>
            {task.key === 'pre' && task.status === 'available' ? (
              <Link href={`/student/pre-quiz/${lessonNodeId}`} className={styles.actionLink}>
                {task.actionLabel}
              </Link>
            ) : (
              <button type="button" className={styles.actionBtn} disabled>
                {task.actionLabel} (coming soon)
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
