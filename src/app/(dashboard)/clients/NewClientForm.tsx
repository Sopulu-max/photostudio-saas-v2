'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/modules/clients/interface';

export function NewClientForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        await createClient({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined });
        setName(''); setEmail(''); setPhone(''); setOpen(false);
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Failed to create client.');
      }
    });
  };

  if (!open) {
    return <button className="q-btn q-btn-primary" onClick={() => setOpen(true)}>+ New client</button>;
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
      <input autoFocus className="q-input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: '12rem' }} />
      <input className="q-input" type="email" placeholder="email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} style={{ minWidth: '12rem' }} />
      <input className="q-input" placeholder="phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ minWidth: '9rem' }} />
      <button className="q-btn q-btn-primary" onClick={submit} disabled={isPending}>{isPending ? 'Creating…' : 'Create'}</button>
      <button className="q-btn q-btn-secondary" onClick={() => setOpen(false)} disabled={isPending}>Cancel</button>
    </div>
  );
}
