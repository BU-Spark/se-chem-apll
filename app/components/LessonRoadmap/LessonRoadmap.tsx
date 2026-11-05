import { layoutRoadmap } from '@/app/utils/roadmapLayout';
import RoadmapNode from '@/app/components/RoadmapNode/RoadmapNode';
import type { RoadmapEdge, RoadmapNode as RoadmapNodeData } from '@/lib/studentLessonRoadmap';
import styles from './LessonRoadmap.module.css';

const NODE_SIZE = 64; // px, matches RoadmapNode's 4rem

// Lays the lesson's nodes out left to right along their arrows and draws the lines between them.
export default function LessonRoadmap({
  nodes,
  edges,
  nodeHref,
}: {
  nodes: RoadmapNodeData[];
  edges: RoadmapEdge[];
  // Link for a node the student can open (not locked).
  nodeHref: (nodeId: string) => string;
}) {
  // The team's layout runs top to bottom, so swap x and y to run left to right.
  const topDown = layoutRoadmap(
    nodes.map((node) => ({ id: node.id, width: NODE_SIZE, height: NODE_SIZE })),
    edges.map((edge) => ({
      edgeId: `${edge.sourceId}-${edge.targetId}`,
      sourceInstanceId: edge.sourceId,
      targetInstanceId: edge.targetId,
    }))
  );
  const position = (id: string) => ({ left: topDown[id].y, top: topDown[id].x });
  const center = (id: string) => ({ x: position(id).left + NODE_SIZE / 2, y: position(id).top + NODE_SIZE / 2 });

  const width = Math.max(...nodes.map((node) => position(node.id).left)) + NODE_SIZE;
  const height = Math.max(...nodes.map((node) => position(node.id).top)) + NODE_SIZE;

  return (
    <div className={styles.map} style={{ width, height }}>
      <svg className={styles.lines} width={width} height={height} aria-hidden="true">
        {edges.map((edge) => {
          const from = center(edge.sourceId);
          const to = center(edge.targetId);
          return <line key={`${edge.sourceId}-${edge.targetId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
        })}
      </svg>
      <ul className={styles.nodes} aria-label="Lesson nodes">
        {nodes.map((node) => (
          <li key={node.id} className={styles.slot} style={position(node.id)}>
            <RoadmapNode
              title={node.title}
              isFoundational={node.isFoundational}
              status={node.status}
              href={node.status === 'LOCKED' ? undefined : nodeHref(node.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
