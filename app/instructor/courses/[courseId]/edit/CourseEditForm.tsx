'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Course, Lesson, Enrollment, CourseContact } from '@prisma/client';
import styles from './page.module.css';

interface Props {
  course: Course & {
    lessons: Lesson[];
    enrollments: Enrollment[];
    contacts: CourseContact[];
  };
}

export default function CourseEditForm({ course }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState(course.code);
  const [section, setSection] = useState(course.section || '');
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description || '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch(`/api/instructor/courses/${course.id}`, {
        method: 'PATCH',
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

  async function handleDelete() {
    if (!confirm(`Delete course "${course.title}"? This will also delete all associated lessons and enrollments.`)) {
      return;
    }

    setError(null);
    setDeleting(true);

    try {
      const res = await fetch(`/api/instructor/courses/${course.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      router.push('/instructor/courses');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Edit course</h1>
        <p className={styles.pageSubtitle}>
          {course.lessons.length} lesson{course.lessons.length !== 1 ? 's' : ''} · {course.enrollments.length} student
          {course.enrollments.length !== 1 ? 's' : ''}
        </p>
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
          <button type="button" onClick={handleDelete} className={styles.deleteBtn} disabled={deleting || saving}>
            {deleting ? 'Deleting…' : 'Delete course'}
          </button>
          <div className={styles.rightActions}>
            <a href="/instructor/courses" className={styles.cancelLink}>
              Cancel
            </a>
            <button type="submit" className={styles.submitBtn} disabled={saving || deleting}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
