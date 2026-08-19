'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addEmployee, createRole, assignRole } from '@/modules/team/interface';

function useAction() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });
  return { isPending, run };
}

export function AddEmployeeForm() {
  const { isPending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  if (!open) {
    return <button className="q-btn q-btn-primary" onClick={() => setOpen(true)}>+ Add employee</button>;
  }
  return (
    <div className="q-row">
      <input autoFocus className="q-input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: '12rem' }} />
      <input className="q-input" type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} style={{ minWidth: '11rem' }} />
      {/* The action always accepted a phone number; the form simply never
          asked for one, so it could only be added by editing afterwards. */}
      <input className="q-input" type="tel" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ minWidth: '10rem' }} />
      <button
        className="q-btn q-btn-primary"
        disabled={isPending}
        onClick={() => name.trim() && run(
          () => addEmployee({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined }),
          () => { setName(''); setEmail(''); setPhone(''); setOpen(false); }
        )}
      >
        {isPending ? 'Adding…' : 'Add'}
      </button>
      <button className="q-btn q-btn-secondary" onClick={() => setOpen(false)} disabled={isPending}>Cancel</button>
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
