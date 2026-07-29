'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBooking } from '@/modules/bookings/interface';

export function NewBookingForm() {
  const [title, setTitle] = useState('');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    if (!title.trim()) return;
    startTransition(async () => {
      try {
        const { bookingId } = await createBooking({ title });
        router.push(`/bookings/${bookingId}`);
        router.refresh();
      } catch (e) {
        console.error(e);
        alert('Failed to create booking.');
      }
    });
  };

  if (!open) {
    return (
      <button className="q-btn q-btn-primary" onClick={() => setOpen(true)}>
        + New booking
      </button>
    );
  }

  return (
    <div className="q-row">
      <input
        autoFocus
        className="q-input"
        placeholder="e.g. Marcus — Headshots, next week"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
        style={{ minWidth: '18rem' }}
      />
      <button className="q-btn q-btn-primary" onClick={submit} disabled={isPending}>
        {isPending ? 'Creating…' : 'Create'}
      </button>
      <button className="q-btn q-btn-secondary" onClick={() => setOpen(false)} disabled={isPending}>
        Cancel
      </button>
    </div>
  );
}
