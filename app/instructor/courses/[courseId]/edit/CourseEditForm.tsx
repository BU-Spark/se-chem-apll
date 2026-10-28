'use client';

import CourseTabs from '@/app/components/CourseTabs';
import { useState } from 'react';
import Link from 'next/link';
import { useScheduleShift } from '@/app/components/ScheduleShiftPrompt';
import { useRouter } from 'next/navigation';
import type { Course, Lesson, Enrollment, CourseContact, CourseLesson } from '@prisma/client';
import styles from './page.module.css';
import LessonScheduleFields from '@/app/components/LessonScheduleFields';
import {
  emptyLessonSchedule,
  schedulePayload,
  validateLessonPolicy,
  toDateTimeInput,
  type LessonScheduleValue,
} from '@/app/utils/lessonSubmissionPolicy';

type AvailableLesson = { id: string; title: string; slug: string };

type ImportedLesson = LessonScheduleValue & {
  lessonId: string;
  title: string;
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
      openDate: toDateTimeInput(cl.openDate),
      dueDate: toDateTimeInput(cl.dueDate),
      lateDeadline: toDateTimeInput(cl.lateDeadline),
      hideAfterDue: cl.hideAfterDue,
      latePenaltyType: cl.latePenaltyType,
      latePenaltyPercent: String(cl.latePenaltyPercent),
    }))
  );

  const [lessonQuery, setLessonQuery] = useState('');
  const unusedLessons = availableLessons.filter((l) => !importedLessons.some((row) => row.lessonId === l.id));

  const filteredLessons = unusedLessons.filter((l) => {
    const q = lessonQuery.trim().toLowerCase();
    if (!q) return true;
    return l.title.toLowerCase().includes(q) || l.slug.toLowerCase().includes(q);
  });

  function addLesson(lesson: AvailableLesson) {
    if (scheduleShift.pending) return;
    scheduleShift.clearUndo();
    setImportedLessons((prev) => [
      ...prev,
      {
        lessonId: lesson.id,
        title: lesson.title,
        ...emptyLessonSchedule,
      },
    ]);
    setLessonQuery('');
  }
  const scheduleShift = useScheduleShift(importedLessons, setImportedLessons);
  const updateImported = scheduleShift.update;

  function removeImported(lessonId: string) {
    if (scheduleShift.pending) return;
    scheduleShift.clearUndo();
    setImportedLessons((prev) => prev.filter((row) => row.lessonId !== lessonId));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (scheduleShift.pending) return;
    for (const row of importedLessons) {
      const policyError = validateLessonPolicy(schedulePayload(row));
      if (policyError) {
        setError(`${row.title}: ${policyError}`);
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
            ...schedulePayload(row),
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
    <div>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Edit course</h1>
        <p className={styles.pageSubtitle}>
          {course.courseLessons.length} lesson{course.courseLessons.length !== 1 ? 's' : ''} ·{' '}
          {course.enrollments.length} student
          {course.enrollments.length !== 1 ? 's' : ''}
        </p>
      </header>

      <p>
        <Link href={`/instructor/copy?mode=course&sourceCourseId=${course.id}`}>Duplicate course</Link>
        {' · '}
        <Link href={`/instructor/copy?mode=lessons&destinationId=${course.id}`}>Copy lessons from another course</Link>
      </p>
      <CourseTabs courseId={course.id} active="edit" />

      <form onSubmit={handleSubmit} className={styles.form}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Course details</h2>

          <div className={styles.fieldRow2}>
            <label className={styles.field}>
              <span>
                Course code <span className={styles.required}>*</span>
              </span>
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
            <span>
              Title <span className={styles.required}>*</span>
            </span>
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

          <div className={styles.importSearch}>
            <label className={styles.field}>
              Search lessons
              <input
                type="search"
                value={lessonQuery}
                onChange={(e) => setLessonQuery(e.target.value)}
                placeholder="Type a lesson title…"
                autoComplete="off"
              />
            </label>

            {unusedLessons.length === 0 ? (
              <p className={styles.emptyImport}>All lessons are already imported.</p>
            ) : (
              <ul className={styles.searchResults}>
                {filteredLessons.length === 0 ? (
                  <li className={styles.searchEmpty}>No matching lessons</li>
                ) : (
                  filteredLessons.map((l) => (
                    <li key={l.id}>
                      <button type="button" className={styles.searchResultBtn} onClick={() => addLesson(l)}>
                        <span className={styles.searchResultTitle}>{l.title}</span>
                        <span className={styles.searchResultSlug}>{l.slug}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          {scheduleShift.prompt}
          {importedLessons.length === 0 ? (
            <p className={styles.emptyImport}>No lessons imported yet.</p>
          ) : (
            <ul className={styles.importList}>
              {importedLessons.map((row) => (
                <li key={row.lessonId} className={styles.importItem}>
                  <p className={styles.importTitle}>{row.title}</p>
                  <LessonScheduleFields
                    value={row}
                    onChange={(patch) => updateImported(row.lessonId, patch)}
                    onOpenDateFocus={() => scheduleShift.startEditing(row.lessonId)}
                    onOpenDateBlur={() => scheduleShift.finishEditing(row.lessonId)}
                  />
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
            <button type="submit" className={styles.submitBtn} disabled={saving || deleting || scheduleShift.pending}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
