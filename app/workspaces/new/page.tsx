import CreateWorkspace from '../CreateWorkspace';
import styles from '@/app/components/InstructorForm/form.module.css';
export default function NewWorkspacePage() {
  return (
    <div>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>New workspace</h1>
        <p className={styles.pageSubtitle}>Create a shared library, then invite your teaching team.</p>
      </header>
      <CreateWorkspace />
    </div>
  );
}
