'use client';

import React, { useState } from 'react';
import { AttributeSchema } from '@/lib/domains/presentation/registry';

interface AttributeRendererProps {
  schema: AttributeSchema;
  value: any;
  isEditMode?: boolean;
  onUpdate?: (key: string, newValue: any) => void;
}

export function AttributeRenderer({ schema, value, isEditMode = false, onUpdate }: AttributeRendererProps) {
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value ?? '');
  const [isHovered, setIsHovered] = useState(false);

  const isMissing = value === undefined || value === null || value === '';

  // Standard non-edit mode (Customer View, etc.)
  if (!isEditMode) {
    if (isMissing) return null; // Scrubbed or not provided
    return (
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>{schema.label}</span>
        <span style={{ fontSize: '1rem', color: 'var(--color-text)' }}>{String(value)}</span>
      </div>
    );
  }

  // Edit Mode: The Reverse Loop (Invitations & Inline Editing)
  if (editing) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '8px',
        padding: '12px',
        margin: '0 -8px',
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '8px'
      }}>
        <label style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontWeight: 500, marginBottom: '8px' }}>
          {schema.label} <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>({schema.facingTier})</span>
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input 
            type={schema.type === 'number' ? 'number' : 'text'}
            style={{
              background: 'var(--color-background)',
              color: 'var(--color-text)',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.9rem',
              border: '1px solid var(--color-border-subtle)',
              flex: 1,
              outline: 'none',
              transition: 'border-color var(--transition-fast)'
            }}
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            autoFocus
          />
          <button 
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              background: 'var(--color-primary)',
              color: 'var(--color-background)',
              padding: '0 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              transition: 'opacity var(--transition-fast)'
            }}
            onClick={() => {
              setEditing(false);
              onUpdate?.(schema.key, schema.type === 'number' ? Number(draftValue) : draftValue);
            }}
          >
            Save
          </button>
          <button 
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-secondary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0 12px',
              transition: 'color var(--transition-fast)'
            }}
            onClick={() => {
              setEditing(false);
              setDraftValue(value ?? ''); // Reset
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Edit mode but missing data -> render an Invitation (The front door to progressive enrichment)
  if (isMissing) {
    return (
      <div 
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginBottom: '8px',
          padding: '16px',
          border: '2px dashed var(--color-border-subtle)',
          borderRadius: '8px',
          cursor: 'pointer',
          color: 'var(--color-text-secondary)',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all var(--transition-fast)',
          opacity: isHovered ? 1 : 0.7,
          borderColor: isHovered ? 'var(--color-primary)' : 'var(--color-border-subtle)',
          backgroundColor: isHovered ? 'rgba(59, 130, 246, 0.05)' : 'transparent' // Using a generic subtle tint since --color-primary might be anything
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setEditing(true)}
      >
        <span style={{ fontSize: '0.85rem', fontWeight: 500, fontStyle: 'italic', color: isHovered ? 'var(--color-primary)' : 'inherit' }}>
          + Add {schema.label}
        </span>
      </div>
    );
  }

  // Edit mode with existing data -> render with edit affordances
  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '8px',
        padding: '12px',
        margin: '0 -12px',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
        border: '1px solid transparent',
        backgroundColor: isHovered ? 'var(--color-surface-elevated)' : 'transparent',
        borderColor: isHovered ? 'var(--color-border-subtle)' : 'transparent'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => setEditing(true)}
    >
      <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {schema.label} 
        <span style={{
          opacity: isHovered ? 1 : 0,
          fontSize: '0.75rem',
          color: 'var(--color-primary)',
          transition: 'opacity var(--transition-fast)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          Structure Edit
        </span>
      </span>
      <span style={{ fontSize: '1rem', color: 'var(--color-text)' }}>{String(value)}</span>
    </div>
  );
}
