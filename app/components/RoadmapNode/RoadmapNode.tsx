import Link from 'next/link';
import { NODE_STATUS_LABELS, type NodeStatus } from '@/app/utils/progressStatus';
import { CheckIcon, CrossCircleIcon, HexagonIcon, LockIcon, StarIcon } from './icons';
import styles from './RoadmapNode.module.css';

interface RoadmapNodeProps {
  title: string;
  isFoundational: boolean;
  status: NodeStatus;
  // Where the node opens; nodes without one (locked) only show their tooltip.
  href?: string;
}

function NodeIcon({ isFoundational, status }: Pick<RoadmapNodeProps, 'isFoundational' | 'status'>) {
  if (status === 'COMPLETED') return <CheckIcon />;
  if (status === 'INCOMPLETE') return <CrossCircleIcon />;
  if (status === 'LOCKED') return <LockIcon />;
  return isFoundational ? <StarIcon /> : <HexagonIcon />;
}

// One node on a lesson roadmap: opens the node when it has an href; hover or focus shows its tooltip.
export default function RoadmapNode({ title, isFoundational, status, href }: RoadmapNodeProps) {
  const type = isFoundational ? 'Foundational' : 'Regular';
  const statusLabel = NODE_STATUS_LABELS[status];
  const className = `${styles.node} ${styles[status]}`;
  const label = `${title}, ${type}, ${statusLabel}`;
  const content = (
    <>
      <NodeIcon isFoundational={isFoundational} status={status} />
      <span className={styles.tooltip} aria-hidden="true">
        <span className={styles.tooltipTitle}>{title}</span>
        <span className={styles.tooltipDetail}>
          {type} · {statusLabel}
        </span>
      </span>
    </>
  );

  return href ? (
    <Link href={href} className={className} aria-label={label}>
      {content}
    </Link>
  ) : (
    <button type="button" className={className} aria-label={label}>
      {content}
    </button>
  );
}
