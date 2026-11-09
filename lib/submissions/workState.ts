import type { AttemptKind, AttemptPurpose } from '@prisma/client';
import { quizOutcomes, quizAttemptsAllowed, toOutcomeNode } from '@/lib/nodeOutcomes';
import { nodeKey, requiredKinds, type WorkNode } from './content';

export type WorkAttempt = {
  id: string;
  lessonNodeId: string | null;
  kind: AttemptKind;
  purpose: AttemptPurpose;
  contentKey: string;
  completedAt: Date | null;
  isPassing: boolean | null;
};

export function currentAttempts<T extends WorkAttempt>(nodes: WorkNode[], attempts: T[]): T[] {
  const keys = new Map(nodes.map((node) => [node.id, nodeKey(node)]));
  return attempts.filter((a) => a.lessonNodeId && keys.get(a.lessonNodeId) === a.contentKey);
}

/** Shared by mutations, roadmap access and course continuation. Never includes stale work. */
export function evaluateWork<T extends WorkAttempt>(
  nodes: WorkNode[],
  attempts: T[],
  hasSubmission: boolean,
  edges: { sourceId: string; targetId: string }[] = []
) {
  const current = currentAttempts(nodes, attempts);
  const finished = current
    .filter((a) => a.completedAt)
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime() || b.id.localeCompare(a.id));
  const outcomes = quizOutcomes(nodes.map(toOutcomeNode), finished);
  const states = nodes.map((node) => {
    const key = nodeKey(node);
    const mine = current.filter((a) => a.lessonNodeId === node.id);
    const quizzes = finished.filter((a) => a.lessonNodeId === node.id && a.kind === 'QUIZ');
    const standard = quizzes.filter((a) => a.purpose !== 'IMPROVEMENT');
    const testedOut = node.isRequired && standard.at(-1)?.isPassing === true;
    const tasks = requiredKinds(node).flatMap((kind) => {
      const attempt = finished.find((a) => a.lessonNodeId === node.id && a.kind === kind);
      return kind === 'CHECKPOINT' && testedOut && !attempt ? [] : [{ kind, attempt }];
    });
    const quizTerminal = outcomes.completedIds.has(node.id) || outcomes.incompleteIds.has(node.id);
    const terminal = quizTerminal && tasks.every((t) => t.attempt);
    const improvement = mine.find((a) => a.purpose === 'IMPROVEMENT');
    const active = mine.find((a) => !a.completedAt);
    const needsUpdatedWork = !terminal && attempts.some((a) => a.lessonNodeId === node.id && a.contentKey !== key);
    return {
      id: node.id,
      current: mine,
      finished: finished.filter((a) => a.lessonNodeId === node.id),
      tasks,
      terminal,
      testedOut,
      needsUpdatedWork,
      outcome: terminal
        ? outcomes.completedIds.has(node.id)
          ? ('COMPLETED' as const)
          : ('INCOMPLETE' as const)
        : null,
      activeAttemptId: active?.id ?? null,
      improvementAttemptId: improvement && !improvement.completedAt ? improvement.id : null,
      canImprove: hasSubmission && terminal && node.node.quizQuestions.length > 0 && !improvement,
      canStartQuiz: !quizTerminal && standard.length < quizAttemptsAllowed(node.isRequired),
      needsCheckpoint: tasks.some((t) => t.kind === 'CHECKPOINT' && !t.attempt),
      prerequisitesReady: true,
    };
  });
  for (const state of states) {
    state.prerequisitesReady = edges
      .filter((e) => e.targetId === state.id)
      .every((e) => states.find((s) => s.id === e.sourceId)?.terminal);
    state.canImprove = state.canImprove && state.prerequisitesReady;
  }
  return { current, finished, states, ready: states.length > 0 && states.every((s) => s.terminal) };
}
