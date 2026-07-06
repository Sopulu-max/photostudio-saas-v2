'use client';

import React, { useState } from 'react';
import { transitionInstance } from '@/app/actions/kernel';
import { Loader2 } from 'lucide-react';

export function TransitionDialog({
  instanceId,
  targetState,
  onClose,
}: {
  instanceId: string;
  targetState: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Pass reason as metadata payload
    await transitionInstance(instanceId, targetState, { reason });
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--color-surface)',
        padding: '24px',
        borderRadius: '8px',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '1.2rem', fontFamily: 'var(--font-family-serif)' }}>
          Transition to {targetState}
        </h3>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
              Reason / Note
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Provide a reason or note for this status change..."
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid var(--color-border)',
                minHeight: '80px',
                fontFamily: 'var(--font-family-sans)',
                fontSize: '0.9rem',
              }}
              required={targetState === 'halted'}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button 
              type="button" 
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting || (targetState === 'halted' && !reason.trim())}
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                background: 'var(--color-text)',
                color: 'var(--color-surface)',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
