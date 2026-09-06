import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listBookingsInRange, listBookingsPlacedInRange, listClassificationDatesInRange } from '@/modules/bookings/interface';
import { listDueInRange } from '@/modules/finances/interface';
import { CalendarClient } from './CalendarClient';

export const dynamic = 'force-dynamic';

/**
 * The Calendar is a VIEW, not a module: it owns no data. It composes what each
 * module already knows — bookings' dates, Production's deadlines, Finances'
 * due money — and arranges them by day. Layers let you choose what to see.
 */
export default async function CalendarPage(props: { searchParams: Promise<{ month?: string }> }) {
  try {
    await getAuthOrgId();
  } catch {
    redirect('/login');
  }

  const sp = await props.searchParams;
  const now = new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(sp.month || '');
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const month = m ? Number(m[2]) : now.getUTCMonth() + 1; // 1-12

  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59)).toISOString();

  /*
   * Each layer comes from the module that owns it, through its interface.
   *
   * A BOOKING CONTRIBUTES THREE OF THEM, because it has three dates and they
   * are three different kinds of fact: when the agreement was made (the
   * record's own, and the only one every booking has), when the work happens
   * (the studio's schedule), and when the thing the work is about happens (not
   * the booking's at all — a birthday belongs to the birthday, and lives on
   * the classification that carries it).
   *
   * Three readings, not three columns. Nothing here is stored twice.
   */
  const [bookings, placed, occasions, due] = await Promise.all([
    listBookingsInRange(from, to),
    listBookingsPlacedInRange(from, to),
    listClassificationDatesInRange(from, to),
    listDueInRange(from, to),
  ]);

  /*
   * The layer takes the studio's own name for the question where they all
   * agree on one — "Occasion" here, "Season" at a studio that works that way.
   * Named generically only when a studio classifies dates under more than one,
   * because then no single name is true.
   */
  const dimensionNames = [...new Set(occasions.map((o: any) => o.dimensionName).filter(Boolean))];
  const occasionLayerLabel = dimensionNames.length === 1 ? String(dimensionNames[0]) : 'Occasions';

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    return `/calendar?month=${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  return (
    <CalendarClient
      items={[...bookings, ...placed, ...occasions, ...due] as any}
      occasionLayerLabel={occasionLayerLabel}
      year={year}
      month={month}
      monthLabel={new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}
      prevHref={shift(-1)}
      nextHref={shift(1)}
      todayKey={now.toISOString().slice(0, 10)}
    />
  );
}
