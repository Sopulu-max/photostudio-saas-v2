'use client';

import React, { useState } from 'react';
import { Layers, Settings, Plus } from 'lucide-react';
import { BuilderContext, BlockInstance } from './types';
import { Blocks, getBlocksForContext } from './BlockRegistry';

interface BuilderSidebarProps {
  context: BuilderContext;
  selectedInstanceId: string | null;
  instances: BlockInstance[];
  onAddBlock: (type: string) => void;
  onUpdateBlock: (id: string, data: any) => void;
}

export default function BuilderSidebar({
  context,
  selectedInstanceId,
  instances,
  onAddBlock,
  onUpdateBlock
}: BuilderSidebarProps) {
  const [activeTab, setActiveTab] = useState<'add' | 'properties'>('properties');
  
  const availableBlocks = getBlocksForContext(context);
  const selectedInstance = instances.find(i => i.id === selectedInstanceId);
  const selectedDefinition = selectedInstance ? Blocks[selectedInstance.type] : null;

  // If a block is selected, auto-switch to properties tab. (Handled via effect or just user intent, but here we just render).
  // Actually, let's just make it a dumb component and let the parent manage tab state if needed, or manage it here.

  return (
    <div style={{
      width: '300px',
      height: '100%',
      background: 'var(--color-surface-elevated)',
      borderLeft: '1px solid var(--color-border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-family-sans)'
    }}>
      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        <button
          onClick={() => setActiveTab('properties')}
          style={{
            flex: 1,
            padding: '16px 0',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'properties' ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
            color: activeTab === 'properties' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <Settings size={16} /> Properties
        </button>
        <button
          onClick={() => setActiveTab('add')}
          style={{
            flex: 1,
            padding: '16px 0',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'add' ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
            color: activeTab === 'add' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <Plus size={16} /> Add Block
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        {activeTab === 'add' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>
              Available Blocks
            </div>
            {availableBlocks.map(def => (
              <button
                key={def.type}
                onClick={() => onAddBlock(def.type)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  background: 'var(--color-surface-base)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  color: 'var(--color-text-primary)',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  textAlign: 'left'
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-brand-primary)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border-subtle)')}
              >
                <div style={{ color: 'var(--color-text-secondary)' }}>{def.icon}</div>
                <div>
                  <div style={{ fontSize: '0.9rem' }}>{def.label}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'properties' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {!selectedInstance || !selectedDefinition ? (
              <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '40px 20px', fontSize: '0.9rem' }}>
                <Layers size={32} style={{ opacity: 0.5, margin: '0 auto 16px auto' }} />
                Select a block on the canvas to edit its properties.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  {selectedDefinition.icon}
                  <span style={{ fontWeight: 600 }}>{selectedDefinition.label}</span>
                </div>

                {selectedDefinition.fields.map(field => (
                  <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                      {field.label}
                    </label>
                    {field.type === 'text' && (
                      <input
                        type="text"
                        value={selectedInstance.data[field.name] || ''}
                        onChange={e => onUpdateBlock(selectedInstance.id, { ...selectedInstance.data, [field.name]: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px',
                          background: 'var(--color-surface-base)',
                          border: '1px solid var(--color-border-subtle)',
                          borderRadius: '6px',
                          color: 'var(--color-text-primary)',
                          outline: 'none'
                        }}
                      />
                    )}
                    {field.type === 'textarea' && (
                      <textarea
                        value={selectedInstance.data[field.name] || ''}
                        onChange={e => onUpdateBlock(selectedInstance.id, { ...selectedInstance.data, [field.name]: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px',
                          background: 'var(--color-surface-base)',
                          border: '1px solid var(--color-border-subtle)',
                          borderRadius: '6px',
                          color: 'var(--color-text-primary)',
                          outline: 'none',
                          minHeight: '80px',
                          resize: 'vertical'
                        }}
                      />
                    )}
                    {field.type === 'number' && (
                      <input
                        type="number"
                        value={selectedInstance.data[field.name] || ''}
                        onChange={e => onUpdateBlock(selectedInstance.id, { ...selectedInstance.data, [field.name]: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px',
                          background: 'var(--color-surface-base)',
                          border: '1px solid var(--color-border-subtle)',
                          borderRadius: '6px',
                          color: 'var(--color-text-primary)',
                          outline: 'none'
                        }}
                      />
                    )}
                    {field.type === 'select' && field.options && (
                      <select
                        value={selectedInstance.data[field.name] || ''}
                        onChange={e => onUpdateBlock(selectedInstance.id, { ...selectedInstance.data, [field.name]: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px',
                          background: 'var(--color-surface-base)',
                          border: '1px solid var(--color-border-subtle)',
                          borderRadius: '6px',
                          color: 'var(--color-text-primary)',
                          outline: 'none'
                        }}
                      >
                        {field.options.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
