'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateWorkflowStatus } from '@/lib/actions/workflows';
import type { WorkflowStatus } from '@/lib/types/engine';

type Option = { status: WorkflowStatus; label: string; variant: 'primary' | 'secondary' };

// Mirrors WORKFLOW_TRANSITIONS in src/lib/actions/workflows.ts
const NEXT_ACTIONS: Record<string, Option[]> = {
  created:     [{ status: 'in_progress', label: 'Start Pipeline', variant: 'primary' }],
  in_progress: [
    { status: 'completed', label: 'Mark Complete', variant: 'primary' },
    { status: 'halted', label: 'Halt', variant: 'secondary' },
  ],
  halted:      [{ status: 'in_progress', label: 'Resume', variant: 'primary' }],
  completed:   [],
};

export function WorkflowActions({
  workflowId,
  currentStatus,
  organizationId,
  actorId,
}: {
  workflowId: string;
  currentStatus: WorkflowStatus;
  organizationId: string;
  actorId: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const options = NEXT_ACTIONS[currentStatus] || [];

  if (options.length === 0) return null;

  async function handleChange(newStatus: WorkflowStatus) {
    setIsPending(true);
    try {
      await updateWorkflowStatus(workflowId, organizationId, newStatus, actorId);
      router.refresh();
    } catch (error) {
      console.error('Failed to update workflow status:', error);
      alert('Failed to update workflow status.');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {options.map((o) => (
        <button
          key={o.status}
          onClick={() => handleChange(o.status)}
          disabled={isPending}
          className={`q-btn q-btn-${o.variant}`}
          style={{ fontSize: '0.875rem', opacity: isPending ? 0.7 : 1 }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
