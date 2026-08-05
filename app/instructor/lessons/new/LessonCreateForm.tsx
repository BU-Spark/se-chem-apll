'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LessonBuilder from '@/app/components/LessonBuilder';
import type { PaletteNode } from '@/app/components/LessonBuilder/NodePalette';
import type { LessonNodeEntry } from '@/app/components/LessonBuilder/NodeCard';
import styles from './page.module.css';

interface Props {
  availableNodes: PaletteNode[];
}

export default function LessonCreateForm({ availableNodes }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Metadata
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');

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

  // Lesson nodes (drag-and-drop state)
  const [lessonNodes, setLessonNodes] = useState<LessonNodeEntry[]>([]);

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

    setSaving(true);
    try {
      const res = await fetch('/api/instructor/lessons', {
        method: 'POST',
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

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>New lesson</h1>
        <p className={styles.pageSubtitle}>
          Fill in the lesson details, then drag nodes from the library into the lesson canvas below.
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

        {/* ── Builder ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Build lesson</h2>
          <p className={styles.sectionNote}>
            Add nodes from the library, choose a pass threshold for each one, and drag to reorder.
          </p>
          <LessonBuilder availableNodes={availableNodes} entries={lessonNodes} onChange={setLessonNodes} />
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <a href="/instructor/lessons" className={styles.cancelLink}>
            Cancel
          </a>
          <button type="submit" className={styles.submitBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Create lesson'}
          </button>
        </div>
      </form>
    </div>
  );
}
