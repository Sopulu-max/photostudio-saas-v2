'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast, readableError } from '@/components/Toast';
import { useArrivals } from '@/components/useArrivals';
import { ConfirmButton } from '@/components/ConfirmButton';
import {
  setTaskRole, addBookingTask, removeBookingTask,
  assignToTask, unassignTask, toggleTaskDone,
} from '@/modules/production/interface';
import type { ResolvedBookingTask } from '@/modules/production/interface';

/*
 * A task here is a READING - the workflow's step as it is now, with what
 * happened on this booking laid over it - so it may have no row yet. Every
 * action sends the ref (line, bundle row, step) and Production makes the row
 * on the first thing that happens. The key is the ref, since ids are absent
 * until then.
 */
export type BookingTask = ResolvedBookingTask;
const keyOf = (t: BookingTask) =>
  t.id ?? `${t.lineId}:${t.packageServiceId}:${t.ref.workflowTaskId ?? t.ref.packageTaskId}`;

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
 *
 * And the list is live: it is the packages' workflows as the studio has them
 * NOW. Rename a step, add one, drop one, and this booking shows it - unless
 * something already happened on the step here, which stays.
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
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRoleId, setNewRoleId] = useState('');
  const [notice, setNotice] = useState('');
  // A task added here lands in a list that may already be twenty long. This is
  // what points at the one that just arrived.
  const arrived = useArrivals(tasks.map(keyOf));

  const run = (fn: () => Promise<unknown>, whenFailed: string) =>
    startTransition(async () => {
      // The list is a reading; after an action the page is read again.
      try { await fn(); router.refresh(); } catch (e: any) { toast.bad(readableError(e, whenFailed)); }
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
          No tasks. The work comes from the workflows of the services in this booking&rsquo;s
          packages, as they stand now; work specific to this booking can be added below.
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
                key={keyOf(t)}
                // The row treatment is q-line's now — the same one the new
                // booking form draws, defined once rather than written inline
                // in both.
                className={`q-line q-row q-row-between${arrived.has(keyOf(t)) ? ' q-flash' : ''}`}
                style={{ gap: '10px', flexWrap: 'wrap' }}
              >
                <span className="q-row" style={{ gap: '10px', alignItems: 'center', minWidth: '200px', flex: 1 }}>
                  <button
                    type="button"
                    className="q-btn q-btn-xs"
                    disabled={isPending}
                    title={t.done ? 'Mark as not complete' : 'Mark as complete'}
                    onClick={() => run(
                      () => toggleTaskDone({ bookingId, task: t.ref }),
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
                      {t.fromPackage ? [t.fromService, t.fromPackage].filter(Boolean).join(' · ') : 'Added to this booking'}
                    </span>
                  </span>
                </span>

                <span className="q-row" style={{ gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* What it needs. Changing it here changes this booking only;
                      clearing it hands the step back to the workflow's role. */}
                  <select
                    className="q-select"
                    style={{ minWidth: '140px' }}
                    value={t.roleId ?? ''}
                    disabled={isPending}
                    onChange={(e) => {
                      const roleId = e.target.value || null;
                      run(async () => {
                        const r = await setTaskRole({ bookingId, task: t.ref, roleId });
                        if (r?.standDown) {
                          setNotice(`${t.assignee?.name} was removed from “${t.name}”: they do not hold this role.`);
                        }
                      }, 'Could not change what this task needs.');
                    }}
                  >
                    <option value="">{t.workflowRoleName ? `As the workflow says (${t.workflowRoleName})` : 'No role'}</option>
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
                          ? assignToTask({ bookingId, task: t.ref, employeeId })
                          : unassignTask({ bookingId, task: t.ref }),
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

                  {/* Only work the booking holds on its own can be removed here; a
                      package's step is switched off on the package, where it is visible. */}
                  {t.own && t.id && (
                    <ConfirmButton
                      className="q-btn-ghost q-btn-xs"
                      disabled={isPending}
                      title={`Remove “${t.name}”`}
                      confirmLabel="Remove?"
                      onConfirm={() => run(
                        () => removeBookingTask({ bookingId, taskId: t.id! }),
                        'Could not remove that task.')}
                    >
                      ×
                    </ConfirmButton>
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
