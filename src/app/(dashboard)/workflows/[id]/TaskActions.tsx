'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateTaskStatus } from '@/lib/actions/workflows';
import type { TaskStatus } from '@/lib/types/engine';

export function TaskActions({
  taskId,
  currentStatus,
  organizationId,
  actorId,
}: {
  taskId: string;
  currentStatus: TaskStatus;
  organizationId: string;
  actorId: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleStatusChange(newStatus: TaskStatus) {
    setIsPending(true);
    try {
      await updateTaskStatus(taskId, organizationId, newStatus, actorId);
      router.refresh();
    } catch (error) {
      console.error('Failed to update task status:', error);
      alert('Failed to update task status.');
    } finally {
      setIsPending(false);
    }
  }

  if (currentStatus === 'created') {
    return (
      <button 
        onClick={() => handleStatusChange('in_progress')}
        disabled={isPending}
        className="q-btn q-btn-secondary" 
        style={{ width: '100%', fontSize: '0.875rem', opacity: isPending ? 0.7 : 1 }}
      >
        {isPending ? 'Starting...' : 'Start Task'}
      </button>
    );
  }

  if (currentStatus === 'in_progress') {
    return (
      <button 
        onClick={() => handleStatusChange('completed')}
        disabled={isPending}
        className="q-btn q-btn-primary" 
        style={{ width: '100%', fontSize: '0.875rem', opacity: isPending ? 0.7 : 1 }}
      >
        {isPending ? 'Completing...' : 'Mark Completed'}
      </button>
    );
  }

  return null;
}
