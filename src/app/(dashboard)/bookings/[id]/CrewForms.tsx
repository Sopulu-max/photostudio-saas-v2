'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignToBooking, removeAssignment } from '@/modules/production/interface';

function useAction() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try { await fn(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });
  return { isPending, run };
}

type Candidate = { employeeId: string; name: string; roles: { id: string; name: string }[] };

/*
 * There is deliberately no "add anyone to this booking" form.
 *
 * A booking's team is the union of the people filling roles the work calls for
 * and the people assigned to its tasks — listCrewForBooking rolls both up. A
 * free-form roster alongside that is a second answer to the same question, and
 * it drifts: someone listed on the booking who holds no role and owns no task
 * is on it only in the sense that a person typed their name.
 *
 * The one thing that cannot be derived is who is doing this before any task
 * exists, since tasks are only created when work starts. That is what
 * FillRoleForm is for, and it is bounded by what the blueprints actually ask
 * for rather than being an open list.
 */

/**
 * Fill one role the booked Packages' blueprints call for. The role is already
 * decided by what was booked, so this only asks who — and offers the people who
 * actually hold that role first, falling back to the whole roster rather than
 * blocking (a studio can put anyone on anything; the blueprint routes, it
 * doesn't rule).
 */
export function FillRoleForm({
  bookingId, roleId, roleName, candidates,
}: {
  bookingId: string;
  roleId: string;
  roleName: string;
  candidates: Candidate[];
}) {
  const { isPending, run } = useAction();
  const [employeeId, setEmployeeId] = React.useState('');
  const [showAll, setShowAll] = React.useState(false);

  const qualified = candidates.filter((c) => c.roles.some((r) => r.id === roleId));
  const offered = showAll || qualified.length === 0 ? candidates : qualified;

  if (candidates.length === 0) {
    return (
      <p className="q-meta-sm" style={{ margin: 0 }}>
        No one on the team yet — <a className="q-accent" href="/team">add people</a> to fill this.
      </p>
    );
  }

  return (
    <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
      <select className="q-select q-select-sm" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={{ minWidth: '10rem' }}>
        <option value="">{qualified.length > 0 ? `Assign a ${roleName}…` : 'Assign someone…'}</option>
        {offered.map((c) => <option key={c.employeeId} value={c.employeeId}>{c.name}</option>)}
      </select>
      <button
        className="q-btn q-btn-secondary q-btn-xs"
        disabled={isPending || !employeeId}
        onClick={() => run(() => assignToBooking({ bookingId, employeeId, roleId }).then(() => setEmployeeId('')))}
      >
        {isPending ? 'Adding…' : 'Add'}
      </button>
      {!showAll && qualified.length > 0 && qualified.length < candidates.length && (
        <button className="q-btn-ghost q-meta-sm" style={{ padding: 0 }} onClick={() => setShowAll(true)}>
          show everyone
        </button>
      )}
    </div>
  );
}

export function RemoveCrewButton({ bookingId, assignmentId }: { bookingId: string; assignmentId: string }) {
  const { isPending, run } = useAction();
  return (
    <button
      className="q-btn q-btn-secondary"
      style={{ fontSize: '0.75rem', padding: '4px 9px' }}
      disabled={isPending}
      onClick={() => run(() => removeAssignment({ bookingId, assignmentId }))}
      aria-label="Remove from booking"
    >
      Remove
    </button>
  );
}
