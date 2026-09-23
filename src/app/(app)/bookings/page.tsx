import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { readBookingsRegister } from '@/modules/bookings/register';
import { readBookingsMonth } from '@/modules/bookings/month';
import { PERIODS, type Period } from '@/modules/bookings/interface';
import { Workspace } from './Workspace';

export const dynamic = 'force-dynamic';

/**
 * BOOKINGS - read once on the server, then worked in the browser.
 *
 * This page's whole job is to fetch the book and hand it over. Every reading
 * of it - the five views, the cut, the grouping, the sort, the search - happens
 * in components/Workspace without asking the server again, because none of
 * those questions is about data the browser lacks. Before that, each of them
 * was a navigation that re-ran the entire read: measured between 1.3 and 8.6
 * seconds of application code to answer a question the page could already
 * answer.
 *
 * ONE READ. The register's rows are the whole page: every view is a derivation
 * of them, including the dated readings the calendar draws (modules/bookings/
 * dated), which are arithmetic over rows and not a query. The page briefly
 * called readBookingsDashboard as well and used one field of it - paying for
 * the absences, the pipeline, the period, the trace and two reads that ran
 * once per booking, to obtain a window it could derive for nothing. On a
 * connection where one round trip costs the better part of a second, that was
 * most of the wait.
 *
 * force-dynamic stands: this is one studio's book and it may not be cached
 * across tenants (the multi-tenant mandate). What that costs is the first
 * load; what it used to cost was every click.
 */
export default async function BookingsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }
  const params = await props.searchParams;
  const initial: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(params)) if (typeof v === 'string' && v) initial[k] = v;

  const periodDays = (PERIODS.find((p) => String(p.days) === initial.period)?.days ?? 30) as Period;
  const [{ sheet, rows }, month] = await Promise.all([
    readBookingsRegister(periodDays),
    readBookingsMonth(initial.month),
  ]);

  return (
    <Workspace
      rows={rows}
      lenses={sheet.lenses}
      today={sheet.today}
      figures={sheet.figures}
      months={sheet.series.months}
      series={sheet.series.lines}
      periodDays={sheet.period.days}
      month={month}
      initial={initial}
    />
  );
}
