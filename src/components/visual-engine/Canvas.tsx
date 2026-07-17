'use client';

import React, { useState } from 'react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface BlockData {
  id: string;
  type: 'heading' | 'text' | 'image' | 'form';
  content: any;
}

interface SortableBlockProps {
  block: BlockData;
  onUpdate: (id: string, content: any) => void;
}

function SortableBlock({ block, onUpdate }: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: '16px',
    marginBottom: '8px',
    backgroundColor: '#fff',
    border: '1px solid var(--q-color-ink-100)',
    borderRadius: '8px',
    cursor: 'grab',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {block.type === 'heading' && (
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{block.content.text}</h2>
      )}
      {block.type === 'text' && (
        <p style={{ margin: 0, color: 'var(--q-color-ink-700)' }}>{block.content.text}</p>
      )}
      {block.type === 'form' && (
        <div style={{ padding: '16px', border: '1px dashed var(--q-color-ink-300)', borderRadius: '4px' }}>
          Form Block: {block.content.formId}
        </div>
      )}
    </div>
  );
}

export function VisualCanvas({ initialBlocks, onSave }: { initialBlocks: BlockData[], onSave?: (blocks: BlockData[]) => void }) {
  const [blocks, setBlocks] = useState<BlockData[]>(initialBlocks);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setBlocks((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newArray = arrayMove(items, oldIndex, newIndex);
        if (onSave) onSave(newArray);
        return newArray;
      });
    }
  };

  const handleUpdate = (id: string, content: any) => {
    setBlocks(items => items.map(b => b.id === id ? { ...b, content } : b));
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
          {blocks.map(block => (
            <SortableBlock key={block.id} block={block} onUpdate={handleUpdate} />
          ))}
          {blocks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--q-color-ink-500)', border: '1px dashed var(--q-color-ink-300)', borderRadius: '8px' }}>
              Drag and drop blocks here
            </div>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}
