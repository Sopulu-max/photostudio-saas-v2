"use client";

import React, { useState, useTransition } from 'react';
import { LEGAL_TRANSITIONS } from '@/lib/domains/kernel/types';
import { transitionInstance } from '@/app/actions/kernel';
import { TransitionDialog } from './TransitionDialog';

interface StateTransitionControlProps {
  instanceId: string;
  currentState: string;
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

export function StateTransitionControl({ instanceId, currentState }: StateTransitionControlProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingState, setPendingState] = useState<string | null>(null);

  // Get allowed events from the map
  const allowedEvents = (LEGAL_TRANSITIONS['service_instances'] as any)?.[currentState] || [];
  
  // Map events to their target states (by taking the suffix)
  const allowedNextStates = allowedEvents.map((event: string) => event.split('.')[1]);
  const options = [currentState, ...allowedNextStates.filter((s: string) => s !== currentState)];

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    if (newStatus === currentState) return;

    if (newStatus === 'halted') {
      setPendingState(newStatus);
    } else {
      startTransition(async () => {
        await transitionInstance(instanceId, newStatus);
      });
    }
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
    <>
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
        {options.map((opt: string) => (
          <option key={opt} value={opt}>
            {STATE_LABELS[opt] || opt}
          </option>
        ))}
      </select>

      {pendingState && (
        <TransitionDialog
          instanceId={instanceId}
          targetState={pendingState}
          onClose={() => setPendingState(null)}
        />
      )}
    </>
  );
}
