import styles from './InfoCard.module.css';

// A rounded panel that lays out InfoFields in a wrapping row.
export default function InfoCard({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section className={styles.card} aria-label={label}>
      {children}
    </section>
  );
}
