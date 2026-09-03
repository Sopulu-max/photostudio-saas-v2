'use client';

import React, { useState } from 'react';
import { SpecFields, keyOf, type SpecField } from './SpecFields';
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
  /*
   * A schema is a list of fields, not a string of JSON. It was stored as JSON
   * and edited as JSON, which are two different decisions — the first is fine
   * and the second is why no studio ever declared one.
   */
  const [fields, setFields] = useState<SpecField[]>(
    Array.isArray(initialOutput?.spec_schema) ? (initialOutput.spec_schema as SpecField[]) : [],
  );
  const [defaults, setDefaults] = useState<Record<string, unknown>>(
    (initialOutput?.spec_values as Record<string, unknown>) || {},
  );
  
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
        
        // Keyed off the label, so the studio names a field once and the stored
        // key follows. A field with no name is a row somebody started and left.
        parsedSchema = fields
          .filter((f) => f.key.trim())
          .map((f) => ({
            key: keyOf(f.key),
            label: f.key.trim(),
            type: f.type,
            ...(f.type === 'select' ? { options: f.options || [] } : {}),
          }));
        
        /*
         * The studio's usual answers, kept only for fields that still exist — a
         * default for a deleted field is a value nothing will ever ask for, and
         * formatDeliverable would go on rendering it.
         */
        const live = new Set(parsedSchema.map((f: any) => f.key));
        parsedValues = Object.fromEntries(
          Object.entries(defaults).filter(([k, v]) => live.has(k) && v !== '' && v != null),
        );
        
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
            <label className="q-label">What has to be settled about it</label>
            <p className="q-help">
              Declared once here. Every package that promises this deliverable is asked these, and
              every page that shows one reads them the same way.
            </p>
            <SpecFields fields={fields} onChange={setFields} disabled={saving} />
          </div>

          {fields.filter((f) => f.key.trim()).length > 0 && (
            <div className="q-field">
              <label className="q-label">Your usual answers (optional)</label>
              <p className="q-help">
                What this normally is, so a package starts from it rather than a blank. A package can
                still say something different.
              </p>
              <div className="q-stack q-stack-sm">
                {fields.filter((f) => f.key.trim()).map((f) => {
                  const k = keyOf(f.key);
                  const val = (defaults[k] ?? '') as string;
                  const set = (v: string) => setDefaults((prev) => ({ ...prev, [k]: v }));
                  return (
                    <div key={k} className="q-row" style={{ gap: '8px', alignItems: 'center' }}>
                      <span className="q-meta" style={{ minWidth: '8rem' }}>{f.key.trim()}</span>
                      {f.type === 'select' ? (
                        <select className="q-select q-input-sm" value={val} disabled={saving}
                          onChange={(e) => set(e.target.value)}>
                          <option value="">No usual answer</option>
                          {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          className="q-input q-input-sm"
                          type={f.type === 'number' ? 'number' : 'text'}
                          value={val}
                          disabled={saving}
                          onChange={(e) => set(e.target.value)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
