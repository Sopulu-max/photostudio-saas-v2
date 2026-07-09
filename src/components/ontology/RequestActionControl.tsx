"use client";

import React, { useState } from 'react';
import { resolveRequestAction } from '@/app/actions/kernel';
import { Loader2, Check, X } from 'lucide-react';

export function RequestActionControl({ requestId }: { requestId: string }) {
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null);

  async function handleAction(action: 'accept' | 'decline') {
    setLoading(action);
    const result = await resolveRequestAction(requestId, action);
    if (!result.success) {
      alert(`Failed to ${action} request: ` + result.error);
    }
    setLoading(null);
  }

  return (
    <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
      <button
        onClick={() => handleAction('accept')}
        disabled={loading !== null}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'var(--color-brand-primary)',
          color: 'var(--color-brand-on-primary)',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          opacity: loading === 'accept' ? 0.7 : 1,
          transition: 'all var(--transition-fast)'
        }}
      >
        {loading === 'accept' ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
        Accept Booking
      </button>

      <button
        onClick={() => handleAction('decline')}
        disabled={loading !== null}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'transparent',
          color: 'var(--color-text-secondary)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          opacity: loading === 'decline' ? 0.7 : 1,
          transition: 'all var(--transition-fast)'
        }}
      >
        {loading === 'decline' ? <Loader2 size={14} className="spin" /> : <X size={14} />}
        Decline
      </button>
    </div>
  );
}
