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

  const isMissing = value === undefined || value === null || value === '';

  // Standard non-edit mode (Customer View, etc.)
  if (!isEditMode) {
    if (isMissing) return null; // Scrubbed or not provided
    return (
      <div className="flex flex-col mb-2">
        <span className="text-sm text-zinc-500 font-medium">{schema.label}</span>
        <span className="text-base text-zinc-200">{String(value)}</span>
      </div>
    );
  }

  // Edit Mode: The Reverse Loop (Invitations & Inline Editing)
  if (editing) {
    return (
      <div className="flex flex-col mb-2 p-2 -mx-2 bg-zinc-900 border border-zinc-800 rounded">
        <label className="text-sm text-zinc-500 font-medium mb-1">{schema.label} <span className="text-xs text-zinc-600">({schema.facingTier})</span></label>
        <div className="flex gap-2">
          <input 
            type={schema.type === 'number' ? 'number' : 'text'}
            className="bg-black text-white rounded px-3 py-1.5 text-sm border border-zinc-700 flex-1 outline-none focus:border-indigo-500"
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            autoFocus
          />
          <button 
            className="text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-3 rounded transition-colors"
            onClick={() => {
              setEditing(false);
              onUpdate?.(schema.key, schema.type === 'number' ? Number(draftValue) : draftValue);
            }}
          >
            Save
          </button>
          <button 
            className="text-xs text-zinc-400 hover:text-white transition-colors"
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
        className="flex flex-col mb-2 p-3 border-2 border-dashed border-zinc-800 hover:border-zinc-700 rounded cursor-pointer text-zinc-500 hover:text-indigo-400 transition-colors items-center justify-center"
        onClick={() => setEditing(true)}
      >
        <span className="text-sm font-medium italic">+ Add {schema.label}</span>
      </div>
    );
  }

  // Edit mode with existing data -> render with edit affordances
  return (
    <div 
      className="flex flex-col mb-2 p-2 -mx-2 hover:bg-zinc-800/50 rounded cursor-pointer group transition-colors border border-transparent hover:border-zinc-800"
      onClick={() => setEditing(true)}
    >
      <span className="text-sm text-zinc-500 font-medium flex items-center justify-between">
        {schema.label} 
        <span className="opacity-0 group-hover:opacity-100 text-xs text-indigo-400 transition-opacity flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          Structure Edit
        </span>
      </span>
      <span className="text-base text-zinc-200">{String(value)}</span>
    </div>
  );
}
