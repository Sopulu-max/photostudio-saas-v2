'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBooking } from '@/modules/bookings/interface';

type Option = { id: string; name: string };

/**
 * A booking starts from what a studio actually knows: who it's for, what they
 * want, when. Nothing is required — the name composes itself from whatever is
 * given, so nobody has to invent a title.
 */
export function NewBookingForm({ clients, services }: { clients: Option[]; services: Option[] }) {
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [when, setWhen] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const create = () =>
    startTransition(async () => {
      try {
        const { bookingId } = await createBooking({
          contactId: contactId || null,
          serviceId: serviceId || null,
          scheduledFor: when ? new Date(when).toISOString() : null,
        });
        router.push(`/bookings/${bookingId}`);
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Failed to create the booking.');
      }
    });

  if (!open) {
    return <button className="q-btn q-btn-primary" onClick={() => setOpen(true)}>+ New booking</button>;
  }

  return (
    <div className="q-card q-stack q-stack-md" style={{ minWidth: 'min(30rem, 100%)' }}>
      <div className="q-field">
        <label className="q-label">Who&rsquo;s it for?</label>
        <select className="q-select" value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">Not sure yet</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="q-field">
        <label className="q-label">What do they want?</label>
        <select className="q-select" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          <option value="">Decide later</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="q-field">
        <label className="q-label">When?</label>
        <input type="datetime-local" className="q-input" value={when} onChange={(e) => setWhen(e.target.value)} />
      </div>

      <div className="q-row">
        <button className="q-btn q-btn-primary" onClick={create} disabled={isPending}>
          {isPending ? 'Creating…' : 'Create booking'}
        </button>
        <button className="q-btn q-btn-secondary" onClick={() => setOpen(false)} disabled={isPending}>Cancel</button>
      </div>

      <span className="q-meta-sm">
        Everything here is optional — start with nothing and fill it in as you learn it.
      </span>
    </div>
  );
}
