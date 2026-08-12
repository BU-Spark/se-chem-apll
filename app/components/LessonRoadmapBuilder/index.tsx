'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  useNodesState,
  type Node as XYNode,
  type Edge as XYEdge,
  type Connection,
  type OnConnect,
  type EdgeChange,
  type EdgeProps,
  MarkerType,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { LessonNodeEntry } from '@/app/components/LessonBuilder/NodeCard';
import type { LessonEdgeEntry } from '@/app/types';
import NodeSearchPopup from './NodeSearchPopup';
import type { PaletteNode } from '@/app/components/LessonBuilder/NodePalette';
import { generateClientId } from '@/lib/generateClientId';
import { wouldCreateCycle } from '@/app/utils/dagValidation';
import styles from './LessonRoadmapBuilder.module.css';
import type { NodeSelectPayload } from './NodeSearchPopup';

interface Props {
  availableNodes: PaletteNode[];
  lessonNodes: LessonNodeEntry[];
  edges: LessonEdgeEntry[];
  onEdgesChange: (edges: LessonEdgeEntry[]) => void;
  onLessonNodesChange: (nodes: LessonNodeEntry[]) => void;
}

interface RoadmapNodeData {
  label: string;
  passingPercent: string;
  quizQuestionCount: string;
  isRequired: boolean;
  quizBankCount: number;
  [key: string]: unknown;
}

function RoadmapNode({ data }: { data: RoadmapNodeData }) {
  return (
    <div className={styles.graphNode}>
      <Handle type="target" position={Position.Top} />
      <span className={styles.graphNodeLabel}>{data.label}</span>
      <div className={styles.graphNodeMeta}>
        {data.passingPercent !== '' && <span className={styles.graphNodeChip}>{data.passingPercent}%</span>}
        {data.quizBankCount > 0 && <span className={styles.graphNodeChip}>{data.quizQuestionCount} Q</span>}
        {data.isRequired && <span className={styles.graphNodeFoundational}>Foundational</span>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// custom edge rendering that adds a delete button
interface DeletableEdgeData {
  onDelete: (edgeId: string) => void;
  [key: string]: unknown;
}

function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
}: EdgeProps<XYEdge<DeletableEdgeData>>) {
  // computes the curve between source and targer and returns the path string plus the coordinates of the middle point
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // draws the line and arrow head, same as default edge rendering
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} />
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={styles.edgeDeleteBtn}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onClick={() => data?.onDelete(id)}
            aria-label="Delete connection"
            title="Delete connection"
          >
            ×
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// Defined outside component so ReactFlow doesn't re-register on every render
const nodeTypes = { roadmapNode: RoadmapNode };
const edgeTypes = { deletable: DeletableEdge };

// reshape the app data into the expected shape for react flow
// nodes are in a 4 column grid, no persisted layout
function toXYNodes(nodes: LessonNodeEntry[]): XYNode[] {
  return nodes.map((n, i) => ({
    id: n.instanceId,
    type: 'roadmapNode',
    position: { x: 220 * (i % 4), y: 130 * Math.floor(i / 4) },
    data: {
      label: n.title,
      passingPercent: n.passingPercent,
      quizQuestionCount: n.quizQuestionCount,
      isRequired: n.isRequired,
      quizBankCount: n.quizBankCount,
    } satisfies RoadmapNodeData,
  }));
}

// maps each LessonEdgeEntry to an edge
// e.edgeId is the single id edge used everywhere, this was added to fix it not deleting in the backend
function toXYEdges(
  edges: LessonEdgeEntry[],
  onDelete: (edgeId: string) => void,
  selectedEdgeId: string | null
): XYEdge[] {
  return edges.map((e) => ({
    id: e.edgeId,
    source: e.sourceInstanceId,
    target: e.targetInstanceId,
    type: 'deletable', // routes everything through DeletableEdge
    selected: e.edgeId === selectedEdgeId, // Marks one edge as selected so the x pops up when you click on it
    markerEnd: { type: MarkerType.ArrowClosed },
    data: { onDelete }, // all edges get the same delete callback attached
  }));
}

export default function LessonRoadmapBuilder({
  availableNodes,
  lessonNodes,
  edges,
  onEdgesChange,
  onLessonNodesChange,
}: Props) {
  const [connectError, setConnectError] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null); // sets the edge id of the selected edge
  const [popupNode, setPopupNode] = useState(false);

  // `edges` (prop) is the single source of truth; xyNodes/xyEdges are derived from it on
  // every render rather than duplicated into separate ReactFlow-owned state. This keeps
  // edge ids consistent everywhere (no ReactFlow-generated id ever diverges from edgeId).
  const deleteEdge = useCallback(
    (edgeId: string) => {
      setConnectError(null); // clears error
      setSelectedEdgeId(null); // clears the id of the selected edge
      onEdgesChange(edges.filter((e) => e.edgeId !== edgeId));
    },
    [edges, onEdgesChange]
  );

  // edges are computed every render with useMemo, from lessonNodes and edges, and deleteEdge + selectedEdgeId
  // so there is no separate copy of the data inside react flow it just reders whatever the current props say
  const xyNodes = useMemo(() => toXYNodes(lessonNodes), [lessonNodes]);
  const xyEdges = useMemo(() => toXYEdges(edges, deleteEdge, selectedEdgeId), [edges, deleteEdge, selectedEdgeId]);

  // this still uses the react flow convinience hook
  const [nodesState, setNodes, onNodesChange] = useNodesState(xyNodes);

  // calls sedNodes(xyNodes) when lessonNodes changes to make sure that the graph updates when the popup closes
  useEffect(() => {
    setNodes(xyNodes);
  }, [xyNodes, setNodes]);

  // handles the connection of two nodes
  // if tests pass ita makes new LessonEdgeEntry and pushes it onto the edges array with onEdgesChange
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      // gives source and node id's
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

      onEdgesChange([
        ...edges,
        {
          edgeId: crypto.randomUUID(),
          sourceInstanceId: source,
          targetInstanceId: target,
        },
      ]);
    },
    [edges, onEdgesChange]
  );

  // we only care about removing edges for this handler; collects removed ids and filters them out of the array
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removedIds = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
      if (removedIds.size > 0) {
        setSelectedEdgeId(null);
        onEdgesChange(edges.filter((e) => !removedIds.has(e.edgeId)));
      }
    },
    [edges, onEdgesChange]
  );

  const handleSelect = useCallback(
    ({ node, passingPercent, quizQuestionCount, isRequired }: NodeSelectPayload) => {
      onLessonNodesChange([
        ...lessonNodes,
        {
          instanceId: generateClientId('lesson-node'),
          nodeId: node.id,
          title: node.title,
          passingPercent,
          quizQuestionCount,
          isRequired,
          quizBankCount: node.quizBankCount,
        },
      ]);
      setPopupNode(false);
    },
    [lessonNodes, onLessonNodesChange]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes); // keep drag/select working
      const removedIds = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
      if (removedIds.size === 0) return;
      onLessonNodesChange(lessonNodes.filter((n) => !removedIds.has(n.instanceId)));
    },
    [onNodesChange, lessonNodes, onLessonNodesChange]
  );

  return (
    <>
      <div className={styles.canvas}>
        <ReactFlow
          nodes={nodesState}
          edges={xyEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onEdgeClick={(_, edge) => setSelectedEdgeId(edge.id)}
          onPaneClick={() => {
            setSelectedEdgeId(null);
            setPopupNode(true);
          }}
          fitView
          deleteKeyCode="Backspace"
          panOnDrag={[1, 2]}
          panOnScroll
        >
          <Background />
          <Controls />
          <MiniMap nodeStrokeWidth={3} />
        </ReactFlow>
        {popupNode && (
          <NodeSearchPopup nodes={availableNodes} onSelect={handleSelect} onClose={() => setPopupNode(false)} />
        )}
      </div>
      {connectError && <p className={styles.error}>{connectError}</p>}
      <p className={styles.hint}>
        Drag between blue dots to connect. Click a connection and use the{' '}
        <span className={styles.edgeDeleteHintIcon}>×</span> button (or press <kbd>Backspace</kbd>) to delete it.
      </p>
    </>
  );
}
