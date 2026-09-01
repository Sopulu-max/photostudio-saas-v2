'use client';

import React, { useState, useTransition } from 'react';
import { addToBookingTeam, removeFromBookingTeam } from '@/modules/production/interface';
import { toast, readableError } from '@/components/Toast';
import { ConfirmButton } from '@/components/ConfirmButton';

type Employee = {
  id: string;
  contact?: { id: string; display_name: string } | null;
  employee_roles?: { role?: { id: string; name: string } | null }[];
};

/**
 * Putting people on a booking, and taking them off.
 *
 * The crew list above this was read-only, and assignment happened only inside a
 * task — which meant that until a package defined tasks, there was no way to
 * say a photographer was on a shoot at all. This is that way.
 *
 * The role is picked first because the role is what the studio is short of. An
 * operator knows they need a second shooter before they know who it will be,
 * and choosing the role narrows the people offered to those who actually hold
 * it — so the list is short and nobody is put in a role they do not do.
 */
export function AddToTeam({
  bookingId,
  employees,
  roles,
}: {
  bookingId: string;
  employees: Employee[];
  roles: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [roleId, setRoleId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [isPending, startTransition] = useTransition();
  const [lastAdded, setLastAdded] = useState('');

  // Only people who hold the chosen role. With no role chosen, everyone — a
  // studio may well put someone on a job in no particular capacity.
  const eligible = roleId
    ? employees.filter((e) => (e.employee_roles || []).some((er) => er.role?.id === roleId))
    : employees;

  const [justFilled, setJustFilled] = useState<number | null>(null);

  const add = () => {
    if (!employeeId) return;
    const who = eligible.find((e) => e.id === employeeId)?.contact?.display_name || 'They';
    startTransition(async () => {
      try {
        // Adding someone in a role also puts them on the tasks waiting for it.
        // Said out loud, because a side effect nobody is told about is one
        // nobody can correct.
        const { tasksFilled } = await addToBookingTeam({ bookingId, employeeId, roleId: roleId || null });
        setJustFilled(tasksFilled ?? 0);
        setLastAdded(who);
        setEmployeeId('');
        setRoleId('');
        setOpen(false);
      } catch (e: any) {
        toast.bad(readableError(e, 'Could not put that person on this booking.'));
      }
    });
  };

  if (!open) {
    return (
      <div className="q-stack q-stack-sm">
        <div>
          <button type="button" className="q-btn q-btn-secondary q-btn-sm" onClick={() => setOpen(true)}>
            Add team member
          </button>
        </div>
        {justFilled !== null && (
          <span className="q-meta-sm">
            {justFilled > 0
              ? `${lastAdded} assigned to ${justFilled} task${justFilled === 1 ? '' : 's'} requiring this role.`
              : `${lastAdded} added. No unassigned tasks require this role.`}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="q-stack q-stack-sm" style={{ marginTop: '12px' }}>
      <div className="q-row" style={{ gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="q-field" style={{ minWidth: '160px' }}>
          <label className="q-label">Role</label>
          <select
            className="q-select"
            value={roleId}
            onChange={(e) => { setRoleId(e.target.value); setEmployeeId(''); }}
          >
            <option value="">Any role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <div className="q-field" style={{ minWidth: '190px' }}>
          <label className="q-label">Employee</label>
          <select className="q-select" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Select an employee</option>
            {eligible.map((e) => (
              <option key={e.id} value={e.id}>{e.contact?.display_name || 'Unnamed'}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="q-btn q-btn-primary q-btn-sm"
          aria-busy={isPending}
          disabled={isPending || !employeeId}
          onClick={add}
        >
          {isPending ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          className="q-btn q-btn-secondary q-btn-sm"
          disabled={isPending}
          onClick={() => { setOpen(false); setRoleId(''); setEmployeeId(''); }}
        >
          Cancel
        </button>
      </div>

      {roleId && eligible.length === 0 && (
        <span className="q-meta-sm">
          No employees hold this role. Assign it on the Team page, or add this person without a
          role.
        </span>
      )}
    </div>
  );
}

/** Take someone off the booking. Any task they held is handed back, not left on them. */
export function RemoveFromTeam({
  bookingId,
  assignmentId,
  name,
}: {
  bookingId: string;
  assignmentId: string;
  name: string;
}) {
  const [isPending, startTransition] = useTransition();

  const remove = () => {
    startTransition(async () => {
      try {
        await removeFromBookingTeam({ bookingId, assignmentId });
      } catch (e: any) {
        toast.bad(readableError(e, 'Could not take that person off this booking.'));
      }
    });
  };

  return (
    <ConfirmButton
      className="q-btn-ghost q-btn-xs"
      disabled={isPending}
      onConfirm={remove}
      confirmLabel="Remove?"
      title={`Remove ${name} from this booking`}
    >
      {isPending ? '…' : '×'}
    </ConfirmButton>
  );
}
