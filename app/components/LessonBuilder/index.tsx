'use client';

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { generateClientId } from '@/lib/generateClientId';
import NodePalette, { PaletteNode } from './NodePalette';
import NodeCard, { LessonNodeEntry } from './NodeCard';
import styles from './LessonBuilder.module.css';

interface Props {
  availableNodes: PaletteNode[];
  entries: LessonNodeEntry[];
  onChange: (entries: LessonNodeEntry[]) => void;
}

export default function LessonBuilder({ availableNodes, entries, onChange }: Props) {
  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = entries.findIndex((e) => e.instanceId === active.id);
    const newIndex = entries.findIndex((e) => e.instanceId === over.id);
    onChange(arrayMove(entries, oldIndex, newIndex));
  }

  function addNode(node: PaletteNode) {
    onChange([
      ...entries,
      {
        instanceId: generateClientId('lesson-node'),
        nodeId: node.id,
        title: node.title,
        defaultPassingPercent: node.defaultPassingPercent,
        passingPercentOverride: '',
        isRequired: true,
        preLectureCount: node.preLectureCount,
      },
    ]);
  }

  function updateEntry(instanceId: string, patch: Partial<LessonNodeEntry>) {
    onChange(entries.map((e) => (e.instanceId === instanceId ? { ...e, ...patch } : e)));
  }

  function removeEntry(instanceId: string) {
    onChange(entries.filter((e) => e.instanceId !== instanceId));
  }

  return (
    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
      <NodePalette nodes={availableNodes} onAdd={addNode} />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={entries.map((e) => e.instanceId)} strategy={verticalListSortingStrategy}>
          <div className={styles.canvas}>
            {entries.length === 0 ? (
              <div className={styles.canvasEmpty}>Add nodes from the library on the left to build your lesson.</div>
            ) : (
              entries.map((entry, idx) => (
                <NodeCard
                  key={entry.instanceId}
                  entry={entry}
                  index={idx}
                  onChange={(patch) => updateEntry(entry.instanceId, patch)}
                  onRemove={() => removeEntry(entry.instanceId)}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
