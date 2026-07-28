'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setBookingClient } from '@/modules/bookings/interface';

export function SetClientForm({ bookingId, clients }: { bookingId: string; clients: { contactId: string; name: string }[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (clients.length === 0) return null;

  return (
    <select
      className="q-select"
      value=""
      disabled={isPending}
      onChange={(e) => {
        const contactId = e.target.value;
        if (!contactId) return;
        startTransition(async () => {
          try { await setBookingClient({ bookingId, contactId }); router.refresh(); }
          catch (err: any) { alert(err?.message || 'Failed to set the client.'); }
        });
      }}
      style={{ fontSize: '0.85rem' }}
    >
      <option value="">{isPending ? 'Setting…' : 'Set a client…'}</option>
      {clients.map((c) => <option key={c.contactId} value={c.contactId}>{c.name}</option>)}
    </select>
  );
}
