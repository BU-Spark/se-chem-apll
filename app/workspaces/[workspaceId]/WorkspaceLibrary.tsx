'use client';
import { useState } from 'react';
import Link from 'next/link';
import NodesGrid from '@/app/instructor/nodes/NodesGrid';
import LessonsGrid from '@/app/instructor/lessons/LessonsGrid';
import { readNodeFilters, type NodeListItem } from '@/app/instructor/nodes/listFilters';
import { readLessonFilters, type LessonListItem } from '@/app/instructor/lessons/listFilters';
import gridStyles from '@/app/components/InstructorGrid/grid.module.css';
import styles from '../workspaces.module.css';

type Props = {
  workspaceId: string;
  nodes: NodeListItem[];
  lessons: LessonListItem[];
  courses: { id: string; title: string }[];
  canEdit: boolean;
  canDelete: boolean;
};
export default function WorkspaceLibrary({ workspaceId, nodes, lessons, courses, canEdit, canDelete }: Props) {
  const [tab, setTab] = useState<'nodes' | 'lessons'>('nodes');
  return (
    <section className={styles.library} aria-label="Shared content library">
      <div className={styles.libraryTabs} role="tablist" aria-label="Library content">
        {(['nodes', 'lessons'] as const).map((kind) => (
          <button
            key={kind}
            id={`workspace-${kind}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === kind}
            aria-controls={`workspace-${kind}-panel`}
            tabIndex={tab === kind ? 0 : -1}
            className={`${styles.libraryTab} ${tab === kind ? styles.selectedLibraryTab : ''}`}
            onClick={() => setTab(kind)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 'nodes'
                  : event.key === 'End'
                    ? 'lessons'
                    : kind === 'nodes'
                      ? 'lessons'
                      : 'nodes';
              setTab(next);
              document.getElementById(`workspace-${next}-tab`)?.focus();
            }}
          >
            {kind === 'nodes' ? 'Nodes' : 'Lessons'}{' '}
            <span className={styles.tabCount}>{kind === 'nodes' ? nodes.length : lessons.length}</span>
          </button>
        ))}
      </div>
      <div id="workspace-nodes-panel" role="tabpanel" aria-labelledby="workspace-nodes-tab" hidden={tab !== 'nodes'}>
        <div className={gridStyles.header}>
          <h2 className={gridStyles.title}>Nodes</h2>
          {canEdit && (
            <Link className={gridStyles.createButton} href={`/workspaces/${workspaceId}/nodes/new`}>
              + New node
            </Link>
          )}
        </div>
        <NodesGrid
          nodes={nodes}
          lessons={lessons.map((l) => ({ id: l.id, title: l.title, isDraft: l.isDraft }))}
          initialFilters={readNodeFilters({})}
          syncUrl={false}
          workspaceId={workspaceId}
          allowDelete={canDelete}
        />
      </div>
      <div
        id="workspace-lessons-panel"
        role="tabpanel"
        aria-labelledby="workspace-lessons-tab"
        hidden={tab !== 'lessons'}
      >
        <div className={gridStyles.header}>
          <h2 className={gridStyles.title}>Lessons</h2>
          {canEdit && (
            <Link className={gridStyles.createButton} href={`/workspaces/${workspaceId}/lessons/new`}>
              + New lesson
            </Link>
          )}
        </div>
        <LessonsGrid
          lessons={lessons}
          courses={courses}
          initialFilters={readLessonFilters({})}
          syncUrl={false}
          workspaceId={workspaceId}
          allowDelete={canDelete}
        />
      </div>
    </section>
  );
}
