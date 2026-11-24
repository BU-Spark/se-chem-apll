import styles from './DevSkipButton.module.css';

// Developer-only shortcut for testing videos; never set this in production.
const DEV_SKIP = process.env.NEXT_PUBLIC_DEV_QEV_SKIP === 'true';

// Shown only when NEXT_PUBLIC_DEV_QEV_SKIP=true, so students never see it.
export default function DevSkipButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  if (!DEV_SKIP) return null;
  return (
    <button type="button" className={styles.button} onClick={onClick}>
      {children}
    </button>
  );
}
