'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateBookingRecord } from '@/modules/bookings/interface';
import { updateClient } from '@/modules/clients/interface';
import { ClientPicker, clientEdits, type ClientOption, type ClientSelection } from '@/components/ClientPicker';
import { DURATION_CHOICES, formatDuration } from '@/kernel/currency';
import { toast, readableError } from '@/components/Toast';
import { ImageUpload } from '@/components/ImageUpload';

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
  brief,
  coverUrl: initialCoverUrl,
  coverPosition: initialCoverPosition,
  suggestedMinutes,
  clients,
}: {
  bookingId: string;
  title: string;
  contactId: string | null;
  scheduledFor: string | null;
  durationMinutes: number | null;
  /** What the client asked for, in their words. */
  brief: string | null;
  coverUrl: string | null;
  coverPosition: string | null;
  suggestedMinutes: number | null;
  clients: ClientOption[];
}) {
  const initial = {
    title,
    contactId: contactId || '',
    when: toLocalInput(scheduledFor),
    dur: durationMinutes ?? 0,
    brief: brief || '',
  };

  const [t, setT] = useState(initial.title);
  // Starts filled in with whoever the booking is already for, rather than as a
  // name in a dropdown that says nothing about which of two same-named people
  // this is.
  const [client, setClient] = useState<ClientSelection | null>(() => {
    const found = clients.find((c) => c.id === initial.contactId);
    return found
      ? { id: found.id, name: found.name || '', email: found.email || '', phone: found.phone || '' }
      : null;
  });
  const cid = client?.id || '';
  const [when, setWhen] = useState(initial.when);
  const [dur, setDur] = useState(initial.dur);
  const [briefText, setBriefText] = useState(initial.brief);
  const [coverUrl, setCoverUrl] = useState<string | null>(initialCoverUrl);
  const [coverPosition, setCoverPosition] = useState<string | null>(initialCoverPosition);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Cover saves immediately — an upload has already happened in storage, and
  // leaving the row unwritten until Save means navigating away orphans it.
  const saveCover = (patch: { coverUrl?: string | null; coverPosition?: string | null }) => {
    startTransition(async () => {
      try {
        await updateBookingRecord({ bookingId, ...patch });
        router.refresh();
      } catch (e: any) {
        toast.bad(readableError(e, 'The cover could not be saved.'));
      }
    });
  };

  const applyCover = (next: string | null) => {
    setCoverUrl(next);
    setCoverPosition(null);
    saveCover({ coverUrl: next, coverPosition: null });
  };

  const applyCoverPosition = (next: string) => {
    setCoverPosition(next);
    saveCover({ coverPosition: next });
  };

  const dirty =
    t !== initial.title || cid !== initial.contactId || when !== initial.when || dur !== initial.dur ||
    briefText !== initial.brief ||
    Boolean(clientEdits(client, clients));

  const save = () => {
    if (!t.trim()) { toast.bad('A booking needs a title.'); return; }
    startTransition(async () => {
      try {
        // Corrections to the client's own details are saved to the client, not
        // onto the booking — the booking only records who it is for.
        const edits = clientEdits(client, clients);
        if (edits) await updateClient(edits);

        await updateBookingRecord({
          bookingId,
          title: t,
          contactId: cid || null,
          scheduledFor: when ? new Date(when).toISOString() : null,
          durationMinutes: dur > 0 ? dur : null,
          brief: briefText,
        });
        router.push(`/bookings/${bookingId}`);
      } catch (e: any) {
        toast.bad(readableError(e, 'Could not save this booking.'));
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
        <ClientPicker
          clients={clients}
          value={client}
          onChange={setClient}
          label="Client"
          allowNone
        />
        <span className="q-meta-sm">
          A booking runs fine without one — attach whoever this turns out to be for.
        </span>
      </div>

      {/*
        * The one field here that is not a fact about the booking but a record of
        * the conversation that started it. It stays editable because an ask
        * changes as it is talked through, and because the packages that
        * eventually answer it rarely say everything it did.
        */}
      <div className="q-stack q-stack-sm">
        <label className="q-label" htmlFor="booking-brief">What they asked for</label>
        <textarea
          id="booking-brief"
          className="q-textarea"
          rows={3}
          value={briefText}
          onChange={(e) => setBriefText(e.target.value)}
          placeholder="Something for my mum's 70th, maybe thirty people, thinking a Saturday in June."
        />
        <span className="q-meta-sm">
          Their own words, kept as written. Emptying the box removes it.
        </span>
      </div>

      <div className="q-field">
        <label className="q-label">Cover</label>
        <ImageUpload
          url={coverUrl}
          folder="bookings"
          label="cover"
          maxEdge={2400}
          onUploaded={(u) => applyCover(u)}
          onCleared={() => applyCover(null)}
          position={coverPosition}
          onPositionChange={applyCoverPosition}
          disabled={isPending}
        />
        <span className="q-meta-sm">Saved as soon as it is chosen.</span>
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
        <button className="q-btn q-btn-primary" aria-busy={isPending} disabled={isPending || !dirty} onClick={save}>
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
