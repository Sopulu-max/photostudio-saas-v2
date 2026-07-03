"use client";

import React, { useTransition } from 'react';
import { InstanceState } from '@/lib/domains/kernel/types';
import { transitionInstance } from '@/app/actions/kernel';

interface StateTransitionControlProps {
  instanceId: string;
  currentState: InstanceState;
}

// The UI labels for the canonical states
const STATE_LABELS: Record<string, string> = {
  created: 'Created',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  completed: 'Completed',
  delivered: 'Delivered',
  archived: 'Archived',
  accepted: 'Accepted',
  revised: 'Revised',
};

// The legality map for state transitions. 
// Keys are the current state, values are the permitted NEXT states.
// 'halted' is intentionally omitted as a destination per kernel law.
const LEGAL_TRANSITIONS: Record<InstanceState, InstanceState[]> = {
  created: ['scheduled', 'in_progress'],
  scheduled: ['in_progress'],
  in_progress: ['waiting', 'completed'],
  waiting: ['in_progress', 'completed'],
  completed: ['delivered'],
  delivered: ['accepted', 'revised', 'archived'],
  accepted: ['archived'],
  revised: ['in_progress', 'waiting', 'completed'],
  halted: ['in_progress'], // Can only be un-halted
  archived: [], // Terminal state
};

export function StateTransitionControl({ instanceId, currentState }: StateTransitionControlProps) {
  const [isPending, startTransition] = useTransition();

  // Get allowed next states from the map. Always include current state so the select doesn't blank out.
  const allowedNextStates = LEGAL_TRANSITIONS[currentState] || [];
  const options = [currentState, ...allowedNextStates.filter(s => s !== currentState)];

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as InstanceState;
    if (newStatus === currentState) return;

    startTransition(async () => {
      await transitionInstance(instanceId, newStatus);
    });
  }

  // If no transitions are allowed (terminal state), just render a static badge/text
  if (allowedNextStates.length === 0) {
    return (
      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
        {STATE_LABELS[currentState] || currentState}
      </span>
    );
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
      {options.map(s => (
        <option key={s} value={s}>
          {s === currentState ? `● ${STATE_LABELS[s] || s}` : (STATE_LABELS[s] || s)}
        </option>
      ))}
    </select>
  );
}
