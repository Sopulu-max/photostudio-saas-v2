'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateEmployee, setEmployeeStatus } from '@/modules/team/interface';

/**
 * An employee was write-once until now. Edits are held locally and committed
 * with one Save, the same shape as the client and service editors.
 */
export function EmployeeEditor({
  employeeId,
  name: initialName,
  email: initialEmail,
  phone: initialPhone,
  title: initialTitle,

  status,
}: {
  employeeId: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;

  status: string;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail ?? '');
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [title, setTitle] = useState(initialTitle ?? '');

  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty =
    name.trim() !== initialName ||
    email !== (initialEmail ?? '') ||
    phone !== (initialPhone ?? '') ||
    title !== (initialTitle ?? '');

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try { await fn(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });

  const save = () =>
    run(() => updateEmployee({
      employeeId,
      name,
      email: email.trim() || null,
      phone: phone.trim() || null,
      title: title.trim() || null,

    }));

  const archived = status === 'archived';

  return (
    <div className="q-stack q-stack-md">
      <div className="q-grid-3">
        <div className="q-field">
          <label className="q-label">Name</label>
          <input className="q-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="q-field">
          <label className="q-label">Email</label>
          <input className="q-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="q-field">
          <label className="q-label">Phone</label>
          <input className="q-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      <div className="q-field">
        <label className="q-label">Job title</label>
        <input className="q-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lead Photographer" />
      </div>

      {/*
        * No skills field. What a person can do is a ROLE — one vocabulary, the
        * same one blueprints route work to, managed just below this. A second
        * free-text list looked like capability and staffed nobody.
        */}
      <div className="q-row">
        <button className="q-btn q-btn-primary" disabled={isPending || !dirty} onClick={save}>
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
        <span className="q-spacer" />
        <button
          className="q-btn q-btn-secondary"
          disabled={isPending}
          onClick={() => run(() => setEmployeeStatus({ employeeId, status: archived ? 'active' : 'archived' }))}
        >
          {archived ? 'Restore this employee' : 'Archive this employee'}
        </button>
      </div>

      {archived && (
        <div className="q-note q-note-warn">
          <span className="q-meta-plain">Archived — past assignments are untouched, but they won&rsquo;t appear when assigning new work.</span>
        </div>
      )}
    </div>
  );
}
