'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function CourseCreateForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [section, setSection] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch('/api/instructor/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          section: section || null,
          title,
          description: description || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      router.push('/instructor/courses');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>New course</h1>
        <p className={styles.pageSubtitle}>Create a new course to organize your lessons.</p>
      </header>

      <form onSubmit={handleSubmit} className={styles.form}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Course details</h2>

          <div className={styles.fieldRow2}>
            <label className={styles.field}>
              Course code <span className={styles.required}>*</span>
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. CH101, CHEM-200"
                pattern="[A-Z0-9-]+"
                title="Letters, numbers, and hyphens only"
              />
            </label>
            <label className={styles.field}>
              Section
              <input
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="e.g. A1, 001 (optional)"
              />
            </label>
          </div>

          <label className={styles.field}>
            Title <span className={styles.required}>*</span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Introduction to Chemistry"
            />
          </label>

          <label className={styles.field}>
            Description
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional course description…"
            />
          </label>
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <a href="/instructor/courses" className={styles.cancelLink}>
            Cancel
          </a>
          <button type="submit" className={styles.submitBtn} disabled={saving}>
            {saving ? 'Creating…' : 'Create course'}
          </button>
        </div>
      </form>
    </div>
  );
}
