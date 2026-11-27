import Link from 'next/link';
import { redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { theCalendar } from '@/weave/calendar/actions';
import { doubledIn, sayDoubled, sayMonth, weeksOf } from '@/weave/calendar/shape';
import { Month } from './Month';

export const dynamic = 'force-dynamic';

/**
 * Every date the studio is committed to, in one month.
 *
 * A SECOND READING of dates that already exist. The shoot, the occasion it is
 * for, a day somebody has asked for, selects due, a gallery closing, a code
 * expiring, a follow-up owed — all of them live in the table that needed them,
 * and this is the one place they are seen together.
 *
 * Nothing that merely HAPPENED is here. The schema holds twenty-five dates
 * and most are a record — accepted_at, paid_at, shared_at — which belong in a
 * log, because nobody can act on the day a gallery was shared.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const today = new Date().toLocaleDateString('en-CA');
  const { m } = await searchParams;

  /* `?m=2026-12`, so a month can be linked to and come back the same. */
  const asked = /^\d{4}-\d{2}$/.test(m ?? '') ? m! : today.slice(0, 7);
  const year = Number(asked.slice(0, 4));
  const month = Number(asked.slice(5, 7)) - 1;

  const weeks = weeksOf(year, month);
  /* The grid shows the tail of one month and the head of the next, so the
   * range is the grid's own first and last day rather than the month's. */
  const entries = await theCalendar(weeks[0][0], weeks[weeks.length - 1][6]);

  const inMonth = entries.filter((e) => e.on.slice(0, 7) === asked);
  const doubled = doubledIn(inMonth);

  const shift = (by: number) => {
    const d = new Date(Date.UTC(year, month + by, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const named = new Date(Date.UTC(year, month, 1))
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="q-page">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">{named}</h1>
          <p className="q-page-subtitle">{sayMonth(inMonth, named)}</p>
        </div>
        <div className="q-row q-row-sm">
          <Link className="q-btn q-btn-ghost q-btn-xs" href={`/calendar?m=${shift(-1)}`}>Previous</Link>
          <Link className="q-btn q-btn-ghost q-btn-xs" href="/calendar">This month</Link>
          <Link className="q-btn q-btn-ghost q-btn-xs" href={`/calendar?m=${shift(1)}`}>Next</Link>
        </div>
      </header>

      {/* The one thing a month can tell a studio that a list cannot. */}
      {sayDoubled(doubled) && <p className="q-clash">{sayDoubled(doubled)}</p>}

      <Month weeks={weeks} month={month} today={today} entries={entries} />
    </div>
  );
}
