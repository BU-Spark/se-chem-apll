'use client';

import { SignOutButton, useClerk } from '@clerk/nextjs';
import { ROUTES } from '@/app/routes';
import buttons from '@/app/styles/buttons.module.css';
import styles from './AccountActions.module.css';

// Account buttons backed by Clerk: its account screen (email, password) and sign out.
export default function AccountActions() {
  const { openUserProfile } = useClerk();

  return (
    <div className={styles.actions}>
      <button type="button" className={buttons.secondary} onClick={() => openUserProfile()}>
        Manage account
      </button>
      <SignOutButton redirectUrl={ROUTES.signIn}>
        <button type="button" className={buttons.primary}>
          Sign out
        </button>
      </SignOutButton>
    </div>
  );
}
