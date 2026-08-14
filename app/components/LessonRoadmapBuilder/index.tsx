'use client';

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  ReactFlowProvider,
  useReactFlow,
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
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { PaletteNode, LessonNodeEntry, LessonEdgeEntry } from '@/app/types';
import NodeSearchPopup from './NodeSearchPopup';
import { generateClientId } from '@/lib/generateClientId';
import { wouldCreateCycle } from '@/app/utils/dagValidation';
import styles from './LessonRoadmapBuilder.module.css';
import type { NodeSelectPayload } from './NodeSearchPopup';
import NodeEditPopup from './NodeEditPopup';

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
  onDelete?: (instanceId: string) => void;
  [key: string]: unknown;
}
function RoadmapNode({ id, data }: NodeProps & { data: RoadmapNodeData }) {
  return (
    <div className={styles.graphNode}>
      <Handle type="target" position={Position.Top} />
      <button
        type="button"
        className={styles.graphNodeDeleteBtn}
        aria-label="Delete node"
        title="Delete node"
        onClick={(e) => {
          e.stopPropagation();
          data.onDelete?.(id);
        }}
      >
        ×
      </button>
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

function LessonRoadmapBuilderInner({ availableNodes, lessonNodes, edges, onEdgesChange, onLessonNodesChange }: Props) {
  const [connectError, setConnectError] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null); // sets the edge id of the selected edge
  const [popupNode, setPopupNode] = useState(false);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  // for storing positions
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null);
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const { screenToFlowPosition } = useReactFlow();

  const editingNode = lessonNodes.find((n) => n.instanceId === editingInstanceId) ?? null;

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

  const deleteLessonNode = useCallback(
    (instanceId: string) => {
      delete positionsRef.current[instanceId];
      if (editingInstanceId === instanceId) setEditingInstanceId(null);
      onLessonNodesChange(lessonNodes.filter((n) => n.instanceId !== instanceId));
    },
    [lessonNodes, onLessonNodesChange, editingInstanceId]
  );

  // edges are computed every render with useMemo, from lessonNodes and edges, and deleteEdge + selectedEdgeId
  // so there is no separate copy of the data inside react flow it just reders whatever the current props say
  const xyNodes = useMemo(() => toXYNodes(lessonNodes), [lessonNodes]);
  const xyEdges = useMemo(() => toXYEdges(edges, deleteEdge, selectedEdgeId), [edges, deleteEdge, selectedEdgeId]);

  // this still uses the react flow convinience hook
  const [nodesState, setNodes, onNodesChange] = useNodesState(xyNodes);

  // calls sedNodes(xyNodes) when lessonNodes changes to make sure that the graph updates when the popup closes
  useEffect(() => {
    setNodes((current) => {
      const prev = new Map(current.map((n) => [n.id, n]));
      return lessonNodes.map((n, i) => {
        const existing = prev.get(n.instanceId);
        const fallback = { x: 220 * (i % 4), y: 130 * Math.floor(i / 4) };
        const position = positionsRef.current[n.instanceId] ?? existing?.position ?? fallback;
        positionsRef.current[n.instanceId] = position;
        return {
          id: n.instanceId,
          type: 'roadmapNode' as const,
          position,
          data: {
            label: n.title,
            onDelete: deleteLessonNode,
            passingPercent: n.passingPercent,
            quizQuestionCount: n.quizQuestionCount,
            isRequired: n.isRequired,
            quizBankCount: n.quizBankCount,
          } satisfies RoadmapNodeData,
        };
      });
    });
  }, [lessonNodes, setNodes, deleteLessonNode]);

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
      const instanceId = generateClientId('lesson-node');
      const i = lessonNodes.length;
      const fallback = { x: 220 * (i % 4), y: 130 * Math.floor(i / 4) };
      positionsRef.current[instanceId] = pendingPosition ?? fallback;
      onLessonNodesChange([
        ...lessonNodes,
        {
          instanceId,
          nodeId: node.id,
          title: node.title,
          passingPercent,
          quizQuestionCount,
          isRequired,
          quizBankCount: node.quizBankCount,
        },
      ]);
      setPendingPosition(null);
      setPopupNode(false);
    },
    [lessonNodes, onLessonNodesChange, pendingPosition]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      for (const change of changes) {
        if (change.type === 'position' && change.position && change.dragging === false) {
          positionsRef.current[change.id] = change.position;
        }
      }
      const removedIds = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
      if (removedIds.size === 0) return;
      for (const id of removedIds) {
        delete positionsRef.current[id];
      }
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
          onPaneClick={(event) => {
            setSelectedEdgeId(null);
            setEditingInstanceId(null);
            setPendingPosition(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
            setPopupNode(true);
          }}
          onNodeClick={(_, node) => {
            setSelectedEdgeId(null);
            setPopupNode(false);
            setPendingPosition(null);
            setEditingInstanceId(node.id);
          }}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          deleteKeyCode="Backspace"
          panOnDrag={[1, 2]}
          panOnScroll
        >
          <Background />
          <Controls />
          <MiniMap nodeStrokeWidth={3} />
        </ReactFlow>
        {popupNode && (
          <NodeSearchPopup
            nodes={availableNodes}
            onSelect={handleSelect}
            onClose={() => {
              setPopupNode(false);
              setPendingPosition(null);
            }}
          />
        )}
        {editingNode && (
          <NodeEditPopup
            title={editingNode.title}
            quizBankCount={editingNode.quizBankCount}
            initialPassingPercent={editingNode.passingPercent}
            initialQuizQuestionCount={editingNode.quizQuestionCount}
            initialIsRequired={editingNode.isRequired}
            onClose={() => setEditingInstanceId(null)}
            onSave={({ passingPercent, quizQuestionCount, isRequired }) => {
              onLessonNodesChange(
                lessonNodes.map((n) =>
                  n.instanceId === editingNode.instanceId ? { ...n, passingPercent, quizQuestionCount, isRequired } : n
                )
              );
              setEditingInstanceId(null);
            }}
          />
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

export default function LessonRoadmapBuilder(props: Props) {
  return (
    <ReactFlowProvider>
      <LessonRoadmapBuilderInner {...props} />
    </ReactFlowProvider>
  );
}
