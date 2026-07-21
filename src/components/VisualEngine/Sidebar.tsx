'use client';

import React from 'react';
import { VisualNode } from './Renderer';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

const COMPONENTS = ['Text', 'Button', 'Container', 'Image'];

function DraggableTool({ type }: { type: string }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `tool-${type}`,
    data: { type }
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  return (
    <div 
      ref={setNodeRef} 
      style={{ 
        padding: '12px', 
        border: '1px solid var(--q-color-ink-200)', 
        borderRadius: '6px', 
        marginBottom: '8px', 
        cursor: 'grab', 
        backgroundColor: 'white',
        ...style 
      }} 
      {...listeners} 
      {...attributes}
    >
      {type}
    </div>
  );
}

interface SidebarProps {
  activeNode: VisualNode | null;
  onUpdateNode: (node: VisualNode) => void;
}

export function Sidebar({ activeNode, onUpdateNode }: SidebarProps) {
  return (
    <div style={{ width: '300px', borderLeft: '1px solid var(--q-color-ink-200)', backgroundColor: 'var(--q-color-paper)', display: 'flex', flexDirection: 'column' }}>
      
      {/* Toolbox */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--q-color-ink-200)' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Components</h3>
        {COMPONENTS.map(c => <DraggableTool key={c} type={c} />)}
      </div>

      {/* Properties Editor */}
      <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Properties</h3>
        
        {!activeNode ? (
          <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>Select a node to edit properties.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px' }}>Type</label>
              <input disabled value={activeNode.type} style={{ width: '100%', padding: '6px', fontSize: '0.875rem', borderRadius: '4px', border: '1px solid var(--q-color-ink-200)', background: '#f5f5f5' }} />
            </div>

            {['Text', 'Button'].includes(activeNode.type) && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px' }}>Text Content</label>
                <input 
                  value={activeNode.props.text || ''} 
                  onChange={e => onUpdateNode({ ...activeNode, props: { ...activeNode.props, text: e.target.value } })}
                  style={{ width: '100%', padding: '6px', fontSize: '0.875rem', borderRadius: '4px', border: '1px solid var(--q-color-ink-300)' }} 
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px' }}>Data Binding Path</label>
              <input 
                value={activeNode.bind || ''} 
                onChange={e => onUpdateNode({ ...activeNode, bind: e.target.value })}
                placeholder="e.g. agreement.terms.base_price"
                style={{ width: '100%', padding: '6px', fontSize: '0.875rem', borderRadius: '4px', border: '1px solid var(--q-color-ink-300)', fontFamily: 'monospace' }} 
              />
            </div>
            
            <button className="q-btn q-btn-secondary" style={{ color: 'red', marginTop: '16px' }}>
              Delete Node
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
