import styles from './StudentQuizTaskList.module.css';

type Attempt = {
  id: string;
  isPassing: boolean | null;
  completedAt: Date | null;
  responses: {
    quizQuestionId: string | null;
    checkpointQuestionId: string | null;
  }[];
};

type QuizTaskStatus = 'available' | 'completed' | 'locked' | 'needs-retry' | 'skipped';

type QuizTask = {
  key: 'quiz';
  label: string;
  status: QuizTaskStatus;
  actionLabel: string;
};

type BuildQuizTasksInput = {
  isFoundational: boolean;
  quizBankCount: number;
  checkpointQuestionCount: number;
  attempts: Attempt[];
};

export function buildQuizTasks({ quizBankCount, attempts }: BuildQuizTasksInput): QuizTask[] {
  if (quizBankCount <= 0) return [];

  const quizAnsweredIds = new Set<string>();
  for (const attempt of attempts) {
    for (const response of attempt.responses) {
      if (response.quizQuestionId) quizAnsweredIds.add(response.quizQuestionId);
    }
  }

  const quizCompleted = quizAnsweredIds.size >= quizBankCount;
  const latestQuizAttempt =
    attempts.find(
      (attempt) => attempt.completedAt !== null && attempt.responses.some((response) => response.quizQuestionId != null)
    ) ?? null;
  const needsRetry = !quizCompleted && latestQuizAttempt?.isPassing === false;

  let status: QuizTaskStatus = 'available';
  if (quizCompleted) status = 'completed';
  else if (needsRetry) status = 'needs-retry';

  return [
    {
      key: 'quiz',
      label: 'Quiz',
      status,
      actionLabel: status === 'completed' ? 'Review quiz' : status === 'needs-retry' ? 'Retry quiz' : 'Start quiz',
    },
  ];
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
  quizBankCount,
  checkpointQuestionCount,
  attempts,
}: BuildQuizTasksInput & { lessonNodeId: string }) {
  const tasks = buildQuizTasks({
    isFoundational,
    quizBankCount,
    checkpointQuestionCount,
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
            <button type="button" className={styles.actionBtn} disabled>
              {task.actionLabel} (coming soon)
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
