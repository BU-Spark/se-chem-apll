'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Course, Lesson, Enrollment, CourseContact, CourseLesson } from '@prisma/client';
import styles from './page.module.css';

type AvailableLesson = { id: string; title: string; slug: string };

type ImportedLesson = {
  lessonId: string;
  title: string;
  openDate: string;
  dueDate: string;
};

interface Props {
  course: Course & {
    courseLessons: (CourseLesson & { lesson: Lesson })[];
    enrollments: Enrollment[];
    contacts: CourseContact[];
  };
  availableLessons: AvailableLesson[];
}

export default function CourseEditForm({ course, availableLessons }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState(course.code);
  const [section, setSection] = useState(course.section || '');
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description || '');

  const [importedLessons, setImportedLessons] = useState<ImportedLesson[]>(() =>
    course.courseLessons.map((cl) => ({
      lessonId: cl.lessonId,
      title: cl.lesson.title,
      openDate: cl.openDate ? new Date(cl.openDate).toISOString().split('T')[0] : '',
      dueDate: cl.dueDate ? new Date(cl.dueDate).toISOString().split('T')[0] : '',
    }))
  );

  const [selectedLessonId, setSelectedLessonId] = useState('');
  const unusedLessons = availableLessons.filter((l) => !importedLessons.some((row) => row.lessonId === l.id));

  function addLesson() {
    if (!selectedLessonId) return;
    const lesson = availableLessons.find((l) => l.id === selectedLessonId);
    if (!lesson) return;
    setImportedLessons((prev) => [...prev, { lessonId: lesson.id, title: lesson.title, openDate: '', dueDate: '' }]);
    setSelectedLessonId('');
  }
  function updateImported(lessonId: string, patch: Partial<ImportedLesson>) {
    setImportedLessons((prev) => prev.map((row) => (row.lessonId === lessonId ? { ...row, ...patch } : row)));
  }

  function removeImported(lessonId: string) {
    setImportedLessons((prev) => prev.filter((row) => row.lessonId !== lessonId));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    for (const row of importedLessons) {
      if (row.openDate && row.dueDate && new Date(row.openDate) >= new Date(row.dueDate)) {
        setError(`Open date must be before due date for "${row.title}".`);
        return;
      }
    }
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
          lessons: importedLessons.map((row, idx) => ({
            lessonId: row.lessonId,
            openDate: row.openDate || null,
            dueDate: row.dueDate || null,
            sortOrder: idx,
          })),
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
    if (
      !confirm(`Delete course "${course.title}"? This will remove enrollments and lesson 
      links for this course. Lessons themselves will not be deleted.`)
    ) {
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
          {course.courseLessons.length} lesson{course.courseLessons.length !== 1 ? 's' : ''} ·{' '}
          {course.enrollments.length} student
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

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Imported lessons</h2>
          <p className={styles.sectionNote}>Add lessons to this course and set open/due dates for each.</p>

          <div className={styles.importRow}>
            <label className={styles.field} style={{ flex: 1 }}>
              Lesson
              <select value={selectedLessonId} onChange={(e) => setSelectedLessonId(e.target.value)}>
                <option value="">Select a lesson…</option>
                {unusedLessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={styles.addBtn} onClick={addLesson} disabled={!selectedLessonId}>
              Add
            </button>
          </div>

          {importedLessons.length === 0 ? (
            <p className={styles.emptyImport}>No lessons imported yet.</p>
          ) : (
            <ul className={styles.importList}>
              {importedLessons.map((row) => (
                <li key={row.lessonId} className={styles.importItem}>
                  <p className={styles.importTitle}>{row.title}</p>
                  <div className={styles.fieldRow2}>
                    <label className={styles.field}>
                      Open date
                      <input
                        type="date"
                        value={row.openDate}
                        onChange={(e) => updateImported(row.lessonId, { openDate: e.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      Due date
                      <input
                        type="date"
                        value={row.dueDate}
                        onChange={(e) => updateImported(row.lessonId, { dueDate: e.target.value })}
                      />
                    </label>
                  </div>
                  <button type="button" className={styles.removeBtn} onClick={() => removeImported(row.lessonId)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
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
