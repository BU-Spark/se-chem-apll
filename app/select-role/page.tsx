'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import styles from './page.module.css';

export default function SelectRolePage() {
  const router = useRouter();
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRoleSelect(role: 'student' | 'instructor') {
    if (!user) return;

    setSaving(true);
    setError(null);

    try {
      await user.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          role,
        },
      });

      // Redirect based on selected role
      if (role === 'instructor') {
        router.push('/instructor');
      } else {
        // For now, redirect students to instructor since there's no student UI yet
        // TODO: Create student interface
        router.push('/instructor');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set role');
      setSaving(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Welcome to Spark 26! 🎓</h1>
        <p className={styles.subtitle}>Please select your role to continue</p>

        <div className={styles.roleButtons}>
          <button onClick={() => handleRoleSelect('student')} disabled={saving} className={styles.roleButton}>
            <span className={styles.roleIcon}>👨‍🎓</span>
            <span className={styles.roleTitle}>Student</span>
            <span className={styles.roleDescription}>Access courses and lessons</span>
          </button>

          <button onClick={() => handleRoleSelect('instructor')} disabled={saving} className={styles.roleButton}>
            <span className={styles.roleIcon}>👨‍🏫</span>
            <span className={styles.roleTitle}>Instructor</span>
            <span className={styles.roleDescription}>Manage courses, lessons, and nodes</span>
          </button>
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {saving && <p className={styles.saving}>Setting up your account...</p>}
      </div>
    </div>
  );
}
