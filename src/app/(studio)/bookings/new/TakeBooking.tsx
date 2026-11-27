'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createBooking } from '@/weave/bookings/actions';
import type { Package } from '@/weave/packages/shape';
import type { PackageElement } from '@/weave/packages/elements';
import type { PackageMedia } from '@/weave/packages/media';
import type { Deliverable } from '@/weave/deliverables/shape';
import type { Mate } from '@/weave/crew/actions';
import { PickPackage } from './PickPackage';
import { PickCrew, type Staffing } from './PickCrew';

/**
 * Taking a booking.
 *
 * A page of its own, because this was a row of four inputs that unfolded in
 * place on whatever screen the button happened to sit on — cramped, and it
 * rearranged the page around it every time it opened.
 *
 * Fields stacked and full width, in the same shape as the form a client fills
 * in at the studio's public address. The two are the same act arriving by
 * different doors, and there is no reason they should look like different
 * software.
 *
 * It ends on the booking it made rather than back where it started: the thing
 * somebody wants after writing a booking down is the booking.
 */
export function TakeBooking({
  catalogue, elements, deliverables, media, team, day,
}: {
  catalogue: Package[];
  /** Who works here, so a booking can be staffed as it is written down. */
  team: Mate[];
  /** A day already chosen, when the calendar sent somebody here. */
  day: string;
  /* What each package is made of, so its promise can be counted here. */
  elements: PackageElement[];
  deliverables: Deliverable[];
  media: PackageMedia[];
}) {
  const router = useRouter();
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [occasion, setOccasion] = useState('');
  const [occasionOn, setOccasionOn] = useState('');
  const [on, setOn] = useState(day);
  const [at, setAt] = useState('');
  const [packageId, setPackageId] = useState('');
  const [crew, setCrew] = useState<Staffing[]>([]);
  const [wants, setWants] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!clientName.trim()) {
      setProblem('A booking needs somebody it is for.');
      return;
    }
    /*
     * Said here as well as on the server, so the studio hears it in the same
     * breath as the press rather than after a round trip. The server is still
     * the gate; this is only the faster answer.
     */
    if (!clientEmail.trim()) {
      setProblem('A client needs an email address.');
      return;
    }
    if (!clientPhone.trim()) {
      setProblem('A client needs a phone number.');
      return;
    }
    setProblem(null);
    start(async () => {
      try {
        const { id } = await createBooking({
          clientName,
          clientEmail: clientEmail || null,
          clientPhone: clientPhone || null,
          wants,
          occasion: occasion || null,
          occasionOn: occasionOn || null,
          on: on || null,
          at: at || null,
          packageId: packageId || null,
          crew,
        });
        router.push(`/bookings/${id}`);
      } catch (err) {
        setProblem(err instanceof Error ? err.message : 'Could not start that booking');
      }
    });
  };

  return (
    <form className="q-stack q-stack-lg" onSubmit={submit}>
      {/*
        * WHO IT IS FOR, first and in full.
        *
        * Only the name used to be asked for here, and that left a client with
        * no address on their record — nothing to send a gallery to, and
        * nothing to ever offer an account at. A client is still never made to
        * sign up to be booked; this is simply the moment the studio has their
        * details in front of them.
        *
        * ALL THREE ARE REQUIRED. This system's habit is to let a thing exist
        * thin and grow, and this is a deliberate exception to it: a client
        * record with no way to reach the client is not an early version of
        * anything. The gallery has nowhere to go, the invoice has nowhere to
        * go, and the account can never be offered.
        */}
      {/*
        * `q-reading` rather than `q-section-title` for these two. The section
        * label and the field label were 0.68rem and 0.64rem of the same faint
        * mono, so "Client" sat at the same level as "Name" underneath it and
        * the form read as six fields in a row rather than two groups. An
        * inked, body-sized heading is the difference the stylesheet already
        * draws between a thing you read and a label on a value.
        */}
      <section className="q-stack">
        <h2 className="q-reading">Client</h2>

        <label className="q-auth-field">
          <span className="q-label">Name</span>
          <input
            className="q-input" value={clientName} autoFocus required disabled={working}
            onChange={(e) => { setClientName(e.target.value); setProblem(null); }}
          />
          <span className="q-auth-hint">
            A name that is new becomes a client. No need to add them first.
          </span>
        </label>

        <label className="q-auth-field">
          <span className="q-label">Email</span>
          <input
            className="q-input" type="email" value={clientEmail} required disabled={working}
            onChange={(e) => { setClientEmail(e.target.value); setProblem(null); }}
          />
          <span className="q-auth-hint">
            Where a gallery is sent, and where an account can be offered later.
          </span>
        </label>

        <label className="q-auth-field">
          <span className="q-label">Phone</span>
          <input
            className="q-input" type="tel" value={clientPhone} required disabled={working}
            onChange={(e) => { setClientPhone(e.target.value); setProblem(null); }}
          />
        </label>
      </section>


      {/*
        * WHEN IT HAPPENS. Columns on the booking, not a row in a table beside
        * it: a thing that happens is a property of the work. The cost is that
        * there is exactly one of them, so a wedding with an engagement shoot
        * besides is two bookings.
        *
        * Both optional. "Agreed, day to be settled" is the commonest state at
        * the moment a booking is taken, and a day with no hour agreed is
        * another.
        */}
      <section className="q-stack">
        <h2 className="q-reading">Date and time</h2>

        <label className="q-auth-field">
          <span className="q-label">Date</span>
          <input
            className="q-input" type="date" value={on} disabled={working}
            onChange={(e) => { setOn(e.target.value); setProblem(null); }}
          />
          <span className="q-auth-hint">
            When the shoot happens, not when it was booked.
          </span>
        </label>

        {/*
          * ONE TIME. There was a start and an end, carried over from
          * occasions, where the pair fed double-booking detection by
          * comparing spans. That went with crew, so an end informed nobody.
          */}
        <label className="q-auth-field">
          <span className="q-label">Time</span>
          <input
            className="q-input" type="time" value={at} disabled={working}
            onChange={(e) => { setAt(e.target.value); setProblem(null); }}
          />
        </label>
      </section>

      {/*
        * WHAT IT IS FOR, in the studio's own words.
        *
        * Free text and never a list. The system before last hardcoded
        * birthday and wedding, and this project spent a year dissolving that.
        * Nothing in the engine behaves differently for one than another, so
        * nothing here earns a fixed set of values.
        *
        * Its day is kept apart from the day the studio works, because they
        * come apart: a pre-wedding session, a christening shot the day after.
        */}
      {/*
        * No heading: it would be the word "Occasion" sitting directly above a
        * field labelled "Occasion", which names the same thing twice.
        */}
      <section className="q-stack">
        <label className="q-auth-field">
          <span className="q-label">Occasion</span>
          <input
            className="q-input" value={occasion} disabled={working}
            placeholder="Wedding, naming ceremony, headshots"
            onChange={(e) => { setOccasion(e.target.value); setProblem(null); }}
          />
        </label>

        <label className="q-auth-field">
          <span className="q-label">Occasion date</span>
          <input
            className="q-input" type="date" value={occasionOn} disabled={working}
            onChange={(e) => { setOccasionOn(e.target.value); setProblem(null); }}
          />
          <span className="q-auth-hint">
            The day the occasion falls on. Not the day the studio works, which
            is above — they differ for a pre-wedding session.
          </span>
        </label>

        {/*
          * Notes sit with the occasion because both DESCRIBE the work. The
          * package and the team are choices made about it, and they come
          * after — which is also the order the booking reads back in on its
          * own page, so the same booking is not told two different ways by
          * the same app.
          */}
        <label className="q-auth-field">
          <span className="q-label">Notes</span>
          <textarea
            className="q-input" rows={3} value={wants} disabled={working}
            onChange={(e) => setWants(e.target.value)}
            placeholder="In the client's own words"
          />
        </label>

      </section>

      {/*
        * WHO IS ON IT. `weave.crew` is two ids — the booking and the person —
        * and nothing else, because it is an edge rather than a thing. What
        * somebody DOES is on the person, so it travels with them rather than
        * being said again on every booking.
        */}
      <section className="q-stack">
        <h2 className="q-reading">Team</h2>
        <PickCrew
          team={team}
          staffing={crew}
          onChange={(next) => { setProblem(null); setCrew(next); }}
          disabled={working}
        />
        {team.length > 0 && crew.length === 0 && (
          <span className="q-auth-hint">
            Nobody on it. A booking may be written down before it is staffed.
          </span>
        )}
      </section>

      {/*
        * No heading over this one. "Client" and "Date and time" name a group
        * of fields that would otherwise be unattributed; "Booking" named the
        * whole page, which the title already does.
        */}
      <section className="q-stack">

      {/*
        * What they are booking. A studio defines what it sells through
        * packages, so this is the thing being chosen — and a package is what
        * gives the gallery its shape and its promised count.
        *
        * The whole catalogue, not only what is published: a package still
        * being written can be booked over the phone, it is just not an offer
        * a stranger may take.
        */}
      <div className="q-auth-field">
        <span className="q-label">Package</span>
        <PickPackage
          catalogue={catalogue}
          elements={elements}
          deliverables={deliverables}
          media={media}
          chosen={packageId}
          onChoose={(id) => { setPackageId(id); setProblem(null); }}
          disabled={working}
        />
        {catalogue.length > 0 && (
          <span className="q-auth-hint">
            {packageId
              ? 'Opens the gallery it promises. Press it again for no package.'
              : 'No package chosen. A booking may be taken without one.'}
          </span>
        )}
      </div>

      </section>

      {problem && <p className="q-note q-note-bad">{problem}</p>}

      <div className="q-row q-row-sm">
        <button className="q-btn q-btn-primary" type="submit" disabled={working}>
          {working ? 'Starting' : 'Start booking'}
        </button>
        <Link className="q-btn q-btn-ghost" href="/bookings">Cancel</Link>
      </div>
    </form>
  );
}
