'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignToBooking, removeFromBooking } from '@/modules/production/interface';

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
        Add people to your <a href="/team" style={{ color: 'var(--q-color-accent)' }}>Team</a> to put them on this booking.
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

export function RemoveCrewButton({ bookingId, assignmentId }: { bookingId: string; assignmentId: string }) {
  const { isPending, run } = useAction();
  return (
    <button
      className="q-btn q-btn-secondary"
      style={{ fontSize: '0.75rem', padding: '4px 9px' }}
      disabled={isPending}
      onClick={() => run(() => removeFromBooking({ bookingId, assignmentId }))}
      aria-label="Remove from booking"
    >
      Remove
    </button>
  );
}
