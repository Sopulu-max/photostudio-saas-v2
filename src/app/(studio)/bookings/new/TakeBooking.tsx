'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { InvoiceFields } from '@/components/InvoiceFields';
import { createBooking } from '@/weave/bookings/actions';
import type { Package } from '@/weave/packages/shape';
import type { PackageElement } from '@/weave/packages/elements';
import type { PackageMedia } from '@/weave/packages/media';
import type { Deliverable } from '@/weave/deliverables/shape';
import type { Mate } from '@/weave/crew/actions';
import type { Client } from '@/weave/clients/shape';
import { priceForInvoice } from '@/weave/payments/shape';
import { MAX_PACKAGE_QUANTITY, type PackageQuantity } from '@/weave/bookings/shape';
import { money } from '@/weave/store/shape';
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
  catalogue, elements, deliverables, media, team, clients, day, today,
}: {
  catalogue: Package[];
  /** Who works here, so a booking can be staffed as it is written down. */
  team: Mate[];
  clients: Pick<Client, 'id' | 'name' | 'email' | 'phone'>[];
  /** A day already chosen, when the calendar sent somebody here. */
  day: string;
  today: string;
  /* What each package is made of, so its promise can be counted here. */
  elements: PackageElement[];
  deliverables: Deliverable[];
  media: PackageMedia[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [occasion, setOccasion] = useState('');
  const [occasionOn, setOccasionOn] = useState('');
  const [on, setOn] = useState(day);
  const [at, setAt] = useState('');
  const [packages, setPackages] = useState<PackageQuantity[]>([]);
  const [crew, setCrew] = useState<Staffing[]>([]);
  const [wants, setWants] = useState('');
  const [withInvoice, setWithInvoice] = useState(false);
  const [withPayment, setWithPayment] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();
  const bookingKey = useRef<string | null>(null);

  const existingClient = clients.find((client) => client.id === clientId);
  const packageLines = packages.flatMap((line) => {
    const pack = catalogue.find((item) => item.id === line.packageId);
    return pack ? [{ name: pack.name, unitMinor: pack.price, currency: pack.currency, quantity: line.quantity }] : [];
  });
  const price = priceForInvoice(packageLines);
  const issueNow = withInvoice && price.source !== 'unavailable';

  const adjustPackage = (packageId: string, delta: -1 | 1) => {
    setPackages((current) => {
      const line = current.find((item) => item.packageId === packageId);
      const quantity = (line?.quantity ?? 0) + delta;
      if (quantity > MAX_PACKAGE_QUANTITY) return current;
      if (quantity <= 0) return current.filter((item) => item.packageId !== packageId);
      if (!line) return [...current, { packageId, quantity }];
      return current.map((item) => item.packageId === packageId ? { ...item, quantity } : item);
    });
    setWithPayment(false);
    setProblem(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
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
    const billing = issueNow ? new FormData(event.currentTarget) : undefined;
    const bookingId = bookingKey.current ?? crypto.randomUUID();
    bookingKey.current = bookingId;
    start(async () => {
      try {
        const result = await createBooking({
          bookingId,
          billing,
          clientId: clientId || null,
          clientName,
          clientEmail: clientEmail || null,
          clientPhone: clientPhone || null,
          wants,
          occasion: occasion || null,
          occasionOn: occasionOn || null,
          on: on || null,
          at: at || null,
          packages,
          crew,
        });
        if ('problem' in result) {
          if (result.problem.includes('must match the package price')) {
            router.refresh();
            setWithPayment(false);
            setProblem('Package pricing changed. Review the new price and any payment before saving.');
          } else {
            setProblem(result.problem);
          }
          return;
        }
        router.push(`/bookings/${result.id}${billing ? '#booking-payments' : ''}`);
      } catch {
        setProblem('Could not confirm the booking was saved. Try again.');
      }
    });
  };

  return (
    <form className="q-stack q-stack-lg" onSubmit={submit}>
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

        {clients.length > 0 && (
          <label className="q-auth-field">
            <span className="q-label">Client record</span>
            <select className="q-input" value={clientId} disabled={working} onChange={(event) => {
              const selected = clients.find((client) => client.id === event.target.value);
              setClientId(event.target.value);
              setClientName(selected?.name ?? '');
              setClientEmail(selected?.email ?? '');
              setClientPhone(selected?.phone ?? '');
              setProblem(null);
            }}>
              <option value="">Add new client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {[client.name, client.email, client.phone].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          </label>
        )}

        {!existingClient && (
          <label className="q-auth-field">
            <span className="q-label">Name</span>
            <input
              className="q-input" value={clientName} autoFocus required disabled={working}
              onChange={(e) => { setClientName(e.target.value); setProblem(null); }}
            />
          </label>
        )}

        <label className="q-auth-field">
          <span className="q-label">Email</span>
          <input
            className="q-input" type="email" value={clientEmail} required disabled={working}
            readOnly={Boolean(existingClient?.email)}
            onChange={(e) => { setClientEmail(e.target.value); setProblem(null); }}
          />
        </label>

        <label className="q-auth-field">
          <span className="q-label">Phone</span>
          <input
            className="q-input" type="tel" value={clientPhone} required disabled={working}
            readOnly={Boolean(existingClient?.phone)}
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
        <span className="q-label">Packages</span>
        <PickPackage
          catalogue={catalogue}
          elements={elements}
          deliverables={deliverables}
          media={media}
          selection={packages}
          onAdjust={adjustPackage}
          disabled={working}
        />
        {catalogue.length > 0 && (
          <span className="q-auth-hint" aria-live="polite">
            {packages.length === 0 && 'No packages selected.'}
            {packages.length > 0 && price.source === 'packages' && `${money(price.totalMinor, price.currency)} package total`}
            {packages.length > 0 && price.source === 'quote' && price.pricedSubtotal > 0
              && `${money(price.pricedSubtotal, price.currency)} priced subtotal`}
          </span>
        )}
      </div>

      </section>

      <section className="q-card q-stack q-stack-sm" aria-labelledby="new-booking-payments">
        <h2 className="q-reading" id="new-booking-payments">Payments</h2>
        {price.source === 'unavailable' ? (
          <p className="q-note">{price.problem}</p>
        ) : (
          <label className="q-row q-row-sm">
            <input type="checkbox" checked={withInvoice} disabled={working}
              onChange={(event) => {
                setWithInvoice(event.target.checked);
                if (!event.target.checked) setWithPayment(false);
                setProblem(null);
              }} />
            <span className="q-text-body">Issue invoice</span>
          </label>
        )}
        {issueNow && (
          <InvoiceFields price={price} packageLines={packageLines} disabled={working}
            payment={{ today, enabled: withPayment, onChange: (enabled) => { setWithPayment(enabled); setProblem(null); } }} />
        )}
      </section>

      {problem && <p className="q-note q-note-bad" role="alert">{problem}</p>}

      <div className="q-row q-row-sm">
        <button className="q-btn q-btn-primary" type="submit" disabled={working}>
          {working ? 'Saving booking' : issueNow ? 'Save booking and issue invoice' : 'Start booking'}
        </button>
        <Link className="q-btn q-btn-ghost" href="/bookings">Cancel</Link>
      </div>
    </form>
  );
}
