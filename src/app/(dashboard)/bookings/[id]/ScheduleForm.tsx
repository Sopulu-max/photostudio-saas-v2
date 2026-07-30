'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setBookingSchedule } from '@/modules/bookings/interface';
import { DURATION_CHOICES, formatDuration } from '@/kernel/currency';

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * When the booking runs, and for how long. Held locally while you pick — a
 * datetime input fires onChange for every part you touch — and committed on Save.
 */
export function ScheduleForm({
  bookingId,
  scheduledFor,
  durationMinutes,
  suggestedMinutes,
}: {
  bookingId: string;
  scheduledFor: string | null;
  durationMinutes: number | null;
  suggestedMinutes: number | null;
}) {
  const initialWhen = toLocalInput(scheduledFor);
  const initialDur = durationMinutes ?? 0;
  const [when, setWhen] = useState(initialWhen);
  const [dur, setDur] = useState(initialDur);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = when !== initialWhen || dur !== initialDur;

  const commit = (nextWhen: string | null, nextDur: number) =>
    startTransition(async () => {
      try {
        await setBookingSchedule({
          bookingId,
          scheduledFor: nextWhen ? new Date(nextWhen).toISOString() : null,
          durationMinutes: nextDur > 0 ? nextDur : null,
        });
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Could not set the date.');
      }
    });

  const endsAt = when && dur > 0
    ? new Date(new Date(when).getTime() + dur * 60000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className="q-stack q-stack-sm">
      <div className="q-row">
        <input
          type="datetime-local"
          className="q-input"
          value={when}
          disabled={isPending}
          onChange={(e) => setWhen(e.target.value)}
          style={{ minWidth: '14rem' }}
        />
        <select className="q-select" value={dur} disabled={isPending}
          onChange={(e) => setDur(Number(e.target.value))} style={{ minWidth: '11rem' }}>
          {DURATION_CHOICES.map((d) => <option key={d.minutes} value={d.minutes}>{d.label}</option>)}
        </select>

        {dirty && (
          <>
            <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending} onClick={() => commit(when || null, dur)}>
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button className="q-btn q-btn-secondary q-btn-sm" disabled={isPending}
              onClick={() => { setWhen(initialWhen); setDur(initialDur); }}>Cancel</button>
          </>
        )}
        {!dirty && initialWhen && (
          <button className="q-btn q-btn-secondary q-btn-sm" disabled={isPending}
            onClick={() => { setWhen(''); setDur(0); commit(null, 0); }}>Clear</button>
        )}
      </div>

      {endsAt && <span className="q-meta-sm">Ends about {endsAt}.</span>}

      {suggestedMinutes && dur === 0 && (
        <span className="q-meta-sm">
          These services usually take {formatDuration(suggestedMinutes)} —{' '}
          <button className="q-btn-ghost q-link" onClick={() => setDur(suggestedMinutes)}>use that</button>
        </span>
      )}
    </div>
  );
}
