'use client';

import React from 'react';
import { VisualNode } from './Renderer';
import { BLOCKS, BlockDef } from './blocks';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

function DraggableTool({ def }: { def: BlockDef }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `tool-${def.type}`,
    data: { type: def.type },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        padding: '12px',
        border: '1px solid var(--q-color-ink-200)',
        borderRadius: '10px',
        background: 'var(--q-color-paper-base)',
        cursor: 'grab',
        boxShadow: 'var(--q-shadow-sm)',
        transition: 'var(--q-transition-snappy)',
        opacity: isDragging ? 0.5 : 1,
        transform: transform ? CSS.Translate.toString(transform) : undefined,
      }}
    >
      <span style={{ fontSize: '0.85rem', fontWeight: 560, color: 'var(--q-color-ink-900)' }}>{def.label}</span>
      <span style={{ fontSize: '0.7rem', color: 'var(--q-color-ink-500)' }}>{def.hint}</span>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--q-font-mono)',
  fontSize: '0.64rem',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--q-color-ink-500)',
  marginBottom: '8px',
};

interface SidebarProps {
  activeNode: VisualNode | null;
  onUpdateNode: (node: VisualNode) => void;
  onDelete: (id: string) => void;
}

export function Sidebar({ activeNode, onUpdateNode, onDelete }: SidebarProps) {
  const canEditText = activeNode && ['Text', 'Button', 'Heading'].includes(activeNode.type);

  return (
    <div
      style={{
        width: '300px',
        flexShrink: 0,
        borderLeft: '1px solid var(--q-color-ink-200)',
        background: 'var(--q-color-paper-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {/* Palette */}
      <div style={{ padding: '18px', borderBottom: '1px solid var(--q-color-ink-200)' }}>
        <div style={labelStyle}>Blocks</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {BLOCKS.map((def) => (
            <DraggableTool key={def.type} def={def} />
          ))}
        </div>
      </div>

      {/* Properties */}
      <div style={{ padding: '18px', flex: 1 }}>
        <div style={labelStyle}>Properties</div>

        {!activeNode ? (
          <div style={{ fontSize: '0.85rem', color: 'var(--q-color-ink-500)', lineHeight: 1.5 }}>
            Select a block on the canvas to edit it.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ fontFamily: 'var(--q-font-mono)', fontSize: '0.72rem', color: 'var(--q-color-ink-600)' }}>
              {activeNode.type}
            </div>

            {canEditText && (
              <div>
                <label className="q-label">Text</label>
                <input
                  className="q-input"
                  value={activeNode.props.text || ''}
                  onChange={(e) => onUpdateNode({ ...activeNode, props: { ...activeNode.props, text: e.target.value } })}
                />
              </div>
            )}

            <div>
              <label className="q-label">
                Bind to data <span style={{ color: 'var(--q-color-ink-400)', fontWeight: 400 }}>(advanced)</span>
              </label>
              <input
                className="q-input"
                style={{ fontFamily: 'var(--q-font-mono)', fontSize: '0.8rem' }}
                value={activeNode.bind || ''}
                onChange={(e) => onUpdateNode({ ...activeNode, bind: e.target.value })}
                placeholder="service.pricing.base_price"
              />
              <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: 'var(--q-color-ink-500)' }}>
                Show real data here. A pick-a-field version is coming.
              </p>
            </div>

            <button
              onClick={() => onDelete(activeNode.id)}
              className="q-btn q-btn-outline"
              style={{ color: 'var(--q-color-danger)', borderColor: 'color-mix(in srgb, var(--q-color-danger) 40%, transparent)' }}
            >
              Delete block
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
