'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addEmployee, createRole, assignRole } from '@/modules/team/interface';
import { PickOne } from '@/components/Pick';
import { toast, readableError } from '@/components/Toast';

function useAction() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e: any) { toast.bad(readableError(e, 'Something went wrong.')); }
    });
  return { isPending, run };
}

/**
 * Adding someone to the team.
 *
 * Email and phone are required, not because a record cannot exist without
 * them but because an employee the studio cannot reach is not a working
 * record — this is the one place the studio commits to being able to contact
 * a person, and asking later never happens.
 *
 * The role is chosen from the ones the studio already has, or typed if the
 * right one does not exist yet. Same control as everywhere else: the list
 * leads, the studio overrules. A role is what work routes to, so offering the
 * known ones first is what keeps a studio from ending up with Photographer,
 * photographer and Lead Photographer meaning one thing.
 *
 * It stays optional. Someone can join before anyone has decided what they
 * will be doing, and a record that refuses to exist until that is settled is
 * a record nobody creates.
 */
export function AddEmployeeForm({ roles }: { roles: { id: string; name: string }[] }) {
  const { isPending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');

  const ready = name.trim() !== '' && email.trim() !== '' && phone.trim() !== '';

  if (!open) {
    return <button className="q-btn q-btn-primary" onClick={() => setOpen(true)}>+ Add employee</button>;
  }
  return (
    <div className="q-stack q-stack-sm">
      <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <input autoFocus className="q-input" placeholder="Full name" value={name}
          onChange={(e) => setName(e.target.value)} style={{ minWidth: '12rem' }} />
        <input className="q-input" type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} style={{ minWidth: '12rem' }} />
        <input className="q-input" type="tel" placeholder="Phone" value={phone}
          onChange={(e) => setPhone(e.target.value)} style={{ minWidth: '10rem' }} />
        <div style={{ minWidth: '12rem' }}>
          <PickOne
            value={role}
            onChange={setRole}
            options={roles.map((r) => r.name)}
            placeholder="Role (optional)"
            disabled={isPending}
          />
        </div>
      </div>
      <div className="q-row">
        <button
          className="q-btn q-btn-primary"
          aria-busy={isPending}
          disabled={isPending || !ready}
          onClick={() => run(
            () => addEmployee({
              name: name.trim(),
              email: email.trim(),
              phone: phone.trim(),
              role: role.trim() || undefined,
            }),
            () => { setName(''); setEmail(''); setPhone(''); setRole(''); setOpen(false); }
          )}
        >
          {isPending ? 'Adding…' : 'Add'}
        </button>
        <button className="q-btn q-btn-secondary" onClick={() => setOpen(false)} disabled={isPending}>Cancel</button>
        <span className="q-meta-sm" style={{ opacity: 0.7 }}>
          Name, email and phone are required.
        </span>
      </div>
    </div>
  );
}

export function NewRoleForm() {
  const { isPending, run } = useAction();
  const [name, setName] = useState('');
  return (
    <div className="q-row">
      <input
        className="q-input"
        placeholder="e.g. Lead Photographer"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) run(() => createRole({ name: name.trim() }), () => setName('')); }}
        style={{ minWidth: '13rem' }}
      />
      <button
        className="q-btn q-btn-secondary"
        disabled={isPending}
        onClick={() => name.trim() && run(() => createRole({ name: name.trim() }), () => setName(''))}
      >
        {isPending ? 'Adding…' : 'Add role'}
      </button>
    </div>
  );
}

export function AssignRoleControl({ employeeId, roles }: { employeeId: string; roles: { id: string; name: string }[] }) {
  const { isPending, run } = useAction();
  if (roles.length === 0) return null;
  return (
    <select
      className="q-select"
      value=""
      disabled={isPending}
      onChange={(e) => { const roleId = e.target.value; if (roleId) run(() => assignRole({ employeeId, roleId })); }}
      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
    >
      <option value="">+ role…</option>
      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  );
}
