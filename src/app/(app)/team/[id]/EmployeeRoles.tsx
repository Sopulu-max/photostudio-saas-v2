'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignRole, removeRoleAssignment } from '@/modules/team/interface';
import { toast, readableError } from '@/components/Toast';

export function EmployeeRoles({
  employeeId,
  assigned,
  available,
}: {
  employeeId: string;
  assigned: { id: string; name: string }[];
  available: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try { await fn(); router.refresh(); }
      catch (e: any) { toast.bad(readableError(e, 'Something went wrong.')); }
    });

  return (
    <div className="q-stack q-stack-sm">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {assigned.length === 0 ? (
          <span className="q-empty">No roles yet.</span>
        ) : (
          assigned.map((r) => (
            <span key={r.id} className="q-badge q-badge-neutral">
              {r.name}
              <button
                className="q-btn-ghost"
                style={{ padding: '0 0 0 6px', fontSize: '0.85em' }}
                disabled={isPending}
                aria-label={`Remove ${r.name}`}
                onClick={() => run(() => removeRoleAssignment({ employeeId, roleId: r.id }))}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      {available.length > 0 && (
        <select
          className="q-select"
          value=""
          disabled={isPending}
          onChange={(e) => { const roleId = e.target.value; if (roleId) run(() => assignRole({ employeeId, roleId })); }}
          style={{ maxWidth: '14rem' }}
        >
          <option value="">+ Add a role…</option>
          {available.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      )}
    </div>
  );
}
