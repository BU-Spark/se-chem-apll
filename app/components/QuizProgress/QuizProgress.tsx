import styles from './QuizProgress.module.css';

interface QuizProgressProps {
  title: string;
  // How many bars are filled in.
  filled: number;
  // The question the student is on, shown as "current/total Questions".
  current: number;
  total: number;
}

// Title, one bar per question, and "1/3 Questions"; used by the quiz and the video lesson.
export default function QuizProgress({ title, filled, current, total }: QuizProgressProps) {
  return (
    <header className={styles.header}>
      <p className={styles.title}>{title}</p>
      <div className={styles.bars} aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < filled ? styles.done : styles.todo} />
        ))}
      </div>
      {total > 0 && (
        <p className={styles.label}>
          {current}/{total} Questions
        </p>
      )}
    </header>
  );
}
