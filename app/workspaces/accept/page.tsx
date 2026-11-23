import styles from '@/app/components/InstructorForm/form.module.css';
import AcceptInvitation from './AcceptInvitation';
export default async function AcceptPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Join a workspace</h1>
      </header>
      <section className={styles.section}>
        <p className={styles.sectionNote}>
          Accept using an account with the verified email address this invitation was sent to.
        </p>
        <AcceptInvitation token={token ?? ''} />
      </section>
    </div>
  );
}
