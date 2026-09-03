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
        
        parsedSchema = initialOutput?.spec_schema ?? null;
        
        parsedValues = initialOutput?.spec_values ?? null;
        
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

          {/*
            * WHAT THIS KIND NEEDS SETTLING IS NOT EDITED HERE ANY MORE.
            *
            * It was two JSON textareas, then a builder for a shape I invented.
            * Both were a second variable system. A deliverable declares real
            * variables now — the same ones a service and a classification
            * declare — so this lives in its own component beside the name, and
            * saves as you go rather than on this form's submit.
            */}
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
