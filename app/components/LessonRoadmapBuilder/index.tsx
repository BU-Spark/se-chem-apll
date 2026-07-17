'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node as XYNode,
  type Edge as XYEdge,
  type Connection,
  type OnConnect,
  type EdgeChange,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { LessonNodeEntry } from '@/app/components/LessonBuilder/NodeCard';
import type { LessonEdgeEntry } from '@/app/types';
import { wouldCreateCycle } from '@/app/utils/dagValidation';
import styles from './LessonRoadmapBuilder.module.css';

interface Props {
  lessonNodes: LessonNodeEntry[];
  edges: LessonEdgeEntry[];
  onEdgesChange: (edges: LessonEdgeEntry[]) => void;
}

interface RoadmapNodeData {
  label: string;
  preLectureCount: number;
  [key: string]: unknown;
}

function RoadmapNode({ data }: { data: RoadmapNodeData }) {
  return (
    <div className={styles.graphNode}>
      <Handle type="target" position={Position.Top} />
      <span className={styles.graphNodeLabel}>{data.label}</span>
      {data.preLectureCount > 0 && <span className={styles.preQuizBadge}>Pre-quiz</span>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// Defined outside component so ReactFlow doesn't re-register on every render
const nodeTypes = { roadmapNode: RoadmapNode };

function toXYNodes(nodes: LessonNodeEntry[]): XYNode[] {
  return nodes.map((n, i) => ({
    id: n.instanceId,
    type: 'roadmapNode',
    position: { x: 220 * (i % 4), y: 130 * Math.floor(i / 4) },
    data: { label: n.title, preLectureCount: n.preLectureCount } as RoadmapNodeData,
  }));
}

function toXYEdges(edges: LessonEdgeEntry[]): XYEdge[] {
  return edges.map((e) => ({
    id: e.edgeId,
    source: e.sourceInstanceId,
    target: e.targetInstanceId,
    markerEnd: { type: MarkerType.ArrowClosed },
  }));
}

export default function LessonRoadmapBuilder({ lessonNodes, edges, onEdgesChange }: Props) {
  const [connectError, setConnectError] = useState<string | null>(null);

  const initialNodes = useMemo(() => toXYNodes(lessonNodes), [lessonNodes]);
  const initialEdges = useMemo(() => toXYEdges(edges), [edges]);

  const [xyNodes, , onNodesChange] = useNodesState(initialNodes);
  const [xyEdges, setXYEdges, onXYEdgesChange] = useEdgesState(initialEdges);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target) return;
      setConnectError(null);

      if (source === target) {
        setConnectError('A node cannot connect to itself.');
        return;
      }

      const duplicate = edges.some((e) => e.sourceInstanceId === source && e.targetInstanceId === target);
      if (duplicate) {
        setConnectError('This connection already exists.');
        return;
      }

      if (wouldCreateCycle(edges, source, target)) {
        setConnectError('This connection would create a cycle. Only directed acyclic graphs are permitted.');
        return;
      }

      setXYEdges((prev) => addEdge({ ...connection, markerEnd: { type: MarkerType.ArrowClosed } }, prev));

      onEdgesChange([
        ...edges,
        {
          edgeId: crypto.randomUUID(),
          sourceInstanceId: source,
          targetInstanceId: target,
        },
      ]);
    },
    [edges, onEdgesChange, setXYEdges]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onXYEdgesChange(changes);
      const removedIds = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
      if (removedIds.size > 0) {
        onEdgesChange(edges.filter((e) => !removedIds.has(e.edgeId)));
      }
    },
    [edges, onEdgesChange, onXYEdgesChange]
  );

  if (lessonNodes.length === 0) {
    return (
      <div className={styles.empty}>
        Add nodes in the &ldquo;Build lesson&rdquo; tab first, then return here to draw the roadmap.
      </div>
    );
  }

  return (
    <>
      <div className={styles.canvas}>
        <ReactFlow
          nodes={xyNodes}
          edges={xyEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          fitView
          deleteKeyCode="Backspace"
        >
          <Background />
          <Controls />
          <MiniMap nodeStrokeWidth={3} />
        </ReactFlow>
      </div>
      {connectError && <p className={styles.error}>{connectError}</p>}
      <p className={styles.hint}>
        Drag between node handles to connect. Select an edge and press <kbd>Backspace</kbd> to delete it.
      </p>
    </>
  );
}
