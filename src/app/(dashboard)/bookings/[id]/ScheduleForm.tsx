'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setBookingSchedule } from '@/modules/bookings/interface';

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  // datetime-local wants local wall-clock, not UTC
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * When is this booking? Feeds the Calendar.
 *
 * The date is held locally while you pick it — a datetime input fires onChange
 * for every part you touch, and writing on each one meant several server round
 * trips to set one date. Save commits it.
 */
export function ScheduleForm({ bookingId, scheduledFor }: { bookingId: string; scheduledFor: string | null }) {
  const initial = toLocalInput(scheduledFor);
  const [value, setValue] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = value !== initial;

  const commit = (next: string | null) =>
    startTransition(async () => {
      try {
        await setBookingSchedule({ bookingId, scheduledFor: next ? new Date(next).toISOString() : null });
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Could not set the date.');
      }
    });

  return (
    <div className="q-row">
      <input
        type="datetime-local"
        className="q-input"
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(e.target.value)}
        style={{ minWidth: '14rem' }}
      />
      {dirty && (
        <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending} onClick={() => commit(value || null)}>
          {isPending ? 'Saving…' : 'Save'}
        </button>
      )}
      {dirty && (
        <button className="q-btn q-btn-secondary q-btn-sm" disabled={isPending} onClick={() => setValue(initial)}>
          Cancel
        </button>
      )}
      {!dirty && initial && (
        <button className="q-btn q-btn-secondary q-btn-sm" disabled={isPending} onClick={() => { setValue(''); commit(null); }}>
          Clear
        </button>
      )}
    </div>
  );
}
