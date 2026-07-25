'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Renderer, VisualNode } from './Renderer';

interface BuilderCanvasProps {
  rootNode: VisualNode;
  activeId: string | null;
  onSelectNode: (id: string) => void;
  /**
   * The real record this layout is bound to (e.g. a service), so bound blocks
   * render with actual data. Same shape the live page receives — that's what
   * makes this WYSIWYG. Defaults to empty for unbound (org-level) layouts.
   */
  dataContext?: Record<string, any>;
}

/**
 * One top-level block, rendered by the *real* Renderer (so it looks exactly
 * like the live page) with an editing layer on top: click to select, drag to
 * reorder, a subtle outline when selected. The rendered content itself is made
 * non-interactive so clicks select the block instead of, say, pressing a button.
 */
function SortableBlock({
  node,
  isSelected,
  onSelectNode,
  dataContext,
}: {
  node: VisualNode;
  isSelected: boolean;
  onSelectNode: (id: string) => void;
  dataContext: Record<string, any>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    outline: isSelected ? '2px solid var(--q-color-accent)' : '2px solid transparent',
    outlineOffset: '-2px',
    cursor: 'grab',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onSelectNode(node.id);
      }}
    >
      {isSelected && (
        <span
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            fontSize: '0.62rem',
            fontWeight: 600,
            background: 'var(--q-color-accent)',
            color: '#fff',
            padding: '2px 6px',
            borderRadius: '0 0 4px 0',
            zIndex: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            pointerEvents: 'none',
          }}
        >
          {node.type}
        </span>
      )}
      {/* Rendered content is non-interactive in the builder so the wrapper
          receives the click/drag, not the block's own buttons/inputs. */}
      <div style={{ pointerEvents: 'none' }}>
        <Renderer node={node} dataContext={dataContext} />
      </div>
    </div>
  );
}

export function BuilderCanvas({ rootNode, activeId, onSelectNode, dataContext = {} }: BuilderCanvasProps) {
  const { setNodeRef } = useDroppable({ id: 'canvas-root' });
  const children = rootNode.children || [];

  return (
    <div
      ref={setNodeRef}
      onClick={() => onSelectNode(rootNode.id)}
      style={{ flex: 1, overflowY: 'auto', background: 'var(--q-color-paper-subtle)', padding: '32px' }}
    >
      {/* The page surface — a real page you're designing, not a wireframe. */}
      <div
        style={{
          maxWidth: '920px',
          margin: '0 auto',
          background: 'var(--q-color-paper-base)',
          minHeight: '70vh',
          borderRadius: '12px',
          boxShadow: 'var(--q-shadow-md)',
        }}
      >
        <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {children.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '96px 24px', color: 'var(--q-color-ink-400)' }}>
              Drag blocks here to start building your page
            </div>
          ) : (
            children.map((child) => (
              <SortableBlock
                key={child.id}
                node={child}
                isSelected={activeId === child.id}
                onSelectNode={onSelectNode}
                dataContext={dataContext}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
