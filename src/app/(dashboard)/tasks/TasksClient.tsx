'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { TaskStatusControl } from '@/components/TaskStatusControl';
import { TaskAssignControl } from '@/components/TaskAssignControl';

type Task = {
  taskId: string;
  stageName: string;
  status: string;
  dueDate: string | null;
  lineTitle: string | null;
  bookingId: string;
  bookingTitle: string;
  suggestedRoleId?: string | null;
  suggestedRoleName?: string | null;
  isFrontStage?: boolean | null;
  assignees: { assignmentId: string; employeeId: string; name: string; role: string | null }[];
};
type Candidate = { employeeId: string; name: string; roles: { id: string; name: string }[] };

/**
 * Every task in the studio, not just your own — a management view, not a
 * personal to-do list. "Assigned to me" is a filter on this, not a separate
 * page: the studio owner needs to see who's doing what across everything.
 */
export function TasksClient({
  tasks,
  candidates,
  orgId,
  actorId,
  myEmployeeId,
}: {
  tasks: Task[];
  candidates: Candidate[];
  orgId: string;
  actorId: string;
  myEmployeeId: string | null;
}) {
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [showCompleted, setShowCompleted] = useState(false);

  const visible = useMemo(() => {
    return tasks.filter((t) => {
      if (!showCompleted && t.status === 'completed') return false;
      if (scope === 'mine' && !t.assignees.some((a) => a.employeeId === myEmployeeId)) return false;
      return true;
    });
  }, [tasks, scope, showCompleted, myEmployeeId]);

  return (
    <div>
      <header className="q-page-header">
        <h1 className="q-page-title">Tasks</h1>
        <p className="q-page-subtitle">Every task, across every booking — who's doing what, and what's due.</p>
      </header>

      <div className="q-row" style={{ marginBottom: '20px', flexWrap: 'wrap' }}>
        {myEmployeeId && (
          <div className="q-row" style={{ gap: '4px' }}>
            <button
              className={`q-btn q-btn-sm ${scope === 'all' ? 'q-btn-primary' : 'q-btn-secondary'}`}
              onClick={() => setScope('all')}
            >
              Everyone
            </button>
            <button
              className={`q-btn q-btn-sm ${scope === 'mine' ? 'q-btn-primary' : 'q-btn-secondary'}`}
              onClick={() => setScope('mine')}
            >
              Assigned to me
            </button>
          </div>
        )}
        <span className="q-spacer" />
        <label className="q-row q-meta-plain" style={{ gap: '6px' }}>
          <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
          Show completed
        </label>
      </div>

      <div className="q-stack q-stack-md">
        {visible.length === 0 ? (
          <div className="q-card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--q-color-ink-500)' }}>
            <CheckCircle2 size={44} color="var(--q-color-ink-300)" style={{ margin: '0 auto 16px' }} />
            {tasks.length === 0 ? 'No tasks yet — they appear once work starts on a booking.' : 'Nothing here.'}
          </div>
        ) : (
          visible.map((t) => (
            <div key={t.taskId} className="q-card">
              <div className="q-row q-row-between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '1.02rem', marginBottom: '3px' }}>
                    {t.stageName}
                    {t.isFrontStage === false && <span className="q-meta-sm"> · back-stage</span>}
                  </div>
                  <div className="q-meta">
                    <Link href={`/bookings/${t.bookingId}`} className="q-plain-link" style={{ textDecoration: 'underline' }}>
                      {t.bookingTitle}
                    </Link>
                    {t.lineTitle && <> · {t.lineTitle}</>}
                  </div>
                </div>
                <TaskStatusControl taskId={t.taskId} status={t.status} orgId={orgId} actorId={actorId} />
              </div>
              <TaskAssignControl
                taskId={t.taskId}
                bookingId={t.bookingId}
                assignees={t.assignees}
                candidates={candidates}
                dueDate={t.dueDate}
                suggestedRoleId={t.suggestedRoleId}
                suggestedRoleName={t.suggestedRoleName}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
