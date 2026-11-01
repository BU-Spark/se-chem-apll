import styles from './grid.module.css';

export function StatusBadge({ value }: { value: boolean }) {
  return (
    <span className={`${styles.statusBadge} ${value ? styles.draftBadge : styles.publishedBadge}`}>
      {value ? 'Draft' : 'Published'}
    </span>
  );
}
