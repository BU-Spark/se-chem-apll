import styles from './loading.module.css';

export default function InstructorLoading() {
  return (
    <div className={styles.root} aria-busy="true" aria-live="polite">
      <div className={styles.header}>
        <div className={`${styles.bone} ${styles.title}`} />
        <div className={`${styles.bone} ${styles.button}`} />
      </div>

      <ul className={styles.list}>
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className={styles.card}>
            <div className={styles.cardBody}>
              <div className={`${styles.bone} ${styles.lineLg}`} />
              <div className={`${styles.bone} ${styles.lineMd}`} />
              <div className={`${styles.bone} ${styles.lineSm}`} />
            </div>
            <div className={`${styles.bone} ${styles.action}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
