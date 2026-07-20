'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createWorkflowTemplate } from '@/lib/actions/workflows';

export default function NewWorkflowTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [stages, setStages] = useState([{ name: 'Stage 1', duration_hours: 24, requires_approval: false }]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addStage = () => {
    setStages([...stages, { name: `Stage ${stages.length + 1}`, duration_hours: 24, requires_approval: false }]);
  };

  const updateStage = (index: number, field: string, value: any) => {
    const newStages = [...stages];
    newStages[index] = { ...newStages[index], [field]: value };
    setStages(newStages);
  };

  const removeStage = (index: number) => {
    const newStages = [...stages];
    newStages.splice(index, 1);
    setStages(newStages);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || stages.length === 0) return;
    
    setIsSubmitting(true);
    try {
      const formattedStages = stages.map((s, i) => ({
        ...s,
        order: i + 1,
      }));
      await createWorkflowTemplate(name, formattedStages);
      router.push('/workflows');
    } catch (error) {
      console.error(error);
      alert('Failed to create workflow template.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '64px' }}>
      <header className="q-page-header">
        <h1 className="q-page-title">New Workflow Template</h1>
        <p className="q-page-subtitle">Define a standardized production pipeline for your services.</p>
      </header>

      <form onSubmit={handleSubmit} className="q-card" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Workflow Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Standard Wedding Photography"
            style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--q-color-ink-200)', fontSize: '1rem' }}
            required
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Pipeline Stages</h3>
            <button type="button" onClick={addStage} className="q-btn q-btn-secondary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>
              + Add Stage
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {stages.map((stage, index) => (
              <div key={index} style={{ padding: '24px', background: 'var(--q-color-paper-subtle)', borderRadius: '12px', border: '1px solid var(--q-color-ink-100)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, color: 'var(--q-color-ink-500)' }}>Stage {index + 1}</div>
                  {stages.length > 1 && (
                    <button type="button" onClick={() => removeStage(index)} style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
                  )}
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>Stage Name</label>
                  <input
                    type="text"
                    value={stage.name}
                    onChange={(e) => updateStage(index, 'name', e.target.value)}
                    placeholder="e.g. Prep, Shoot, Edit"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: '24px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>Duration (Hours)</label>
                    <input
                      type="number"
                      value={stage.duration_hours}
                      onChange={(e) => updateStage(index, 'duration_hours', parseInt(e.target.value) || 0)}
                      min="1"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', paddingBottom: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.875rem' }}>
                      <input
                        type="checkbox"
                        checked={stage.requires_approval}
                        onChange={(e) => updateStage(index, 'requires_approval', e.target.checked)}
                      />
                      Requires Approval to Proceed
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '24px' }}>
          <button type="submit" disabled={isSubmitting} className="q-btn q-btn-primary" style={{ minWidth: '150px' }}>
            {isSubmitting ? 'Creating...' : 'Create Workflow'}
          </button>
        </div>
      </form>
    </div>
  );
}
