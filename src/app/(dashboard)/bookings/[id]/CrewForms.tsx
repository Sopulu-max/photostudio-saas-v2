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

export function AddCrewForm({ bookingId, candidates }: { bookingId: string; candidates: Candidate[] }) {
  const { isPending, run } = useAction();
  const [employeeId, setEmployeeId] = React.useState('');
  const [roleId, setRoleId] = React.useState('');

  if (candidates.length === 0) {
    return (
      <p style={{ margin: '12px 0 0', fontSize: '0.85rem', color: 'var(--q-color-ink-500)' }}>
        Add people to your <a className="q-accent" href="/team">Team</a> to put them on this booking.
      </p>
    );
  }

  const selected = candidates.find((c) => c.employeeId === employeeId);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
      <select className="q-select" value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setRoleId(''); }} style={{ minWidth: '11rem' }}>
        <option value="">Add someone…</option>
        {candidates.map((c) => <option key={c.employeeId} value={c.employeeId}>{c.name}</option>)}
      </select>
      {selected && selected.roles.length > 0 && (
        <select className="q-select" value={roleId} onChange={(e) => setRoleId(e.target.value)} style={{ minWidth: '9rem' }}>
          <option value="">as… (optional)</option>
          {selected.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      )}
      <button
        className="q-btn q-btn-secondary"
        disabled={isPending || !employeeId}
        onClick={() => run(() => assignToBooking({ bookingId, employeeId, roleId: roleId || null }).then(() => { setEmployeeId(''); setRoleId(''); }))}
      >
        {isPending ? 'Adding…' : 'Add to booking'}
      </button>
    </div>
  );
}

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
