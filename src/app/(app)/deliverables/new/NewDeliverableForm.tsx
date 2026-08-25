'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createDeliverableAction } from './actions';

type Kind = 'output' | 'container';

export function NewDeliverableForm({ domains }: { domains: { id: string; name: string }[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('output');
  const [name, setName] = useState('');
  const [domainId, setDomainId] = useState(domains.length > 0 ? domains[0].id : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Please enter a name.');
    if (kind === 'output' && !domainId) return setError('Please select a service domain for this output.');

    setSaving(true);
    setError(null);
    try {
      if (kind === 'output') {
        await createDeliverableAction({ domainId, name: name.trim() });
      } else {
        await createDeliverableAction({ name: name.trim() });
      }
      router.push('/deliverables');
    } catch (err: any) {
      setError(err.message || 'Failed to create deliverable');
      setSaving(false);
    }
  };

  return (
    <form className="q-form" onSubmit={handleSubmit}>
      {error && <div className="q-banner q-banner-error">{error}</div>}

      <div className="q-field">
        <label className="q-label">Kind of Deliverable</label>
        <div className="q-radio-group">
          <label className="q-radio-label">
            <input
              type="radio"
              name="kind"
              value="output"
              checked={kind === 'output'}
              onChange={(e) => setKind(e.target.value as Kind)}
            />
            Primary Output
            <span className="q-meta-sm" style={{ display: 'block', marginLeft: '24px' }}>
              The actual work produced (e.g., Edited Image, Printed Album).
            </span>
          </label>
          <label className="q-radio-label">
            <input
              type="radio"
              name="kind"
              value="container"
              checked={kind === 'container'}
              onChange={(e) => setKind(e.target.value as Kind)}
            />
            Deliverable Container
            <span className="q-meta-sm" style={{ display: 'block', marginLeft: '24px' }}>
              The packaging or vessel (e.g., USB Drive, Online Gallery).
            </span>
          </label>
        </div>
      </div>

      {kind === 'output' && (
        <div className="q-field">
          <label className="q-label">Service Domain</label>
          <select
            className="q-select"
            value={domainId}
            onChange={(e) => setDomainId(e.target.value)}
            required
          >
            {domains.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <div className="q-hint">An output belongs to the specific domain that produces it.</div>
        </div>
      )}

      <div className="q-field">
        <label className="q-label">Name</label>
        <input
          type="text"
          className="q-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'output' ? 'e.g., Edited Image' : 'e.g., Custom USB Drive'}
          autoFocus
          required
        />
      </div>

      <div className="q-form-actions">
        <button
          type="button"
          className="q-btn q-btn-secondary"
          onClick={() => router.push('/deliverables')}
          disabled={saving}
        >
          Cancel
        </button>
        <button type="submit" className="q-btn q-btn-primary" disabled={saving}>
          {saving ? 'Creating...' : 'Create'}
        </button>
      </div>
    </form>
  );
}
