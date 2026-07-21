import styles from './StudentDailyTimeline.module.css';

type Lesson = {
  id: string;
  title: string;
  openDate?: Date | null;
  dueDate?: Date | null;
};

type DailyCourse = {
  courseId: string;
  title: string;
  code: string;
  section?: string | null;
  lessons: Lesson[];
};

export default function StudentDailyTimeline({ data }: { data: DailyCourse[] }) {
  if (!data || data.length === 0) return null;

  return (
    <section className={styles.container}>
      <h2 className={styles.title}>Today</h2>
      {data.map((c) => (
        <div key={c.courseId} className={styles.course}>
          <div className={styles.courseHeader}>
            <h3 className={styles.courseTitle}>
              {c.title}
              <span className={styles.code}>
                {c.code}
                {c.section ? ` · Section ${c.section}` : ''}
              </span>
            </h3>
          </div>

          <ul className={styles.lessons}>
            {c.lessons.map((l) => (
              <li key={l.id} className={styles.lesson}>
                <p className={styles.lessonTitle}>{l.title}</p>
                <p className={styles.lessonMeta}>
                  {l.openDate ? `Opens ${new Date(l.openDate).toLocaleString()}` : ''}
                  {l.dueDate ? `${l.openDate ? ' · ' : ''}Due ${new Date(l.dueDate).toLocaleString()}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
