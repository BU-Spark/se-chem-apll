'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Lesson, LessonNode, Node } from '@prisma/client';
import { generateClientId } from '@/lib/generateClientId';
import LessonRoadmapBuilder from '@/app/components/LessonRoadmapBuilder';
import type { PaletteNode, LessonNodeEntry, LessonEdgeEntry } from '@/app/types';
import styles from './page.module.css';

interface Props {
  lesson: Lesson & {
    lessonNodes: (LessonNode & { node: Node })[];
    lessonNodeEdges: { id: string; sourceId: string; targetId: string }[];
  };
  availableNodes: PaletteNode[];
}

export default function LessonEditForm({ lesson, availableNodes }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Metadata
  const [title, setTitle] = useState(lesson.title);
  const [slug, setSlug] = useState(lesson.slug ?? '');
  const [summary, setSummary] = useState(lesson.summary);
  const [description, setDescription] = useState(lesson.description || '');
  const [estimatedMinutes, setEstimatedMinutes] = useState(lesson.estimatedMinutes?.toString() || '');

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
    const quizBankMap = new Map(availableNodes.map((n) => [n.id, n.quizBankCount]));
    return lesson.lessonNodes.map((ln) => {
      const bank = quizBankMap.get(ln.nodeId) ?? 0;
      const savedCount = (ln as LessonNode & { quizQuestionCount?: number }).quizQuestionCount;

      return {
        instanceId: ln.id ?? generateClientId('lesson-node'),
        nodeId: ln.nodeId,
        title: ln.node.title,
        passingPercent: ln.passingPercent.toString(),
        quizQuestionCount: savedCount !== undefined ? String(savedCount) : bank > 0 ? String(bank) : '0',
        isRequired: ln.isRequired,
        quizBankCount: bank,
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

  async function persistLesson(asDraft: boolean) {
    setError(null);

    if (!asDraft) {
      if (!title.trim()) {
        setError('Title is required.');
        return;
      }
      if (!slug.trim()) {
        setError('Slug is required.');
        return;
      }
      if (!summary.trim()) {
        setError('Summary is required.');
        return;
      }
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
          if (entry.quizBankCount === 0) {
            return entry.quizQuestionCount !== '0' && entry.quizQuestionCount !== '';
          }
          return (
            entry.quizQuestionCount === '' ||
            !Number.isInteger(Number(entry.quizQuestionCount)) ||
            Number(entry.quizQuestionCount) < 1
          );
        })
      ) {
        setError('Quiz question count must be a whole number of at least 1 for every node with a quiz bank.');
        return;
      }
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
          lessonNodes: lessonNodes.map((entry, idx) => ({
            nodeId: entry.nodeId,
            sortOrder: idx,
            passingPercent: Number(entry.passingPercent),
            quizQuestionCount: Number(entry.quizQuestionCount),
            isRequired: entry.isRequired,
          })),
          edges: serialisedEdges,
          isDraft: asDraft,
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await persistLesson(false);
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
    <div>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Edit lesson</h1>
        <p className={styles.pageSubtitle}>
          {lesson.lessonNodes.length} node{lesson.lessonNodes.length !== 1 ? 's' : ''}
        </p>
      </header>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* ── Metadata ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Lesson details</h2>

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

        {/* ── Roadmap ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Learning roadmap</h2>
          <p className={styles.sectionNote}>
            Click empty space to add a node. Draw prerequisite paths between nodes — no cycles allowed.
          </p>
          <p className={styles.sectionNote}>
            Pan with scroll/trackpad or right click drag. Drag nodes with left click; connect from the blue dots.
          </p>
          <LessonRoadmapBuilder
            availableNodes={availableNodes}
            lessonNodes={lessonNodes}
            edges={edges}
            onEdgesChange={setEdges}
            onLessonNodesChange={handleLessonNodesChange}
          />
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button type="button" onClick={handleDelete} className={styles.deleteBtn} disabled={deleting || saving}>
            {deleting ? 'Deleting…' : 'Delete lesson'}
          </button>
          <div className={styles.rightActions}>
            <a href="/instructor/lessons" className={styles.cancelLink}>
              Cancel
            </a>
            <button
              type="button"
              className={styles.draftBtn}
              onClick={() => persistLesson(true)}
              disabled={saving || deleting}
            >
              {saving ? 'Saving…' : 'Save as draft'}
            </button>
            <button type="submit" className={styles.submitBtn} disabled={saving || deleting}>
              {saving ? 'Saving…' : lesson.isDraft ? 'Publish lesson' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
