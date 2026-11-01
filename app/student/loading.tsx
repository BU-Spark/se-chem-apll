import a11y from '@/app/styles/a11y.module.css';
import styles from './loading.module.css';

// Placeholder shown while a student page loads: a title and two course cards.
export default function StudentLoading() {
  return (
    <div className={styles.root} aria-busy="true" aria-live="polite">
      <span className={a11y.srOnly}>Loading…</span>
      <div className={`${styles.bone} ${styles.title}`} />
      <div className={styles.cards}>
        <div className={`${styles.bone} ${styles.card}`} />
        <div className={`${styles.bone} ${styles.card}`} />
      </div>
    </div>
  );
}
