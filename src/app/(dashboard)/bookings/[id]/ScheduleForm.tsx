'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setBookingSchedule } from '@/modules/bookings/interface';

/** When is this booking? Feeds the Calendar view. */
export function ScheduleForm({ bookingId, scheduledFor }: { bookingId: string; scheduledFor: string | null }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [value, setValue] = useState(scheduledFor ? new Date(scheduledFor).toISOString().slice(0, 16) : '');

  const save = (next: string) =>
    startTransition(async () => {
      try {
        await setBookingSchedule({ bookingId, scheduledFor: next ? new Date(next).toISOString() : null });
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Could not set the date.');
      }
    });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
      <input
        type="datetime-local"
        className="q-input"
        value={value}
        disabled={isPending}
        onChange={(e) => { setValue(e.target.value); save(e.target.value); }}
        style={{ minWidth: '14rem' }}
      />
      {value && (
        <button
          className="q-btn q-btn-secondary"
          style={{ fontSize: '0.78rem' }}
          disabled={isPending}
          onClick={() => { setValue(''); save(''); }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
