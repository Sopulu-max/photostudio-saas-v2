'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTaskStatus } from '@/modules/production/interface';

// Mirrors TASK_TRANSITIONS in the Production module — the server is the guard,
// this just avoids offering moves that would be rejected.
const NEXT: Record<string, string[]> = {
  created: ['in_progress'],
  assigned: ['in_progress', 'blocked'],
  in_progress: ['completed', 'blocked'],
  blocked: ['in_progress'],
  completed: [],
};

const BADGE: Record<string, string> = {
  completed: 'q-badge-success',
  in_progress: 'q-badge-warning',
  blocked: 'q-badge-danger',
};

export function TaskStatusControl({ taskId, status }: { taskId: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const moves = NEXT[status] || [];

  const move = (to: string) =>
    startTransition(async () => {
      try {
        await updateTaskStatus(taskId, to as any);
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Could not update the task.');
      }
    });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
      <span className={`q-badge ${BADGE[status] || 'q-badge-neutral'}`}>{status.replace('_', ' ')}</span>
      {moves.map((to) => (
        <button
          key={to}
          className="q-btn q-btn-secondary"
          style={{ fontSize: '0.75rem', padding: '3px 9px' }}
          disabled={isPending}
          onClick={() => move(to)}
        >
          {to === 'completed' ? 'Done' : to === 'in_progress' ? 'Start' : to === 'blocked' ? 'Block' : to}
        </button>
      ))}
    </div>
  );
}
