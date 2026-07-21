'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { VisualNode } from './Renderer';

interface BuilderCanvasProps {
  rootNode: VisualNode;
  activeId: string | null;
  onSelectNode: (id: string) => void;
}

function SortableItem({ node, onSelectNode, isSelected }: { node: VisualNode, onSelectNode: (id: string) => void, isSelected: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    border: isSelected ? '2px solid var(--q-color-accent)' : '1px dashed var(--q-color-ink-300)',
    padding: '8px',
    margin: '4px 0',
    backgroundColor: 'var(--q-color-paper)',
    cursor: 'grab'
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={(e) => { e.stopPropagation(); onSelectNode(node.id); }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-500)', marginBottom: '4px' }}>{node.type} ({node.id})</div>
      {node.type === 'Text' && <div style={node.props.style}>{node.props.text || 'Empty Text'}</div>}
      {node.type === 'Button' && <button className="q-btn q-btn-secondary" style={node.props.style}>{node.props.text || 'Button'}</button>}
      {node.type === 'Container' && (
        <div style={{ minHeight: '50px', ...node.props.style }}>
          {node.children?.map(child => (
            <SortableItem key={child.id} node={child} onSelectNode={onSelectNode} isSelected={false} />
          ))}
        </div>
      )}
    </div>
  );
}

export function BuilderCanvas({ rootNode, activeId, onSelectNode }: BuilderCanvasProps) {
  const { setNodeRef } = useDroppable({ id: 'canvas-root' });

  return (
    <div 
      ref={setNodeRef} 
      style={{ 
        flex: 1, 
        padding: '24px', 
        backgroundColor: '#f9f9f9', 
        overflowY: 'auto' 
      }}
      onClick={() => onSelectNode(rootNode.id)}
    >
      <SortableContext items={rootNode.children?.map(c => c.id) || []} strategy={verticalListSortingStrategy}>
        <div style={{ 
          minHeight: '100%', 
          border: activeId === rootNode.id ? '2px solid var(--q-color-accent)' : '2px dashed transparent' 
        }}>
          {rootNode.children?.map(child => (
            <SortableItem key={child.id} node={child} onSelectNode={onSelectNode} isSelected={activeId === child.id} />
          ))}
          {(!rootNode.children || rootNode.children.length === 0) && (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--q-color-ink-400)' }}>
              Drag components here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
