"use client";

import React, { useTransition } from 'react';
import { KernelState } from './StateBadge';
import { transitionInstanceStatus } from '@/app/actions/kernel';

interface StateTransitionControlProps {
  instanceId: string;
  currentState: KernelState;
}

// All valid kernel states an owner can force-transition to.
// No guard rails — the studio owner has full override authority.
const ALL_STATES: KernelState[] = [
  'created', 'scheduled', 'in_progress', 'waiting',
  'completed', 'delivered', 'archived', 'halted',
];

const STATE_LABELS: Record<string, string> = {
  created: 'Created',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  completed: 'Completed',
  delivered: 'Delivered',
  archived: 'Archived',
  halted: 'Halted',
};

export function StateTransitionControl({ instanceId, currentState }: StateTransitionControlProps) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as KernelState;
    if (newStatus === currentState) return;

    startTransition(async () => {
      await transitionInstanceStatus(instanceId, newStatus);
    });
  }

  return (
    <select
      value={currentState}
      onChange={handleChange}
      disabled={isPending}
      style={{
        padding: '4px 8px',
        fontSize: '0.8rem',
        fontWeight: 500,
        fontFamily: 'var(--font-family-sans)',
        color: 'var(--color-text-primary)',
        background: isPending ? 'var(--color-surface-muted)' : 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '4px',
        cursor: isPending ? 'wait' : 'pointer',
        opacity: isPending ? 0.6 : 1,
        transition: 'opacity var(--transition-fast)',
        letterSpacing: '0.02em',
      }}
    >
      {ALL_STATES.map(s => (
        <option key={s} value={s}>
          {s === currentState ? `● ${STATE_LABELS[s]}` : STATE_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
