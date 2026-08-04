'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignTask, removeAssignment, setTaskDueDate } from '@/modules/production/interface';

type Assignee = { assignmentId: string; employeeId: string; name: string; role: string | null };
type Candidate = { employeeId: string; name: string; roles: { id: string; name: string }[] };

/**
 * Who's doing THIS task specifically (not just "on the booking somewhere"),
 * and when it's due. Both existed as real functions with no way to reach
 * them from the UI — assignToBooking (booking-level) had a form; assignTask
 * (task-level, with a role) never did.
 */
export function TaskAssignControl({
  taskId,
  bookingId,
  assignees,
  candidates,
  dueDate,
}: {
  taskId: string;
  bookingId: string;
  assignees: Assignee[];
  candidates: Candidate[];
  dueDate: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [due, setDue] = useState(dueDate ? dueDate.slice(0, 10) : '');
  const router = useRouter();

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });

  const available = candidates.filter((c) => !assignees.some((a) => a.employeeId === c.employeeId));
  const selected = available.find((c) => c.employeeId === employeeId);

  return (
    <div className="q-stack q-stack-sm" style={{ marginTop: '6px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
        {assignees.map((a) => (
          <span key={a.assignmentId} className="q-badge q-badge-neutral">
            {a.name}{a.role ? ` · ${a.role}` : ''}
            <button
              className="q-btn-ghost"
              style={{ padding: '0 0 0 6px', fontSize: '0.85em' }}
              disabled={isPending}
              aria-label={`Remove ${a.name}`}
              onClick={() => run(() => removeAssignment({ bookingId, assignmentId: a.assignmentId }))}
            >
              ×
            </button>
          </span>
        ))}

        {available.length > 0 && (
          <>
            <select className="q-select" value={employeeId} disabled={isPending}
              onChange={(e) => { setEmployeeId(e.target.value); setRoleId(''); }}
              style={{ fontSize: '0.8rem', padding: '3px 8px', minWidth: '9rem' }}>
              <option value="">+ assign…</option>
              {available.map((c) => <option key={c.employeeId} value={c.employeeId}>{c.name}</option>)}
            </select>
            {selected && selected.roles.length > 0 && (
              <select className="q-select" value={roleId} disabled={isPending}
                onChange={(e) => setRoleId(e.target.value)}
                style={{ fontSize: '0.8rem', padding: '3px 8px', minWidth: '8rem' }}>
                <option value="">as… (optional)</option>
                {selected.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            {employeeId && (
              <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending}
                onClick={() => run(
                  () => assignTask({ taskId, employeeId, roleId: roleId || null }),
                  () => { setEmployeeId(''); setRoleId(''); }
                )}>
                Add
              </button>
            )}
          </>
        )}
      </div>

      <div className="q-row" style={{ gap: '6px' }}>
        <span className="q-meta-sm">Due</span>
        <input
          type="date"
          className="q-input"
          value={due}
          disabled={isPending}
          onChange={(e) => {
            const next = e.target.value;
            setDue(next);
            // A native date input commits atomically when a date is picked —
            // unlike text, there's no mid-edit state worth waiting out, so
            // save immediately rather than deferring to blur.
            run(() => setTaskDueDate({ taskId, dueDate: next || null }));
          }}
          style={{ fontSize: '0.8rem', padding: '3px 8px', width: '9.5rem' }}
        />
        {due && (
          <button className="q-btn-ghost" style={{ fontSize: '0.8em' }} disabled={isPending}
            onClick={() => { setDue(''); run(() => setTaskDueDate({ taskId, dueDate: null })); }}>
            clear
          </button>
        )}
      </div>
    </div>
  );
}
