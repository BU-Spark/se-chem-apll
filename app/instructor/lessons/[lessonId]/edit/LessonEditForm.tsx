'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Lesson, LessonNode, Node, Course } from '@prisma/client';
import { generateClientId } from '@/lib/generateClientId';
import LessonBuilder from '@/app/components/LessonBuilder';
import LessonRoadmapBuilder from '@/app/components/LessonRoadmapBuilder';
import type { PaletteNode } from '@/app/components/LessonBuilder/NodePalette';
import type { LessonNodeEntry } from '@/app/components/LessonBuilder/NodeCard';
import type { LessonEdgeEntry } from '@/app/types';
import styles from './page.module.css';

interface Props {
  lesson: Lesson & {
    course: Course;
    lessonNodes: (LessonNode & { node: Node })[];
    lessonNodeEdges: { id: string; sourceId: string; targetId: string }[];
  };
  availableNodes: PaletteNode[];
  courses: Course[];
}

type TabId = 'builder' | 'roadmap';

export default function LessonEditForm({ lesson, availableNodes, courses }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('builder');

  // Metadata
  const [title, setTitle] = useState(lesson.title);
  const [slug, setSlug] = useState(lesson.slug);
  const [summary, setSummary] = useState(lesson.summary);
  const [description, setDescription] = useState(lesson.description || '');
  const [courseId, setCourseId] = useState(lesson.courseId);
  const [estimatedMinutes, setEstimatedMinutes] = useState(lesson.estimatedMinutes?.toString() || '');
  const [openDate, setOpenDate] = useState(
    lesson.openDate ? new Date(lesson.openDate).toISOString().split('T')[0] : ''
  );
  const [dueDate, setDueDate] = useState(lesson.dueDate ? new Date(lesson.dueDate).toISOString().split('T')[0] : '');

  // Auto-generate slug from title
  function handleTitleChange(val: string) {
    setTitle(val);
    setSlug(
      val
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
    );
  }

  // Initialize lesson nodes from existing data
  const [lessonNodes, setLessonNodes] = useState<LessonNodeEntry[]>(() => {
    const preLectureMap = new Map(availableNodes.map((n) => [n.id, n.preLectureCount]));
    return lesson.lessonNodes.map((ln) => {
      const bank = preLectureMap.get(ln.nodeId) ?? 0;
      const savedCount = (ln as LessonNode & { quizQuestionCount?: number }).quizQuestionCount;

      return {
        instanceId: ln.id ?? generateClientId('lesson-node'),
        nodeId: ln.nodeId,
        title: ln.node.title,
        passingPercent: ln.passingPercent.toString(),
        quizQuestionCount: savedCount !== undefined ? String(savedCount) : bank > 0 ? String(bank) : '0',
        isRequired: ln.isRequired,
        preLectureCount: bank,
      };
    });
  });

  // instanceId === LessonNode.id for persisted nodes, matching edge sourceId/targetId from DB
  const [edges, setEdges] = useState<LessonEdgeEntry[]>(
    (lesson.lessonNodeEdges ?? []).map((e) => ({
      edgeId: e.id,
      sourceInstanceId: e.sourceId,
      targetInstanceId: e.targetId,
    }))
  );

  function handleLessonNodesChange(updated: LessonNodeEntry[]) {
    const validIds = new Set(updated.map((e) => e.instanceId));
    setEdges((prev) => prev.filter((e) => validIds.has(e.sourceInstanceId) && validIds.has(e.targetInstanceId)));
    setLessonNodes(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (lessonNodes.length === 0) {
      setError('Add at least one node to the lesson before saving.');
      return;
    }

    if (
      lessonNodes.some(
        (entry) =>
          entry.passingPercent === '' ||
          !Number.isInteger(Number(entry.passingPercent)) ||
          Number(entry.passingPercent) < 0 ||
          Number(entry.passingPercent) > 100
      )
    ) {
      setError('Choose a whole-number pass threshold between 0 and 100 for every node.');
      return;
    }

    if (
      lessonNodes.some((entry) => {
        if (entry.preLectureCount === 0) {
          return entry.quizQuestionCount !== '0' && entry.quizQuestionCount !== '';
        }
        return (
          entry.quizQuestionCount === '' ||
          !Number.isInteger(Number(entry.quizQuestionCount)) ||
          Number(entry.quizQuestionCount) < 1
        );
      })
    ) {
      setError('Choose a whole-number quiz question count between 1 for every node with a pre-quiz.');
      return;
    }

    if (openDate && dueDate && new Date(openDate) >= new Date(dueDate)) {
      setError('Open date must be before due date.');
      return;
    }

    const instanceToSortOrder = new Map(lessonNodes.map((entry, idx) => [entry.instanceId, idx]));
    const serialisedEdges = edges
      .map((e) => ({
        sourceSortOrder: instanceToSortOrder.get(e.sourceInstanceId),
        targetSortOrder: instanceToSortOrder.get(e.targetInstanceId),
      }))
      .filter(
        (e): e is { sourceSortOrder: number; targetSortOrder: number } =>
          e.sourceSortOrder !== undefined && e.targetSortOrder !== undefined
      );

    setSaving(true);
    try {
      const res = await fetch(`/api/instructor/lessons/${lesson.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          slug,
          summary,
          description: description || null,
          estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
          openDate: openDate || null,
          dueDate: dueDate || null,
          lessonNodes: lessonNodes.map((entry, idx) => ({
            nodeId: entry.nodeId,
            sortOrder: idx,
            passingPercent: Number(entry.passingPercent),
            quizQuestionCount: Number(entry.quizQuestionCount),
            isRequired: entry.isRequired,
          })),
          edges: serialisedEdges,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      router.push('/instructor/lessons');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete lesson "${lesson.title}"? This action cannot be undone.`)) {
      return;
    }

    setError(null);
    setDeleting(true);

    try {
      const res = await fetch(`/api/instructor/lessons/${lesson.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      router.push('/instructor/lessons');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Edit lesson</h1>
        <p className={styles.pageSubtitle}>
          {lesson.course.code} · {lesson.lessonNodes.length} node{lesson.lessonNodes.length !== 1 ? 's' : ''}
        </p>
      </header>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* ── Metadata ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Lesson details</h2>

          <div className={styles.fieldRow2}>
            <label className={styles.field}>
              Course <span className={styles.required}>*</span>
              <select required value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                {courses.length === 0 && <option value="">No courses — create one first</option>}
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                    {c.section ? ` §${c.section}` : ''} — {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Estimated duration (min)
              <input
                type="number"
                min={1}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                placeholder="30"
              />
            </label>
          </div>

          <div className={styles.fieldRow2}>
            <label className={styles.field}>
              Open date
              <input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} />
            </label>
            <label className={styles.field}>
              Due date
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>

          <div className={styles.fieldRow2}>
            <label className={styles.field}>
              Title <span className={styles.required}>*</span>
              <input
                required
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. Lab Safety Fundamentals"
              />
            </label>
            <label className={styles.field}>
              Slug <span className={styles.required}>*</span>
              <input
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="lab-safety-fundamentals"
                pattern="[a-z0-9-]+"
                title="Lowercase letters, numbers and hyphens only"
              />
            </label>
          </div>

          <label className={styles.field}>
            Summary <span className={styles.required}>*</span>
            <input
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One-line summary shown on the lesson card"
            />
          </label>

          <label className={styles.field}>
            Description
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional longer description…"
            />
          </label>
        </section>

        {/* ── Tabs ── */}
        <div className={styles.tabs}>
          <button
            type="button"
            className={activeTab === 'builder' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('builder')}
          >
            Build lesson
          </button>
          <button
            type="button"
            className={activeTab === 'roadmap' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('roadmap')}
          >
            Roadmap
          </button>
        </div>

        {/* ── Builder tab ── */}
        {activeTab === 'builder' && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Build lesson</h2>
            <p className={styles.sectionNote}>
              Add nodes from the library, choose a pass threshold for each one, and drag to reorder.
            </p>
            <LessonBuilder availableNodes={availableNodes} entries={lessonNodes} onChange={handleLessonNodesChange} />
          </section>
        )}

        {/* ── Roadmap tab ── */}
        {activeTab === 'roadmap' && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Learning roadmap</h2>
            <p className={styles.sectionNote}>
              Draw prerequisite paths between nodes. Connections must form a directed acyclic graph — no cycles allowed.
            </p>
            <p className={styles.sectionNote}>
              Pan with scroll/trackpad or right click drag. Drag nodes with left click; connect from the blue dots.
            </p>
            <LessonRoadmapBuilder lessonNodes={lessonNodes} edges={edges} onEdgesChange={setEdges} />
          </section>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button type="button" onClick={handleDelete} className={styles.deleteBtn} disabled={deleting || saving}>
            {deleting ? 'Deleting…' : 'Delete lesson'}
          </button>
          <div className={styles.rightActions}>
            <a href="/instructor/lessons" className={styles.cancelLink}>
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
