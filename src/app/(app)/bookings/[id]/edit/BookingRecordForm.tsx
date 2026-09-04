'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateBookingRecord } from '@/modules/bookings/interface';
import { updateClient } from '@/modules/clients/interface';
import { ClientPicker, clientEdits, type ClientOption, type ClientSelection } from '@/components/ClientPicker';
import { DURATION_CHOICES, formatDuration } from '@/kernel/currency';
import { toast, readableError } from '@/components/Toast';
import { wallClockIn } from '@/kernel/wallClock';
import { DayContext } from '@/components/DayContext';
import { ImageUpload } from '@/components/ImageUpload';

/*
 * THE WALL CLOCK BELONGS TO THE STUDIO, NOT TO WHOEVER IS LOOKING.
 *
 * This read the stored instant with getHours(), which answers in the BROWSER's
 * timezone. An operator in a different zone from the studio was shown the wrong
 * time — and then this form sent that displayed time back with
 * `new Date(when).toISOString()`, so opening a booking and pressing Save moved
 * it. The public booking form settled this already: the time is a wall clock in
 * the studio's zone, and the server is what resolves it.
 */

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
  timeZone,
  children,
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
  /**
   * The studio's own timezone, which is whose wall clock this is.
   *
   * Passed in rather than read from the browser: a booking at 10:00 is at 10:00
   * in the studio, whoever happens to be looking at it and from where.
   */
  timeZone: string;
  /**
   * What else this page edits, rendered between the record's own fields and the
   * button that ends the page. Passed in rather than reached for, because those
   * sections are server-rendered and commit as you go — they are not this
   * form's to save, only to sit above.
   */
  children?: React.ReactNode;
}) {
  const initial = {
    title,
    contactId: contactId || '',
    when: wallClockIn(scheduledFor, timeZone),
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
          /*
           * Sent exactly as typed — "2026-08-29T10:00", no zone.
           *
           * new Date() here read it in the BROWSER's zone and handed the server
           * an instant, whose UTC time the server then re-read as a studio wall
           * clock. For a studio in Lagos that moved every booking an hour
           * earlier, and again on each save after that. The server resolves the
           * wall clock against the studio's own timezone instead.
           */
          scheduledFor: when || null,
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
    /*
     * THE SAVE BUTTON GOES LAST, BECAUSE IT IS LAST.
     *
     * This card used to end with Save, and the whole "What they're booking"
     * section came AFTER it — so the page's primary action sat halfway down
     * with an entire editable section beneath it. An operator who filled in the
     * top, pressed Save and left never saw the packages at all; and Save being
     * above them implied, wrongly, that it had anything to do with them.
     *
     * So the record's own fields keep their card, whatever else the page is
     * showing renders next, and the action row closes the page. The internal
     * booking form has always read this way — its sections run in order and its
     * button is the last thing on the page.
     */
    <div className="q-stack q-stack-lg">
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
        {/*
          * Whether the studio is open, and what is already on that day.
          *
          * The new-booking form has asked both since it was written; this page
          * asked neither — though rescheduling happens HERE, and a clash
          * matters far more when moving a shoot onto a day that already has one
          * than when first writing it down. Excluding this booking, which would
          * otherwise report itself as the thing it clashes with.
          */}
        <DayContext when={when} timeZone={timeZone} exceptBookingId={bookingId} />
      </div>

      </div>

      {/* Whatever else this page is editing — the packages, above the button
          that ends the page rather than below it. */}
      {children}

      {/*
        * A DISABLED BUTTON SAYS WHY IT IS DISABLED.
        *
        * This said the opposite of what was needed: the only line of text
        * appeared when the button WORKED ("Unsaved changes") and there was
        * nothing at all when it did not. So an operator opening the page met a
        * greyed-out Save with no explanation, which reads as a broken screen
        * rather than as a form with nothing in it to save.
        *
        * The new-booking form settled this already — it refuses until there is
        * something to record and says in the same breath what to add. Same
        * pattern here, because it is the same question being asked.
        */}
      <div className="q-row">
        <button className="q-btn q-btn-primary" aria-busy={isPending} disabled={isPending || !dirty} onClick={save}>
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
        <button
          className="q-btn q-btn-secondary"
          disabled={isPending}
          onClick={() => router.push(`/bookings/${bookingId}`)}
        >
          {/* Named for what it actually does. With nothing changed there is
              nothing to cancel, and calling it Cancel invites the worry that
              leaving will undo something. */}
          {dirty ? 'Discard changes' : 'Back to the booking'}
        </button>
        <span className="q-meta-sm">
          {dirty ? 'Unsaved changes' : 'Nothing changed yet.'}
        </span>
      </div>
    </div>
  );
}
