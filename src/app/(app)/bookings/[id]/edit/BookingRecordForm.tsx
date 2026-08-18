'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateBookingRecord } from '@/modules/bookings/interface';
import { DURATION_CHOICES, formatDuration } from '@/kernel/currency';

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * The booking's own record: the fields that live on the booking row.
 *
 * Held entirely in local state and committed on Save, unlike the detail page's
 * controls which fire the moment you touch them. That is the whole point of a
 * separate edit surface — you can change your mind about the date three times
 * without the calendar moving three times, and Cancel actually means cancel.
 *
 * What is *not* here: stage, crew, tasks, deliveries, contracts, invoices.
 * Those are the work, not the record, and they stay on the detail page where
 * an operator can reach them without opening an editor first.
 */
export function BookingRecordForm({
  bookingId,
  title,
  contactId,
  scheduledFor,
  durationMinutes,
  suggestedMinutes,
  clients,
}: {
  bookingId: string;
  title: string;
  contactId: string | null;
  scheduledFor: string | null;
  durationMinutes: number | null;
  suggestedMinutes: number | null;
  clients: { contactId: string; name: string }[];
}) {
  const initial = {
    title,
    contactId: contactId || '',
    when: toLocalInput(scheduledFor),
    dur: durationMinutes ?? 0,
  };

  const [t, setT] = useState(initial.title);
  const [cid, setCid] = useState(initial.contactId);
  const [when, setWhen] = useState(initial.when);
  const [dur, setDur] = useState(initial.dur);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty =
    t !== initial.title || cid !== initial.contactId || when !== initial.when || dur !== initial.dur;

  const save = () => {
    if (!t.trim()) { alert('A booking needs a title.'); return; }
    startTransition(async () => {
      try {
        await updateBookingRecord({
          bookingId,
          title: t,
          contactId: cid || null,
          scheduledFor: when ? new Date(when).toISOString() : null,
          durationMinutes: dur > 0 ? dur : null,
        });
        router.push(`/bookings/${bookingId}`);
      } catch (e: any) {
        alert(e?.message || 'Could not save this booking.');
      }
    });
  };

  const endsAt = when && dur > 0
    ? new Date(new Date(when).getTime() + dur * 60000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div className="q-card q-section q-stack q-stack-lg">
      <div className="q-stack q-stack-sm">
        <label className="q-label" htmlFor="booking-title">What this booking is called</label>
        <input
          id="booking-title"
          className="q-input"
          value={t}
          onChange={(e) => setT(e.target.value)}
          placeholder="Booking title"
        />
        <span className="q-meta-sm">
          Naming it yourself stops the system renaming it when the packages change.
        </span>
      </div>

      <div className="q-stack q-stack-sm">
        <label className="q-label" htmlFor="booking-client">Client</label>
        <select id="booking-client" className="q-input" value={cid} onChange={(e) => setCid(e.target.value)}>
          <option value="">No client yet</option>
          {clients.map((c) => (
            <option key={c.contactId} value={c.contactId}>{c.name}</option>
          ))}
        </select>
        <span className="q-meta-sm">
          A booking runs fine without one — attach whoever this turns out to be for.
        </span>
      </div>

      <div className="q-stack q-stack-sm">
        <label className="q-label" htmlFor="booking-when">When</label>
        <div className="q-row">
          <input
            id="booking-when"
            className="q-input"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
          <select className="q-input" value={dur} onChange={(e) => setDur(Number(e.target.value))} style={{ width: '10rem' }}>
            {DURATION_CHOICES.map((d) => <option key={d.minutes} value={d.minutes}>{d.label}</option>)}
          </select>
          {when && (
            <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => { setWhen(''); setDur(0); }}>
              Clear
            </button>
          )}
        </div>
        <span className="q-meta-sm">
          {endsAt
            ? `Ends around ${endsAt}. It shows on the calendar once saved.`
            : suggestedMinutes
              ? `What's booked suggests about ${formatDuration(suggestedMinutes)}.`
              : 'Without a date it stays off the calendar, which is fine for an enquiry.'}
        </span>
      </div>

      <div className="q-row">
        <button className="q-btn q-btn-primary" disabled={isPending || !dirty} onClick={save}>
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
        <button
          className="q-btn q-btn-secondary"
          disabled={isPending}
          onClick={() => router.push(`/bookings/${bookingId}`)}
        >
          Cancel
        </button>
        {dirty && <span className="q-meta-sm">Unsaved changes</span>}
      </div>
    </div>
  );
}
