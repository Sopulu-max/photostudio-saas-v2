"use client";

import React, { useTransition } from 'react';
import { activateAgreementAction } from '@/app/actions/kernel';

export function AgreementControls({ agrId }: { agrId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleActivate = () => {
    startTransition(async () => {
      await activateAgreementAction(agrId);
    });
  };

  return (
    <button 
      disabled={isPending}
      onClick={handleActivate}
      style={{
        background: 'var(--color-state-active)',
        color: 'white',
        border: 'none',
        padding: '8px 16px',
        borderRadius: '4px',
        cursor: isPending ? 'wait' : 'pointer',
        opacity: isPending ? 0.6 : 1,
        fontSize: '0.85rem',
        fontWeight: 600
      }}
    >
      {isPending ? 'Activating...' : 'Activate Agreement (Spawn Instances)'}
    </button>
  );
}
