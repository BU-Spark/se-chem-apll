import styles from './StudentQuizTaskList.module.css';
import Link from 'next/link';

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

type QuizTaskStatus = 'available' | 'completed' | 'locked' | 'needs-retry';

type QuizTask = {
  key: 'pre' | 'regular';
  label: string;
  status: QuizTaskStatus;
  actionLabel: string;
};

type BuildQuizTasksInput = {
  preQuestionCount: number;
  regularQuestionCount: number;
  attempts: Attempt[];
};

export function buildQuizTasks({ preQuestionCount, regularQuestionCount, attempts }: BuildQuizTasksInput): QuizTask[] {
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

  const preCompleted = preQuestionCount > 0 && preAnsweredIds.size >= preQuestionCount;
  const regularCompleted = regularQuestionCount > 0 && regularAnsweredIds.size >= regularQuestionCount;
  const latestCompletedAttempt = attempts.find((attempt) => attempt.completedAt !== null) ?? null;
  const needsRetry = regularQuestionCount > 0 && !regularCompleted && latestCompletedAttempt?.isPassing === false;
  const regularLocked = preQuestionCount > 0 && !preCompleted;

  const tasks: QuizTask[] = [];

  if (preQuestionCount > 0) {
    tasks.push({
      key: 'pre',
      label: 'Pre-quiz',
      status: preCompleted ? 'completed' : 'available',
      actionLabel: preCompleted ? 'Review pre-quiz' : 'Start pre-quiz',
    });
  }

  if (regularQuestionCount > 0) {
    let status: QuizTaskStatus = 'available';
    if (regularCompleted) {
      status = 'completed';
    } else if (regularLocked) {
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
  if (status === 'needs-retry') return 'Needs retry';
  if (status === 'locked') return 'Locked';
  return 'Available';
}

function statusClass(status: QuizTaskStatus) {
  if (status === 'completed') return styles.statusCompleted;
  if (status === 'needs-retry') return styles.statusNeedsRetry;
  if (status === 'locked') return styles.statusLocked;
  return styles.statusAvailable;
}

export default function StudentQuizTaskList({
  preQuestionCount,
  regularQuestionCount,
  attempts,
  lessonNodeId,
}: BuildQuizTasksInput & { lessonNodeId: string }) {
  const tasks = buildQuizTasks({ preQuestionCount, regularQuestionCount, attempts });
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
