import { nodeKey, type WorkNode } from '@/lib/submissions/content';
import type { WorkAttempt } from '@/lib/submissions/workState';

export function workNode(id: string, title = id, isRequired = true): WorkNode {
  return {
    id,
    isRequired,
    passingPercent: 70,
    quizQuestionCount: 1,
    node: {
      title,
      isDraft: false,
      quizQuestions: [{ id: `${id}-q`, options: ['A', 'B'], correctIndices: [0], variants: [] }],
      checkpoints: [],
    },
  } as unknown as WorkNode;
}
export function workAttempt(node: WorkNode, overrides: Partial<WorkAttempt> = {}): WorkAttempt {
  return {
    id: `${node.id}-attempt`,
    lessonNodeId: node.id,
    kind: 'QUIZ',
    purpose: 'STANDARD',
    contentKey: nodeKey(node),
    completedAt: new Date('2026-10-24T11:00:00Z'),
    isPassing: true,
    ...overrides,
  };
}
