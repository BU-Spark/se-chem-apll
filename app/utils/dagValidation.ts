import type { LessonEdgeEntry } from '@/app/types';

/**
 * Returns true when adding a proposed edge (from → to) would create a cycle.
 * Uses iterative DFS from `to`; if it can reach `from`, a cycle would result.
 */
export function wouldCreateCycle(existingEdges: LessonEdgeEntry[], from: string, to: string): boolean {
  const adj = new Map<string, string[]>();
  for (const { sourceInstanceId, targetInstanceId } of existingEdges) {
    if (!adj.has(sourceInstanceId)) adj.set(sourceInstanceId, []);
    adj.get(sourceInstanceId)!.push(targetInstanceId);
  }

  const visited = new Set<string>();
  const stack = [to];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === from) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const neighbor of adj.get(node) ?? []) {
      stack.push(neighbor);
    }
  }
  return false;
}

/**
 * Returns true when the given edge list is acyclic (valid DAG).
 * Uses Kahn's algorithm (topological sort). Used for server-side validation.
 */
export function isAcyclic(edges: Array<{ sourceId: string; targetId: string }>): boolean {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const { sourceId, targetId } of edges) {
    if (!adj.has(sourceId)) adj.set(sourceId, []);
    adj.get(sourceId)!.push(targetId);
    inDegree.set(targetId, (inDegree.get(targetId) ?? 0) + 1);
    if (!inDegree.has(sourceId)) inDegree.set(sourceId, 0);
  }

  const queue = [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([id]) => id);

  let visited = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    visited++;
    for (const neighbor of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }
  return visited === inDegree.size;
}
