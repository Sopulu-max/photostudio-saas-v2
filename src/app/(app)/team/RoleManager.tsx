'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateRole, deleteRole } from '@/modules/team/interface';

/**
 * Rename or remove a role, in place. Deleting a role just removes the badge
 * from whoever had it — nothing else references a role by id.
 */
export function RoleManager({ role }: { role: { id: string; name: string; description: string | null } }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });

  if (confirming) {
    return (
      <div className="q-note q-note-bad q-row" style={{ gap: '8px' }}>
        <span className="q-meta-plain">Remove &ldquo;{role.name}&rdquo;?</span>
        <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending} onClick={() => run(() => deleteRole(role.id))}>
          Remove
        </button>
        <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setConfirming(false)}>Keep</button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="q-row" style={{ gap: '8px' }}>
        <input className="q-input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '10rem' }} />
        <input className="q-input" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="description (optional)" style={{ width: '12rem' }} />
        <button
          className="q-btn q-btn-primary q-btn-xs"
          disabled={isPending || !name.trim()}
          onClick={() => run(
            () => updateRole({ roleId: role.id, name: name.trim(), description: description.trim() || null }),
            () => setEditing(false)
          )}
        >
          Save
        </button>
        <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => { setEditing(false); setName(role.name); setDescription(role.description ?? ''); }}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <span className="q-badge q-badge-neutral q-row" style={{ gap: '4px' }}>
      {role.name}
      <button className="q-btn-ghost" style={{ padding: '0 0 0 4px', fontSize: '0.85em' }} onClick={() => setEditing(true)}>edit</button>
      <button className="q-btn-ghost" style={{ padding: '0 0 0 2px', fontSize: '0.85em' }} onClick={() => setConfirming(true)}>×</button>
    </span>
  );
}
