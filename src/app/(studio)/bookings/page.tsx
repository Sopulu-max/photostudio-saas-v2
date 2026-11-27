import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { bookingsHeld } from '@/weave/bookings/actions';
import { requestsWaiting } from '@/weave/bookings/requests';
import { sayBefore, sayHeld, sayWhen, type BookingCard } from '@/weave/bookings/shape';
import { Requests } from './Requests';

export const dynamic = 'force-dynamic';

/** One line of work, whichever list it is in. */
function Row({ booking }: { booking: BookingCard }) {
  return (
    <Link className="q-row q-row-between q-row-link" href={`/bookings/${booking.id}`}>
      <span className="q-stack q-stack-xs">
        {/* The client, then the studio's own word for what the day is. */}
        <strong className="q-strong">{booking.clientName ?? 'No client'}</strong>
        <span className="q-meta">
          {booking.occasion ?? booking.wants ?? 'No occasion given'}
        </span>
      </span>
      <span className="q-meta">{sayWhen(booking.on, booking.at)}</span>
    </Link>
  );
}

/**
 * Every booking the studio holds.
 *
 * SOONEST FIRST, THEN WHAT IS BEHIND. Sorted plainly by date this page would
 * open on the oldest shoot in the studio's history; what somebody comes here
 * for is what is coming. Undated work sits with what is ahead, because a
 * booking nobody has put a day to is still work nobody has done — and it says
 * "No date set" rather than being hidden, since that is the row somebody can
 * act on today.
 *
 * Earlier work is capped. Every booking a studio has ever taken stops being a
 * reading and becomes an archive, and nobody scrolls an archive.
 *
 * The booking list counts agreed work. Requests have a separate section
 * with the controls to accept or decline them.
 */
export default async function BookingsPage() {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const [held, waiting, head] = await Promise.all([bookingsHeld(), requestsWaiting(), headers()]);
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3000';
  const scheme = head.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${scheme}://${host}`;

  const today = new Date().toLocaleDateString('en-CA');
  const ahead = held.filter((b) => !b.on || b.on >= today);
  const before = held.filter((b) => b.on && b.on < today).reverse();

  return (
    <div className="q-page q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Bookings</h1>
          <p className="q-page-subtitle">{sayHeld(ahead, before.length)}</p>
        </div>

        <Link className="q-btn q-btn-primary q-btn-sm" href="/bookings/new">
          New booking
        </Link>
      </header>

      <Requests waiting={waiting} origin={origin} today={today} />

      <div className="q-stack q-stack-md">
        {held.length === 0 ? (
          <p className="q-empty">
            No bookings. The first one starts from the button above, or from a
            request somebody sends to the studio.
          </p>
        ) : (
          <>
            {ahead.length > 0 && (
              <section className="q-stack q-stack-sm">
                {ahead.map((booking) => <Row key={booking.id} booking={booking} />)}
              </section>
            )}

            {before.length > 0 && (
              <section className="q-stack q-stack-sm">
                <h2 className="q-reading">{sayBefore(before.length)}</h2>
                {before.slice(0, 20).map((booking) => (
                  <Row key={booking.id} booking={booking} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
