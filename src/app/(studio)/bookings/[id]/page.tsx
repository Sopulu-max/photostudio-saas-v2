import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { readBooking } from '@/weave/bookings/actions';
import { whoIsAsking } from '@/weave/studio';
import { COLUMNS, sayOccasion, sayWhen } from '@/weave/bookings/shape';
import { headers } from 'next/headers';
import { filesForJob } from '@/weave/files/actions';
import { galleriesForJob, galleryActivityForJob, galleryTemplates } from '@/weave/galleries/actions';
import { priceLists } from '@/weave/store/actions';
import { crewFor, whoCouldBeOnIt } from '@/weave/crew/actions';
import { bookingBilling } from '@/weave/payments/queries';
import { PackageLines } from '@/components/PackageLines';
import { BookingAmend } from './BookingAmend';
import { BookingPayments } from './BookingPayments';
import { Crew } from './Crew';
import { Files } from './Files';
import { Galleries } from './Galleries';

export const dynamic = 'force-dynamic';

/**
 * One booking.
 *
 * Everything the studio knows about it, and — underneath — everything that has
 * happened to it. The history is here from the first version rather than added
 * once something has already gone wrong, because the log is only useful if it
 * was running before you needed it.
 */

/** The log, as sentences. A reading that needs a key is not a reading. */
function say(action: string, payload: Record<string, unknown>): string {
  const heading = (turn: unknown) =>
    COLUMNS.find((c) => c.turn === turn)?.heading ?? String(turn);

  if (action === 'started') {
    return payload.client ? `Started for ${payload.client}` : 'Started';
  }
  if (action === 'turn_changed') {
    return `Moved from ${heading(payload.from)} to ${heading(payload.to)}`;
  }
  if (action === 'invoice_issued') return `Invoice ${payload.number} issued`;
  if (action === 'invoice_voided') return 'Invoice voided';
  if (action === 'payment_recorded') return 'Payment recorded';
  if (action === 'payment_voided') return 'Payment entry voided';
  if (action === 'amended') {
    const changed: string[] = [];
    if ('wants' in payload) changed.push('the notes');
    if ('occasion' in payload) changed.push('the occasion');
    if ('occasion_on' in payload) changed.push('the occasion date');
    return changed.length ? `Changed ${changed.join(' and ')}` : 'Changed';
  }
  return action.replace(/_/g, ' ');
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const { id } = await params;
  const booking = await readBooking(id);
  if (!booking) notFound();

  /*
   * Asked together, not one after the other. Three sequential round trips to
   * draw one page is how an app starts feeling like a website, and none of
   * these three answers depends on another.
   */
  const [onIt, team, files, galleries, galleryActivity, templates, lists, billing, head] = await Promise.all([
    crewFor(id),
    whoCouldBeOnIt(),
    filesForJob(id),
    galleriesForJob(id),
    galleryActivityForJob(id),
    galleryTemplates(),
    priceLists(),
    bookingBilling(id),
    headers(),
  ]);

  // The address the studio is actually on, so a copied link works from wherever
  // this is being served rather than from a guess baked in at build time.
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3000';
  const scheme = head.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${scheme}://${host}`;
  const today = new Date().toLocaleDateString('en-CA');

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          {/*
            * THE NAME IS THE DOOR TO THE CLIENT. A booking is for somebody,
            * and what the studio wants next is often them — their number,
            * what else they have had done, what they have spent. It was a
            * dead heading, so the only way to them was the Clients page and
            * a search for a name already on the screen.
            *
            * Not a door when the client is gone: a person can be deleted and
            * the booking stands, because the record of the work is worth more
            * than a tidy row.
            */}
          <h1 className="q-page-title">
            {booking.clientId ? (
              <Link className="q-title-link" href={`/clients/${booking.clientId}`}>
                {booking.clientName ?? 'Unnamed client'}
              </Link>
            ) : (
              booking.clientName ?? 'No client'
            )}
          </h1>
          {/* The studio's own word for the day, exactly as typed. */}
          {sayOccasion(booking.occasion, booking.occasionOn, booking.on) && (
            <p className="q-eyebrow">
              {sayOccasion(booking.occasion, booking.occasionOn, booking.on)}
            </p>
          )}
          <p className="q-page-subtitle">
            {booking.wants ?? 'No notes.'}
          </p>
          <p className="q-meta">{sayWhen(booking.on, booking.at)}</p>
        </div>
        <Link className="q-btn q-btn-secondary q-btn-sm" href="#booking-payments">Payments</Link>
      </header>

      {/*
        * Stacked, like every other page. Without this the sections were plain
        * siblings in a block: each card's top sat exactly on the one above, so
        * two 1px hairlines met and read as a single heavy 2px rule with no air
        * on either side of it.
        */}
      <div className="q-stack q-stack-md">
      <BookingAmend booking={booking} />

      {billing && billing.packages.length > 0 && (
        <section className="q-card q-stack q-stack-sm" aria-labelledby="booking-packages-heading">
          <h2 className="q-section-title" id="booking-packages-heading">Packages</h2>
          <PackageLines lines={billing.packages} />
        </section>
      )}

      <BookingPayments bookingId={booking.id} billing={billing} origin={origin} today={today} />

      <Crew bookingId={booking.id} onIt={onIt} team={team} />

      <Files bookingId={booking.id} files={files} />

      <Galleries bookingId={booking.id} galleries={galleries} activity={galleryActivity} templates={templates} origin={origin} lists={lists} />

      <section className="q-card q-stack q-stack-sm">
        <h2 className="q-section-title">Activity</h2>
        {booking.history.length === 0 ? (
          <p className="q-empty">No activity recorded.</p>
        ) : (
          booking.history.map((e) => (
            <div key={e.id} className="q-row q-row-between">
              <span className="q-text-body">{say(e.action, e.payload ?? {})}</span>
              <span className="q-meta-sm">
                {new Date(e.at).toLocaleString('en-GB', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          ))
        )}
      </section>
      </div>
    </div>
  );
}
