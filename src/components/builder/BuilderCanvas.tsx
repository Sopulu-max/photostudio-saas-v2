'use client';

import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, GripVertical } from 'lucide-react';
import { BlockInstance } from './types';
import { Blocks } from './BlockRegistry';

interface BuilderCanvasProps {
  instances: BlockInstance[];
  selectedInstanceId: string | null;
  onSelect: (id: string | null) => void;
  onReorder: (instances: BlockInstance[]) => void;
  onDelete: (id: string) => void;
}

// A wrapper for individual blocks inside the canvas
function SortableBlock({ 
  instance, 
  isSelected, 
  onSelect, 
  onDelete 
}: { 
  instance: BlockInstance; 
  isSelected: boolean; 
  onSelect: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: instance.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as 'relative',
    marginBottom: '24px',
    cursor: 'pointer',
    borderRadius: '8px',
    border: isSelected ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
    padding: '16px',
    background: isSelected ? 'rgba(59, 130, 246, 0.02)' : 'transparent',
  };

  const def = Blocks[instance.type];
  if (!def) return null;

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className="canvas-block-wrapper"
    >
      {/* Selection controls (only visible on hover/select) */}
      <div 
        className="canvas-block-controls"
        style={{
          position: 'absolute',
          top: '-14px',
          right: '16px',
          display: isSelected ? 'flex' : 'none',
          gap: '4px',
          background: 'var(--color-surface-elevated)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '6px',
          padding: '4px',
          boxShadow: 'var(--shadow-sm)',
          zIndex: 10
        }}
        onClick={e => e.stopPropagation()}
      >
        <div 
          {...attributes} 
          {...listeners} 
          style={{ cursor: 'grab', padding: '4px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center' }}
        >
          <GripVertical size={16} />
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ 
            cursor: 'pointer', padding: '4px', color: 'var(--color-state-halted)', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center' 
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Actual Block Rendering */}
      <div style={{ pointerEvents: 'none' }}>
        {def.renderCanvas({ data: instance.data })}
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .canvas-block-wrapper:hover {
          border: 2px solid ${isSelected ? 'var(--color-brand-primary)' : 'var(--color-border-subtle)'} !important;
        }
        .canvas-block-wrapper:hover .canvas-block-controls {
          display: flex !important;
        }
      `}} />
    </div>
  );
}

export default function BuilderCanvas({
  instances,
  selectedInstanceId,
  onSelect,
  onReorder,
  onDelete
}: BuilderCanvasProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = instances.findIndex(i => i.id === active.id);
      const newIndex = instances.findIndex(i => i.id === over.id);
      onReorder(arrayMove(instances, oldIndex, newIndex));
    }
  };

  return (
    <div 
      style={{
        flex: 1,
        background: 'var(--color-background)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px',
        overflowY: 'auto'
      }}
      onClick={() => onSelect(null)} // Deselect when clicking empty space
    >
      <div style={{
        width: '100%',
        maxWidth: '800px',
        minHeight: '800px',
        background: 'var(--color-surface-base)',
        borderRadius: '16px',
        border: '1px solid var(--color-border-subtle)',
        boxShadow: '0 40px 80px rgba(0,0,0,0.05)',
        padding: '40px'
      }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={instances.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {instances.length === 0 ? (
              <div style={{
                textAlign: 'center',
                color: 'var(--color-text-tertiary)',
                padding: '100px 0',
                fontSize: '1rem'
              }}>
                Canvas is empty. Add blocks from the sidebar.
              </div>
            ) : (
              instances.map(inst => (
                <SortableBlock
                  key={inst.id}
                  instance={inst}
                  isSelected={inst.id === selectedInstanceId}
                  onSelect={() => onSelect(inst.id)}
                  onDelete={() => onDelete(inst.id)}
                />
              ))
            )}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
