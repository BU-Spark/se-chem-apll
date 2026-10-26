'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './copy.module.css';

type Item = { id: string; title: string };
type Lesson = Item & { isDraft: boolean; lessonNodes: { nodeId: string }[] };
type Course = Item & {
  code: string;
  section: string | null;
  description: string | null;
  courseLessons: { lessonId: string; openDate: string | null; dueDate: string | null; lateDeadline: string | null }[];
};
interface Props {
  courses: Course[];
  lessons: Lesson[];
  nodes: (Item & { isDraft: boolean })[];
  destinations: Item[];
  destinationLessons: Item[];
  initial: { mode: string; sourceCourseId: string; destinationId: string; lessonId: string; nodeId: string };
}

export default function CopyForm({ courses, lessons, nodes, destinations, destinationLessons, initial }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState(['course', 'lessons', 'nodes'].includes(initial.mode) ? initial.mode : 'course');
  const [sourceId, setSourceId] = useState(initial.sourceCourseId);
  const source = courses.find((course) => course.id === sourceId);
  const [destinationId, setDestinationId] = useState(initial.destinationId);
  const [selected, setSelected] = useState<string[]>([initial.lessonId, initial.nodeId].filter(Boolean));
  const [query, setQuery] = useState('');
  const [courseQuery, setCourseQuery] = useState('');
  const [title, setTitle] = useState(source ? `${source.title} (copy)` : '');
  const [code, setCode] = useState(source?.code ?? '');
  const [section, setSection] = useState('');
  const [description, setDescription] = useState(source?.description ?? '');
  const [copySchedule, setCopySchedule] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sourceLessons = source
    ? source.courseLessons
        .map((row) => lessons.find((lesson) => lesson.id === row.lessonId))
        .filter((lesson): lesson is Lesson => !!lesson)
    : mode === 'course'
      ? []
      : lessons;
  const sourceNodeIds = new Set(sourceLessons.flatMap((lesson) => lesson.lessonNodes.map((row) => row.nodeId)));
  const items = mode === 'nodes' ? nodes.filter((node) => !source || sourceNodeIds.has(node.id)) : sourceLessons;
  const visible = items.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));
  const selectedItems = items.filter((item) => selected.includes(item.id));
  const destinationOptions = mode === 'nodes' ? destinationLessons : destinations;
  function changeSource(id: string) {
    setSourceId(id);
    setSelected([]);
    setQuery('');
    setError('');
    const course = courses.find((row) => row.id === id);
    setTitle(course ? `${course.title} (copy)` : '');
    setCode(course?.code ?? '');
    setDescription(course?.description ?? '');
    setSection('');
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const response = await fetch('/api/instructor/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          sourceCourseId: sourceId || undefined,
          destinationId: destinationId || undefined,
          lessonIds: mode === 'lessons' ? selected : undefined,
          nodeIds: mode === 'nodes' ? selected : undefined,
          code,
          section: section || null,
          title,
          description,
          copySchedule,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to copy content.');
      router.push(result.redirect);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to copy content.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className={styles.page}>
      <h1>Copy course content</h1>
      <p>Browse content from all instructors. Copies belong to you and can be edited independently.</p>
      <form onSubmit={submit} className={styles.form}>
        <fieldset disabled={saving} className={styles.panel}>
          <legend>Choose content</legend>
          <label className={styles.field}>
            What would you like to copy?
            <select
              value={mode}
              onChange={(event) => {
                setMode(event.target.value);
                setSelected([]);
                setDestinationId('');
                setError('');
              }}
            >
              <option value="course">Duplicate an entire course</option>
              <option value="lessons">Selected lessons</option>
              <option value="nodes">Selected nodes</option>
            </select>
          </label>
          <label className={styles.field}>
            Search courses
            <input type="search" value={courseQuery} onChange={(event) => setCourseQuery(event.target.value)} />
          </label>
          <label className={styles.field}>
            Source course
            <select
              required={mode === 'course'}
              value={sourceId}
              onChange={(event) => changeSource(event.target.value)}
            >
              <option value="">{mode === 'course' ? 'Choose a course' : 'All content in the library'}</option>
              {courses
                .filter(
                  (course) =>
                    course.id === sourceId ||
                    `${course.title} ${course.code} ${course.section ?? ''}`
                      .toLowerCase()
                      .includes(courseQuery.toLowerCase())
                )
                .map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code}
                    {course.section ? ` (${course.section})` : ''} — {course.title}
                  </option>
                ))}
            </select>
          </label>
          {mode !== 'course' && (
            <>
              <label className={styles.field}>
                Search {mode}
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <div className={styles.choices}>
                {visible.length === 0 && <p>No matching content.</p>}
                {visible.map((item) => (
                  <label key={item.id} className={styles.choice}>
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)
                        )
                      }
                    />
                    {item.title || 'Untitled'}
                    {item.isDraft ? ' (draft)' : ''}
                  </label>
                ))}
              </div>
              <label className={styles.field}>
                Destination {mode === 'nodes' ? 'lesson' : 'course'}
                <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
                  <option value="">Save copies to my library</option>
                  {destinationOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title || 'Untitled'}
                    </option>
                  ))}
                </select>
              </label>
              {mode === 'lessons' && source && destinationId && (
                <label className={styles.choice}>
                  <input
                    type="checkbox"
                    checked={copySchedule}
                    onChange={(event) => setCopySchedule(event.target.checked)}
                  />
                  Copy source schedule and late-submission policies
                </label>
              )}
            </>
          )}
          {mode === 'course' && (
            <>
              <label className={styles.field}>
                Course code
                <input
                  required
                  pattern="[A-Z0-9-]+"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                />
              </label>
              <label className={styles.field}>
                Section
                <input value={section} onChange={(event) => setSection(event.target.value)} />
              </label>
              <p>Choose a code and section combination that does not already exist.</p>
              <label className={styles.field}>
                Title
                <input required value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className={styles.field}>
                Description
                <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
              </label>
            </>
          )}
        </fieldset>
        <section className={styles.panel} aria-label="Copy preview">
          <h2>Review copy</h2>
          {mode === 'course' ? (
            <>
              <p>
                {sourceLessons.length} lessons and {sourceNodeIds.size} unique nodes will be copied with their
                schedules. Enrollments, contacts, grades, and student activity are excluded.
              </p>
              {source && (
                <ul>
                  {source.courseLessons.map((row) => (
                    <li key={row.lessonId}>
                      {lessons.find((lesson) => lesson.id === row.lessonId)?.title || 'Untitled lesson'} — opens{' '}
                      {row.openDate ?? 'unscheduled'}, due {row.dueDate ?? 'unscheduled'}
                      {row.lateDeadline ? `, late deadline ${row.lateDeadline}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p>
                {selected.length} {mode} selected.{' '}
                {destinationId
                  ? `Copies will be appended to ${destinationOptions.find((item) => item.id === destinationId)?.title}.`
                  : 'Copies will be saved to your library.'}
              </p>
              <ul>
                {selectedItems.map((item) => (
                  <li key={item.id}>
                    {item.title || 'Untitled'}
                    {item.isDraft ? ' (draft)' : ''}
                  </li>
                ))}
              </ul>
              {mode === 'lessons' && (
                <p>
                  {source && destinationId && copySchedule
                    ? 'Source dates and late-submission policies will be copied.'
                    : 'Lesson schedules will start blank.'}
                </p>
              )}
            </>
          )}
          <p>Video files are reused. Questions and lesson roadmaps receive independent copies.</p>
        </section>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Link href="/instructor/courses">Cancel</Link>
          <button type="submit" disabled={saving || (mode === 'course' ? !source : selected.length === 0)}>
            {saving ? 'Copying…' : mode === 'course' ? 'Duplicate course' : `Copy selected ${mode}`}
          </button>
        </div>
      </form>
    </main>
  );
}
