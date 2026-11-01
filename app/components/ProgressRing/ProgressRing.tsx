import styles from './ProgressRing.module.css';

export default function ProgressRing({ percent, className }: { percent: number; className?: string }) {
  return (
    <span
      className={`${styles.ring} ${className ?? ''}`}
      style={{ '--percent': percent } as React.CSSProperties}
      aria-label={`${percent}% complete`}
    >
      <span className={styles.value}>{percent}%</span>
    </span>
  );
}
