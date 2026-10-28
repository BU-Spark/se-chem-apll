import styles from './CenteredPage.module.css';

// Page title with the page's content stacked and centered beneath it.
export default function CenteredPage({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      {children}
    </div>
  );
}
