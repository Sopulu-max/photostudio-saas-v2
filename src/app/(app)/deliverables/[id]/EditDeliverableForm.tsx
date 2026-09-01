'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateDeliverable, deleteOutputOrContainer, updateDeliverableConfig } from './actions';
import { ConfirmButton } from '@/components/ConfirmButton';

export function EditDeliverableForm({ id, type, initialName, initialOutput }: { 
  id: string; 
  type: 'output' | 'container'; 
  initialName: string;
  initialOutput?: any;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [defaultUnit, setDefaultUnit] = useState(initialOutput?.default_unit || '');
  const [specSchemaStr, setSpecSchemaStr] = useState(initialOutput?.spec_schema ? JSON.stringify(initialOutput.spec_schema, null, 2) : '[\n  \n]');
  const [specValuesStr, setSpecValuesStr] = useState(initialOutput?.spec_values ? JSON.stringify(initialOutput.spec_values, null, 2) : '{\n  \n}');
  
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Please enter a name.');

    setSaving(true);
    setError(null);
    try {
      await updateDeliverable(id, 'output', name.trim());
      
      if (type === 'output') {
        let parsedSchema = null;
        let parsedValues = null;
        
        if (specSchemaStr.trim() && specSchemaStr.trim() !== '[\n  \n]') {
          try { parsedSchema = JSON.parse(specSchemaStr); } catch { throw new Error('Invalid JSON in Specification Schema'); }
        }
        
        if (specValuesStr.trim() && specValuesStr.trim() !== '{\n  \n}') {
          try { parsedValues = JSON.parse(specValuesStr); } catch { throw new Error('Invalid JSON in Instance Values'); }
        }
        
        await updateDeliverableConfig(id, {
          default_unit: defaultUnit.trim() || null,
          spec_schema: parsedSchema,
          spec_values: parsedValues
        });
      }
      
      router.push('/deliverables');
    } catch (err: any) {
      setError(err.message || 'Failed to update deliverable');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteOutputOrContainer(id, type);
      router.push('/deliverables');
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
      setSaving(false);
    }
  };

  return (
    <form className="q-form" onSubmit={handleSubmit}>
      {error && <div className="q-banner q-banner-error">{error}</div>}

      <div className="q-field">
        <label className="q-label">Name</label>
        <input
          type="text"
          className="q-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
      </div>
      
      {type === 'output' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '32px' }}>
          <div className="q-field">
            <label className="q-label">Default Unit (Optional)</label>
            <input
              type="text"
              className="q-input"
              value={defaultUnit}
              onChange={(e) => setDefaultUnit(e.target.value)}
              placeholder="e.g. seconds, pages, images"
            />
          </div>

          <div className="q-field">
            <label className="q-label">Specification Schema (JSON)</label>
            <p className="q-help">Define the structural questions a package must answer for this deliverable. Example: <code>{`[{"key": "size", "type": "select", "options": ["8x8", "10x10"]}]`}</code></p>
            <textarea
              className="q-input"
              rows={6}
              value={specSchemaStr}
              onChange={(e) => setSpecSchemaStr(e.target.value)}
              style={{ fontFamily: 'monospace' }}
            />
          </div>

          <div className="q-field">
            <label className="q-label">Predefined Instance Values (JSON)</label>
            <p className="q-help">If this deliverable is a specific SKU, bake the answers to the schema here. A package adding this deliverable will only need to supply a quantity. Example: <code>{`{"size": "10x10"}`}</code></p>
            <textarea
              className="q-input"
              rows={4}
              value={specValuesStr}
              onChange={(e) => setSpecValuesStr(e.target.value)}
              style={{ fontFamily: 'monospace' }}
            />
          </div>
        </div>
      )}

      <div className="q-form-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <ConfirmButton
          className="q-btn-ghost q-text-danger"
          onConfirm={handleDelete}
          confirmLabel="Delete it?"
          disabled={saving}
        >
          Delete
        </ConfirmButton>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="q-btn q-btn-secondary" onClick={() => router.push('/deliverables')} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="q-btn q-btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}
