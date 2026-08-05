import styles from './loading.module.css';

export default function StudentLoading() {
  return (
    <div className={styles.root} aria-busy="true" aria-live="polite">
      <div className={`${styles.bone} ${styles.title}`} />

      <div className={styles.courseList}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className={styles.courseCard}>
            <div className={styles.courseHeader}>
              <div className={styles.cardBody}>
                <div className={`${styles.bone} ${styles.lineLg}`} />
                <div className={`${styles.bone} ${styles.lineSm}`} />
              </div>
              <div className={`${styles.bone} ${styles.badge}`} />
            </div>
            <div className={`${styles.bone} ${styles.lineMd}`} />
            <div className={styles.lessonStack}>
              <div className={`${styles.bone} ${styles.lesson}`} />
              <div className={`${styles.bone} ${styles.lesson}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
