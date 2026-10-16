import PageBackground from '@/app/components/PageBackground/PageBackground';
import styles from './AuthScreen.module.css';

// Shared frame for the sign-in and sign-up pages: app title above a centered Clerk form.
export default function AuthScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.screen}>
      <PageBackground />
      <h1 className={styles.title}>APLL</h1>
      {children}
    </div>
  );
}
