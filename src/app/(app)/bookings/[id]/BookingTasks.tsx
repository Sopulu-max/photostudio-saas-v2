'use client';

import React, { useState, useTransition } from 'react';
import { toast, readableError } from '@/components/Toast';
import { useArrivals } from '@/components/useArrivals';
import {
  setTaskRole, addBookingTask, removeBookingTask,
  assignToTask, unassignTask, advanceBookingLineTask,
} from '@/modules/production/interface';

type Person = { id: string; name: string; avatarUrl: string | null };

export type BookingTask = {
  id: string;
  name: string;
  done: boolean;
  roleId: string | null;
  roleName: string | null;
  assignee: Person | null;
  /** Which package it came from, or null for work the studio added itself. */
  fromPackage: string | null;
  lineId: string | null;
};

type Employee = {
  id: string;
  contact?: { id: string; display_name: string } | null;
  employee_roles?: { role?: { id: string; name: string } | null }[];
};

/**
 * The work a booking involves, as one list.
 *
 * WHY IT IS HERE AND NOT UNDER EACH PACKAGE. It was under each package, because
 * a task could only reach a booking through a line. So a booking with three
 * packages showed three separate task lists and there was no way to see the job
 * as a job. A studio does not work package by package — the shoot is on
 * Saturday and the editing happens after, whichever package each step was sold
 * under.
 *
 * The package a task came from is still shown beside it, because knowing what a
 * step is for still matters. It just no longer organises the list.
 */
export function BookingTasks({
  bookingId,
  tasks,
  employees,
  roles,
}: {
  bookingId: string;
  tasks: BookingTask[];
  employees: Employee[];
  roles: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRoleId, setNewRoleId] = useState('');
  const [notice, setNotice] = useState('');
  // A task added here lands in a list that may already be twenty long. This is
  // what points at the one that just arrived.
  const arrived = useArrivals(tasks.map((t) => t.id));

  const run = (fn: () => Promise<unknown>, whenFailed: string) =>
    startTransition(async () => {
      try { await fn(); } catch (e: any) { toast.bad(readableError(e, whenFailed)); }
    });

  /** Only people who hold what this task needs. No role set means anyone. */
  const eligibleFor = (roleId: string | null) =>
    roleId
      ? employees.filter((e) => (e.employee_roles || []).some((er) => er.role?.id === roleId))
      : employees;

  const unstaffed = tasks.filter((t) => !t.assignee && !t.done).length;

  return (
    <div className="q-stack q-stack-md">
      {tasks.length === 0 ? (
        <p className="q-meta">
          No tasks yet. Tasks are created from the packages on this booking once their services
          define a workflow. Tasks specific to this booking can be added below.
        </p>
      ) : (
        <>
          <p className="q-meta">
            {unstaffed === 0
              ? 'All tasks are assigned.'
              : `${unstaffed} ${unstaffed === 1 ? 'task is' : 'tasks are'} unassigned.`}
          </p>

          <div className="q-stack" style={{ gap: '6px' }}>
            {tasks.map((t) => (
              <div
                key={t.id}
                // The row treatment is q-line's now — the same one the new
                // booking form draws, defined once rather than written inline
                // in both.
                className={`q-line q-row q-row-between${arrived.has(t.id) ? ' q-flash' : ''}`}
                style={{ gap: '10px', flexWrap: 'wrap' }}
              >
                <span className="q-row" style={{ gap: '10px', alignItems: 'center', minWidth: '200px', flex: 1 }}>
                  <button
                    type="button"
                    className="q-btn q-btn-xs"
                    disabled={isPending}
                    title={t.done ? 'Mark as not complete' : 'Mark as complete'}
                    onClick={() => run(
                      () => advanceBookingLineTask({ bookingId, lineId: t.lineId ?? '', taskId: t.id }),
                      'Could not change that task.')}
                    style={{
                      width: '22px', height: '22px', padding: 0, borderRadius: '50%',
                      background: t.done ? 'var(--q-color-ink-900)' : 'transparent',
                      color: t.done ? 'var(--q-color-paper)' : 'var(--q-color-ink-500)',
                      border: t.done ? 'none' : '1px solid var(--q-color-ink-300)',
                    }}
                  >
                    {t.done ? '✓' : ''}
                  </button>

                  <span style={{ opacity: t.done ? 0.55 : 1 }}>
                    <span className="q-strong">{t.name}</span>
                    <span className="q-meta-sm" style={{ display: 'block' }}>
                      {t.fromPackage ? t.fromPackage : 'Added to this booking'}
                    </span>
                  </span>
                </span>

                <span className="q-row" style={{ gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* What it needs. Changing it here changes this booking only. */}
                  <select
                    className="q-select"
                    style={{ minWidth: '140px' }}
                    value={t.roleId ?? ''}
                    disabled={isPending}
                    onChange={(e) => {
                      const roleId = e.target.value || null;
                      run(async () => {
                        const r = await setTaskRole({ bookingId, taskId: t.id, roleId });
                        if (r?.standDown) {
                          setNotice(`${t.assignee?.name} was removed from “${t.name}”: they do not hold this role.`);
                        }
                      }, 'Could not change what this task needs.');
                    }}
                  >
                    <option value="">No role</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>

                  {/* Who is doing it, narrowed to people who hold that role. */}
                  <select
                    className="q-select"
                    style={{ minWidth: '160px' }}
                    value={t.assignee?.id ?? ''}
                    disabled={isPending}
                    onChange={(e) => {
                      const employeeId = e.target.value;
                      run(
                        () => employeeId
                          ? assignToTask({ bookingId, taskId: t.id, employeeId })
                          : unassignTask({ bookingId, taskId: t.id }),
                        'Could not change who is on this task.');
                    }}
                  >
                    <option value="">Unassigned</option>
                    {eligibleFor(t.roleId).map((e) => (
                      <option key={e.id} value={e.contact?.id || e.id}>
                        {e.contact?.display_name || 'Unnamed'}
                      </option>
                    ))}
                  </select>

                  {/* Only work the studio added can be removed here; a package's
                      task is switched off on the package, where it is visible. */}
                  {!t.lineId && (
                    <button
                      type="button"
                      className="q-btn-ghost q-btn-xs"
                      disabled={isPending}
                      title={`Remove “${t.name}”`}
                      onClick={() => {
                        if (!confirm(`Remove “${t.name}” from this booking?`)) return;
                        run(() => removeBookingTask({ bookingId, taskId: t.id }), 'Could not remove that task.');
                      }}
                    >
                      ×
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {notice && <p className="q-meta-sm">{notice}</p>}

      {adding ? (
        <div className="q-row" style={{ gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="q-field" style={{ flex: 1, minWidth: '200px' }}>
            <label className="q-label">Task</label>
            <input
              className="q-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Collect album from printer"
            />
          </div>
          <div className="q-field" style={{ minWidth: '150px' }}>
            <label className="q-label">Role</label>
            <select className="q-select" value={newRoleId} onChange={(e) => setNewRoleId(e.target.value)}>
              <option value="">No role</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <button
            type="button"
            className="q-btn q-btn-primary q-btn-sm"
            aria-busy={isPending}
            disabled={isPending || !newName.trim()}
            onClick={() => run(async () => {
              await addBookingTask({ bookingId, name: newName, roleId: newRoleId || null });
              setNewName(''); setNewRoleId(''); setAdding(false);
            }, 'Could not add that task.')}
          >
            {isPending ? 'Adding…' : 'Add'}
          </button>
          <button
            type="button"
            className="q-btn q-btn-secondary q-btn-sm"
            disabled={isPending}
            onClick={() => { setAdding(false); setNewName(''); setNewRoleId(''); }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div>
          <button type="button" className="q-btn q-btn-secondary q-btn-sm" onClick={() => setAdding(true)}>
            Add a task
          </button>
        </div>
      )}
    </div>
  );
}
