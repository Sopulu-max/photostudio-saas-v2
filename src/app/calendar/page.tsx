import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StudioShell } from '../StudioShell';
import { whoIsAsking } from '@/weave/studio';
import { occasionsBetween } from '@/weave/occasions/actions';
import { sayClashes, clashesIn } from '@/weave/occasions/shape';
import { Diary } from './Diary';

export const dynamic = 'force-dynamic';

/**
 * The calendar.
 *
 * It reads occasions — the things that happen on a job — so it invents
 * nothing. A month is simply the span a studio holds in its head, and until
 * now the only span the app could show was today.
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

  // `?m=2026-11`, so a month can be linked to and come back the same.
  const asked = /^\d{4}-\d{2}$/.test(m ?? '') ? m! : today.slice(0, 7);
  const year = Number(asked.slice(0, 4));
  const month = Number(asked.slice(5, 7)) - 1;

  /*
   * A fortnight either side of the month, because the grid shows the tail of
   * the previous month and the head of the next, and a booking that appears
   * blank in those cells would be a lie about an empty day.
   */
  const from = new Date(Date.UTC(year, month, -7)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, month + 1, 14)).toISOString().slice(0, 10);
  const occasions = await occasionsBetween(from, to);

  const inMonth = occasions.filter((o) => o.onDate.slice(0, 7) === asked);
  const shift = (by: number) => {
    const d = new Date(Date.UTC(year, month + by, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  const clashes = clashesIn(inMonth);
  const named = new Date(Date.UTC(year, month, 1))
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const said = inMonth.length === 0
    ? `No bookings in ${named}.`
    : `${inMonth.length} ${inMonth.length === 1 ? 'booking' : 'bookings'} in ${named}`
      + `${clashes.length > 0 ? '' : '. No double-bookings.'}`;

  return (
    <StudioShell here="calendar" studioName={who.studioName}>
    <div className="q-page">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">{named}</h1>
          <p className="q-page-subtitle">{sayClashes(clashes) ?? said}</p>
        </div>
        <div className="q-row q-row-sm">
          <Link className="q-btn q-btn-ghost q-btn-xs" href={`/calendar?m=${shift(-1)}`}>Previous</Link>
          <Link className="q-btn q-btn-ghost q-btn-xs" href="/calendar">This month</Link>
          <Link className="q-btn q-btn-ghost q-btn-xs" href={`/calendar?m=${shift(1)}`}>Next</Link>
        </div>
      </header>

      <Diary occasions={occasions} year={year} month={month} today={today} />
    </div>
    </StudioShell>
  );
}
