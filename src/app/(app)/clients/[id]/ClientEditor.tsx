'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateClient, setClientStatus } from '@/modules/clients/interface';

/**
 * A client was write-once until now. Edits are held locally and committed
 * with one Save, the same shape as the service and stage editors.
 */
export function ClientEditor({
  clientId,
  name: initialName,
  email: initialEmail,
  phone: initialPhone,
  notes: initialNotes,
  tags: initialTags,
  source: initialSource,
  status,
}: {
  clientId: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  tags: string[];
  source: string | null;
  status: string;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail ?? '');
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [tags, setTags] = useState((initialTags || []).join(', '));
  const [source, setSource] = useState(initialSource ?? '');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty =
    name.trim() !== initialName ||
    email !== (initialEmail ?? '') ||
    phone !== (initialPhone ?? '') ||
    notes !== (initialNotes ?? '') ||
    tags !== (initialTags || []).join(', ') ||
    source !== (initialSource ?? '');

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try { await fn(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });

  const save = () =>
    run(() => updateClient({
      clientId,
      name,
      email: email.trim() || null,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      source: source.trim() || null,
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
        <label className="q-label">How they found you</label>
        <input className="q-input" value={source} onChange={(e) => setSource(e.target.value)}
          placeholder="e.g. Instagram, referral, walk-in" list="source-suggestions" />
        <datalist id="source-suggestions">
          <option value="Instagram" /><option value="Referral" /><option value="Google" /><option value="Walk-in" />
        </datalist>
      </div>

      <div className="q-field">
        <label className="q-label">Tags</label>
        <input className="q-input" value={tags} onChange={(e) => setTags(e.target.value)}
          placeholder="Comma separated — e.g. VIP, repeat client" />
      </div>

      <div className="q-field">
        <label className="q-label">Notes</label>
        <textarea className="q-textarea" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything worth remembering about this client." />
      </div>

      <div className="q-row">
        <button className="q-btn q-btn-primary" disabled={isPending || !dirty} onClick={save}>
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
        <span className="q-spacer" />
        <button
          className="q-btn q-btn-secondary"
          disabled={isPending}
          onClick={() => run(() => setClientStatus({ clientId, status: archived ? 'active' : 'archived' }))}
        >
          {archived ? 'Restore this client' : 'Archive this client'}
        </button>
      </div>

      {archived && (
        <div className="q-note q-note-warn">
          <span className="q-meta-plain">Archived — past bookings are untouched, but this won&rsquo;t appear in active picker lists.</span>
        </div>
      )}
    </div>
  );
}
