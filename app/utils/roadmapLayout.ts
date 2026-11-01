import type { LessonEdgeEntry } from '@/app/types';

interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

/** Deterministic, top-to-bottom DAG layout, with disconnected components side by side. */
export function layoutRoadmap(nodes: LayoutNode[], edges: LessonEdgeEntry[]): Record<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const children = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  const parents = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of edges) {
    if (!byId.has(edge.sourceInstanceId) || !byId.has(edge.targetInstanceId)) continue;
    children.get(edge.sourceInstanceId)!.add(edge.targetInstanceId);
    parents.get(edge.targetInstanceId)!.add(edge.sourceInstanceId);
  }

  const remaining = new Map(nodes.map((node) => [node.id, parents.get(node.id)!.size]));
  const ranks = new Map(nodes.map((node) => [node.id, 0]));
  const queue = nodes.filter((node) => remaining.get(node.id) === 0).map((node) => node.id);
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    for (const child of children.get(id)!) {
      ranks.set(child, Math.max(ranks.get(child)!, ranks.get(id)! + 1));
      remaining.set(child, remaining.get(child)! - 1);
      if (remaining.get(child) === 0) queue.push(child);
    }
  }
  if (queue.length !== nodes.length) throw new Error('Cannot tidy a roadmap that contains a cycle.');

  const positions: Record<string, { x: number; y: number }> = {};
  const visited = new Set<string>();
  let componentX = 0;
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const component = [node.id];
    visited.add(node.id);
    for (let index = 0; index < component.length; index++) {
      const id = component[index];
      for (const neighbor of [...children.get(id)!, ...parents.get(id)!]) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        component.push(neighbor);
      }
    }

    const layers: string[][] = [];
    for (const id of component) (layers[ranks.get(id)!] ??= []).push(id);
    for (const layer of layers) layer.sort((a, b) => order.get(a)! - order.get(b)!);

    // Order siblings near their neighbors to reduce crossings, with stable ties.
    const slots = new Map<string, number>();
    const updateSlots = () => {
      for (const layer of layers) layer.forEach((id, index) => slots.set(id, (index + 0.5) / layer.length));
    };
    const sortLayer = (layer: string[], neighbors: Map<string, Set<string>>) => {
      const average = (id: string) => {
        const adjacent = [...neighbors.get(id)!];
        return adjacent.length
          ? adjacent.reduce((sum, neighbor) => sum + slots.get(neighbor)!, 0) / adjacent.length
          : slots.get(id)!;
      };
      layer.sort((a, b) => average(a) - average(b) || order.get(a)! - order.get(b)!);
      updateSlots();
    };
    updateSlots();
    for (let pass = 0; pass < 3; pass++) {
      for (let rank = layers.length - 2; rank >= 0; rank--) sortLayer(layers[rank], children);
      for (let rank = 1; rank < layers.length; rank++) sortLayer(layers[rank], parents);
    }

    const layerWidths = layers.map(
      (layer) => layer.reduce((sum, id) => sum + byId.get(id)!.width, 0) + (layer.length - 1) * 70
    );
    const componentWidth = Math.max(...layerWidths);
    let y = 0;
    layers.forEach((layer, rank) => {
      let x = componentX + (componentWidth - layerWidths[rank]) / 2;
      for (const id of layer) {
        positions[id] = { x, y };
        x += byId.get(id)!.width + 70;
      }
      y += Math.max(...layer.map((id) => byId.get(id)!.height)) + 100;
    });
    componentX += componentWidth + 140;
  }
  return positions;
}
