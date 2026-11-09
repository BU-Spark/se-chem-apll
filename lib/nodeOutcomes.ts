/**
 * Quiz tries before a node becomes incomplete. Foundational: the knowledge check, then two
 * after the video. Regular: the quiz after the video, then one retry.
 */
export const quizAttemptsAllowed = (isFoundational: boolean) => (isFoundational ? 3 : 2);

export type OutcomeNode = { id: string; isFoundational: boolean; completionKind?: 'CHECKPOINT' | 'REVIEW' };

// Only existence is needed by progress readers, not question content or answer keys.
export const outcomeContentSelect = {
  quizQuestions: { take: 1, select: { id: true } },
  checkpoints: {
    select: { questions: { where: { kind: 'QUESTION' as const }, take: 1, select: { id: true } } },
  },
};

type OutcomeSource = {
  id: string;
  isRequired: boolean;
  node?: { quizQuestions?: unknown[]; checkpoints?: { questions: unknown[] }[] };
};

// The instructor's "Foundational" checkbox is stored on a lesson node as isRequired.
export const toOutcomeNode = ({ id, isRequired, node }: OutcomeSource): OutcomeNode => ({
  id,
  isFoundational: isRequired,
  ...(node?.quizQuestions?.length === 0
    ? {
        completionKind: node.checkpoints?.some((c) => c.questions.length)
          ? ('CHECKPOINT' as const)
          : ('REVIEW' as const),
      }
    : {}),
});

export type FinishedQuiz = {
  lessonNodeId: string | null;
  isPassing: boolean | null;
  kind?: 'QUIZ' | 'CHECKPOINT' | 'REVIEW';
};

/**
 * Outcomes from completed attempts: a quiz pass completes the node; exhausting tries
 * without passing makes it incomplete. Nodes without quizzes finish their checkpoint/review task.
 */
export function quizOutcomes(nodes: OutcomeNode[], quizzes: FinishedQuiz[]) {
  const completedIds = new Set<string>();
  const failures = new Map<string, number>();
  for (const { lessonNodeId, isPassing, kind } of quizzes) {
    if (!lessonNodeId) continue;
    if (kind && kind !== 'QUIZ') continue;
    if (isPassing) completedIds.add(lessonNodeId);
    else if (isPassing === false) failures.set(lessonNodeId, (failures.get(lessonNodeId) ?? 0) + 1);
  }
  const incompleteIds = new Set<string>();
  for (const node of nodes) {
    if (node.completionKind) {
      if (quizzes.some((a) => a.lessonNodeId === node.id && a.kind === node.completionKind)) completedIds.add(node.id);
      continue;
    }
    const failed = failures.get(node.id) ?? 0;
    if (!completedIds.has(node.id) && failed >= quizAttemptsAllowed(node.isFoundational)) incompleteIds.add(node.id);
  }
  return { completedIds, incompleteIds };
}

// How many of the nodes are finished: completed or incomplete.
export function countFinishedNodes(nodes: OutcomeNode[], quizzes: FinishedQuiz[]) {
  const { completedIds, incompleteIds } = quizOutcomes(nodes, quizzes);
  return nodes.filter((node) => completedIds.has(node.id) || incompleteIds.has(node.id)).length;
}
