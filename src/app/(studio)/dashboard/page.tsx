import Link from 'next/link';
import { theDashboard } from '@/weave/dashboard/actions';
import {
  outstanding, sayNotHandedOver, sayNotSent,
  sayShortOfPromise, sayStanding, sayUnanswered, sayWaiting,
} from '@/weave/dashboard/shape';

/**
 * The studio, read back to itself.
 *
 * This replaced a board of four columns grouped by `bookings.turn` — a column
 * somebody set by hand, so the board reported what the studio had last
 * remembered to say about its work rather than the work. Nothing here reads
 * it. Every line comes from something that happened: a shoot that took
 * place, a gallery never shared, an order paid and still on the shelf.
 *
 * A SECTION WITH NOTHING IN IT DOES NOT TAKE A CARD. Six cards, four of them
 * reassuring an operator that nothing is wrong, is a report about the studio
 * rather than the studio. What is outstanding is the page; the rest is not
 * drawn at all — until everything is clear, when the full set appears once,
 * so a studio that has only just signed up can still see what is watched.
 */
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const today = new Date();
  const d = await theDashboard(today.toLocaleDateString('en-CA'));
  const clear = outstanding(d) === 0;

  /* Drawn when it holds something — or when the whole board is clear. */
  const show = (has: boolean) => has || clear;

  return (
    <div className="q-page">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Dashboard</h1>
          <p className="q-page-subtitle">{sayStanding(d)}</p>
        </div>
      </header>

      <div className="q-stack q-stack-md">
        {show(d.unanswered.length > 0) && (
          <section className="q-card q-stack q-stack-sm">
            <h2 className="q-reading">{sayUnanswered(d.unanswered)}</h2>
            {d.unanswered.map((r) => (
              <Link key={r.id} href="/bookings" className="q-row q-row-between q-row-link">
                <span className="q-text-body">
                  {r.clientName ?? 'No name given'}
                  {r.wants ? ` · ${r.wants}` : ''}
                </span>
                <span className="q-meta q-warm">{sayWaiting(r.requestedAt, today)}</span>
              </Link>
            ))}
          </section>
        )}

        {show(d.notHandedOver.length > 0) && (
          <section className="q-card q-stack q-stack-sm">
            <h2 className="q-reading">{sayNotHandedOver(d.notHandedOver)}</h2>
            {d.notHandedOver.map((h) => (
              <Link key={h.galleryId} href={`/galleries/${h.galleryId}`} className="q-row q-row-between q-row-link">
                <span className="q-text-body">
                  {h.clientName ?? 'No name given'}
                  {` · ${h.galleryName}`}
                </span>
                <span className="q-meta">
                  {h.have} {h.have === 1 ? 'picture' : 'pictures'}, not shared
                </span>
              </Link>
            ))}
          </section>
        )}

        {show(d.shortOfPromise.length > 0) && (
          <section className="q-card q-stack q-stack-sm">
            <h2 className="q-reading">{sayShortOfPromise(d.shortOfPromise)}</h2>
            {d.shortOfPromise.map((g) => (
              <Link
                key={g.galleryId}
                href={g.bookingId ? `/bookings/${g.bookingId}` : '/galleries'}
                className="q-row q-row-between q-row-link"
              >
                <span className="q-text-body">{g.name}</span>
                <span className="q-meta q-warm">{g.have} of {g.promised}</span>
              </Link>
            ))}
          </section>
        )}

        {show(d.notSent.length > 0) && (
          <section className="q-card q-stack q-stack-sm">
            <h2 className="q-reading">{sayNotSent(d.notSent)}</h2>
            {d.notSent.map((o) => (
              <Link key={o.id} href="/orders" className="q-row q-row-between q-row-link">
                <span className="q-text-body">{o.clientName ?? 'No name given'}</span>
                <span className="q-meta">{sayWaiting(o.paidAt, today)}</span>
              </Link>
            ))}
          </section>
        )}

        {/* One door to one page, the same one the bookings page opens. */}
        <Link className="q-btn q-btn-primary q-btn-sm q-start-btn" href="/bookings/new">
          New booking
        </Link>
      </div>
    </div>
  );
}
