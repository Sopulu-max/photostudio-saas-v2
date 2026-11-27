import { redirect } from 'next/navigation';
import { whoIsAsking } from '@/weave/studio';
import { theCalendar } from '@/weave/calendar/actions';
import { isView, rangeOf, type View } from '@/weave/calendar/shape';
import { Calendar } from './Calendar';

export const dynamic = 'force-dynamic';

/**
 * Every date the studio is committed to.
 *
 * A SECOND READING of dates that already exist. The shoot, the occasion it is
 * for, a day somebody has asked for, selects due, a gallery closing, a code
 * expiring, a follow-up owed — all of them live in the table that needed them,
 * and this is the one place they are seen together.
 *
 * Nothing that merely HAPPENED is here. The schema holds twenty-five dates
 * and most are a record — accepted_at, paid_at, shared_at — which belong in a
 * log, because nobody can act on the day a gallery was shared.
 *
 * IT ALWAYS FETCHES THE MONTH, whichever view was asked for. Seven queries
 * measured at 700–900ms in parallel, and switching between month, week and
 * day used to pay that every time, which is what made an app feel like a
 * website. The month grid already reaches to whole weeks, so a week or a day
 * inside that month is inside what has been fetched — one fetch, and the
 * three views are readings of it.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; d?: string }>;
}) {
  const who = await whoIsAsking();
  if (!who) redirect('/login');

  const today = new Date().toLocaleDateString('en-CA');
  const { v, d } = await searchParams;

  /* Validated rather than trusted: both arrive in a URL anybody can type. */
  const view: View = isView(v) ? v : 'month';
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') ? d! : today;

  /* The month around the anchor, which covers every view of it. */
  const { from, to } = rangeOf('month', anchor);
  const entries = await theCalendar(from, to);

  return (
    /*
     * KEYED ON THE SPAN THAT WAS FETCHED, not on the view.
     *
     * The view and the anchor are held in state inside, so switching between
     * them costs no round trip — but `useState` seeds from props only on
     * mount, so a navigation out of the fetched month re-rendered with new
     * data and kept the old anchor on screen: the URL said November and the
     * page still said December.
     *
     * Keying on the view would have fixed that and broken the point of the
     * whole thing, remounting on every switch. The span only changes when the
     * server has genuinely been asked for different data.
     */
    <Calendar
      key={`${from}-${to}`}
      entries={entries}
      from={from}
      to={to}
      view={view}
      anchor={anchor}
      today={today}
    />
  );
}
