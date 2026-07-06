'use client';

import React, { useState } from 'react';
import { CheckCircle2, Plus, Loader2 } from 'lucide-react';
import { recordWorkstepAction } from '@/app/actions/kernel';

export function WorkstepList({ instanceId, events = [] }: { instanceId: string, events?: any[] }) {
  const [newStep, setNewStep] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Extract worksteps from events payload
  const worksteps = events
    .filter(e => e.event_type === 'service_instance.workstep')
    .map(e => ({
      id: e.id,
      name: e.payload?.stepName || 'Unknown step',
      createdAt: e.created_at,
      actorId: e.actor_id
    }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStep.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const result = await recordWorkstepAction(instanceId, newStep.trim());
    if (result.success) {
      setNewStep('');
    } else {
      alert('Failed to record workstep');
    }
    setIsSubmitting(false);
  };

  return (
    <div style={{ marginTop: '16px' }}>
      <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progress Log</h4>
      
      {worksteps.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {worksteps.map(step => (
            <li key={step.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.9rem', color: 'var(--color-text)' }}>
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-[2px]" />
              <span style={{ flex: 1, wordBreak: 'break-word' }}>{step.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-tertiary)', marginBottom: '12px' }}>No recorded steps yet.</p>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
        <input 
          type="text" 
          value={newStep}
          onChange={e => setNewStep(e.target.value)}
          placeholder="Record a completed step..."
          disabled={isSubmitting}
          style={{
            flex: 1,
            padding: '6px 12px',
            fontSize: '0.85rem',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            background: 'var(--color-surface)',
          }}
        />
        <button 
          type="submit" 
          disabled={isSubmitting || !newStep.trim()}
          style={{
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            cursor: newStep.trim() && !isSubmitting ? 'pointer' : 'not-allowed',
            opacity: newStep.trim() && !isSubmitting ? 1 : 0.5,
          }}
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
