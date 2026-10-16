import styles from './PageBackground.module.css';

// Covers the whole window behind a page, hiding the app's global gradient and side padding.
export default function PageBackground() {
  return <div className={styles.background} aria-hidden="true" />;
}
