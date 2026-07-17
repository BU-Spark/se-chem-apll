'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { User, Enrollment, Lesson, LessonNode, Node } from '@prisma/client';
import styles from './page.module.css';

type EnrollmentWithStudent = Enrollment & { student: User };
type LessonWithNodes = Lesson & { lessonNodes: (LessonNode & { node: Node })[] };

interface CsvRow {
  email: string;
  name?: string;
}

interface CsvImportResult {
  enrolled: number;
  skipped: number;
  errors: { email: string; reason: string }[];
}

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  // Detect whether the first line is a header by checking if it contains "email"
  const firstCols = lines[0].split(',').map((c) => c.trim().toLowerCase().replace(/^"|"$/g, ''));
  const emailColIdx = firstCols.indexOf('email');
  const nameColIdx = firstCols.indexOf('name');
  const hasHeader = emailColIdx !== -1;

  const dataLines = hasHeader ? lines.slice(1) : lines;
  const eIdx = hasHeader ? emailColIdx : 0;
  const nIdx = hasHeader ? nameColIdx : -1;

  return dataLines.flatMap((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const email = cols[eIdx]?.trim().toLowerCase();
    if (!email) return [];
    return [{ email, name: nIdx !== -1 ? cols[nIdx]?.trim() || undefined : undefined }];
  });
}

interface Props {
  courseId: string;
  courseTitle: string;
  courseCode: string;
  courseSection: string | null;
  initialEnrollments: EnrollmentWithStudent[];
  lessons: LessonWithNodes[];
}

export default function CourseStudentsManager({
  courseId,
  courseTitle,
  courseCode,
  courseSection,
  initialEnrollments,
  lessons,
}: Props) {
  const [enrollments, setEnrollments] = useState<EnrollmentWithStudent[]>(initialEnrollments);
  const [email, setEmail] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setEnrolling(true);
    setEnrollError(null);

    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/enrollments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      setEnrollments((prev) => [...prev, data]);
      setEmail('');
    } catch (err) {
      setEnrollError(err instanceof Error ? err.message : 'Failed to enroll student');
    } finally {
      setEnrolling(false);
    }
  }

  async function handleRemove(studentId: string, studentName: string) {
    if (!confirm(`Remove ${studentName} from this course?`)) return;

    setRemovingId(studentId);

    try {
      const res = await fetch(`/api/instructor/courses/${courseId}/enrollments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      setEnrollments((prev) => prev.filter((e) => e.studentId !== studentId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove student');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvImporting(true);
    setCsvResult(null);

    try {
      const text = await file.text();
      const rows = parseCsv(text);

      if (rows.length === 0) {
        setCsvResult({ enrolled: 0, skipped: 0, errors: [{ email: '—', reason: 'No valid rows found in file' }] });
        return;
      }

      let enrolled = 0;
      let skipped = 0;
      const errors: { email: string; reason: string }[] = [];

      for (const row of rows) {
        try {
          const res = await fetch(`/api/instructor/courses/${courseId}/enrollments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: row.email, name: row.name }),
          });

          if (res.status === 409) {
            skipped++;
          } else if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            errors.push({ email: row.email, reason: data.error ?? `Error ${res.status}` });
          } else {
            const data = await res.json();
            setEnrollments((prev) => [...prev, data]);
            enrolled++;
          }
        } catch {
          errors.push({ email: row.email, reason: 'Network error' });
        }
      }

      setCsvResult({ enrolled, skipped, errors });
    } finally {
      setCsvImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  }

  const nodeCount = lessons.reduce((sum, l) => sum + l.lessonNodes.length, 0);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <Link href="/instructor/students" className={styles.backLink}>
            ← All courses
          </Link>
          <h1 className={styles.title}>{courseTitle}</h1>
          <p className={styles.meta}>
            {courseCode}
            {courseSection ? ` · Section ${courseSection}` : ''} &middot; {lessons.length} lesson
            {lessons.length !== 1 ? 's' : ''} &middot; {nodeCount} node
            {nodeCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Course content summary */}
      {lessons.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Lessons assigned to this course</h2>
          <ul className={styles.lessonList}>
            {lessons.map((lesson) => (
              <li key={lesson.id} className={styles.lessonRow}>
                <div>
                  <p className={styles.lessonTitle}>{lesson.title}</p>
                  <p className={styles.lessonMeta}>
                    {lesson.lessonNodes.length} node{lesson.lessonNodes.length !== 1 ? 's' : ''}
                    {lesson.lessonNodes.map((ln) => ` · ${ln.node.title}`).join('')}
                  </p>
                </div>
                <Link href={`/instructor/lessons/${lesson.id}/edit`} className={styles.editLink}>
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Enroll new student */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Enroll a student</h2>
        <p className={styles.sectionDesc}>
          Enter the student&apos;s email address. They will see this course when they sign in with that email.
        </p>

        <form onSubmit={handleEnroll} className={styles.enrollForm}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@example.com"
            required
            disabled={enrolling}
            className={styles.emailInput}
          />
          <button type="submit" disabled={enrolling || !email.trim()} className={styles.enrollBtn}>
            {enrolling ? 'Enrolling…' : 'Enroll'}
          </button>
        </form>

        {enrollError && <p className={styles.error}>{enrollError}</p>}
      </section>

      {/* Bulk enroll via CSV */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Import from CSV</h2>
        <p className={styles.sectionDesc}>
          Upload a CSV file with an <code>email</code> column and an optional <code>name</code> column. Already-enrolled
          students are skipped.
        </p>

        <div className={styles.csvForm}>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            disabled={csvImporting}
            onChange={handleCsvImport}
            className={styles.csvInput}
          />
          {csvImporting && <span className={styles.csvStatus}>Importing…</span>}
        </div>

        {csvResult && (
          <div className={styles.csvResult}>
            <span className={styles.csvStat}>{csvResult.enrolled} enrolled</span>
            {csvResult.skipped > 0 && (
              <span className={styles.csvStatNeutral}>{csvResult.skipped} already enrolled</span>
            )}
            {csvResult.errors.length > 0 && (
              <div className={styles.csvErrors}>
                <p className={styles.csvErrorsTitle}>
                  {csvResult.errors.length} error{csvResult.errors.length !== 1 ? 's' : ''}:
                </p>
                <ul className={styles.csvErrorList}>
                  {csvResult.errors.map((e, i) => (
                    <li key={i}>
                      <span className={styles.csvErrorEmail}>{e.email}</span> — {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Enrolled students list */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Enrolled students ({enrollments.length})</h2>

        {enrollments.length === 0 ? (
          <p className={styles.empty}>No students enrolled yet.</p>
        ) : (
          <ul className={styles.studentList}>
            {enrollments.map((enrollment) => {
              const displayName = enrollment.student.name ?? enrollment.student.email;
              const isRemoving = removingId === enrollment.studentId;

              return (
                <li key={enrollment.id} className={styles.studentRow}>
                  <div className={styles.studentInfo}>
                    <div className={styles.avatar}>{displayName[0].toUpperCase()}</div>
                    <div>
                      <p className={styles.studentName}>{displayName}</p>
                      {enrollment.student.name && <p className={styles.studentEmail}>{enrollment.student.email}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(enrollment.studentId, displayName)}
                    disabled={isRemoving}
                    className={styles.removeBtn}
                  >
                    {isRemoving ? 'Removing…' : 'Remove'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
