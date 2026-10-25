/**
 * Quiz tries before a node becomes incomplete. Foundational: the knowledge check, then two
 * after the video. Regular: the quiz after the video, then one retry.
 */
export const quizAttemptsAllowed = (isFoundational: boolean) => (isFoundational ? 3 : 2);

export type OutcomeNode = { id: string; isFoundational: boolean };

// The instructor's "Foundational" checkbox is stored on a lesson node as isRequired.
export const toOutcomeNode = ({ id, isRequired }: { id: string; isRequired: boolean }): OutcomeNode => ({
  id,
  isFoundational: isRequired,
});

export type FinishedQuiz = { lessonNodeId: string | null; isPassing: boolean | null };

/**
 * Which of a lesson's nodes the student has finished, from their finished quiz attempts:
 * completed once a quiz passed, incomplete after every allowed try failed without a pass.
 */
export function quizOutcomes(nodes: OutcomeNode[], quizzes: FinishedQuiz[]) {
  const completedIds = new Set<string>();
  const failures = new Map<string, number>();
  for (const { lessonNodeId, isPassing } of quizzes) {
    if (!lessonNodeId) continue;
    if (isPassing) completedIds.add(lessonNodeId);
    else if (isPassing === false) failures.set(lessonNodeId, (failures.get(lessonNodeId) ?? 0) + 1);
  }
  const incompleteIds = new Set<string>();
  for (const node of nodes) {
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
