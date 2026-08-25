import { redirect } from 'next/navigation';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { listBookingsInRange } from '@/modules/bookings/interface';
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

  // Each layer comes from the module that owns it, through its interface.
  const [bookings, due] = await Promise.all([
    listBookingsInRange(from, to),
    
    listDueInRange(from, to),
  ]);

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    return `/calendar?month=${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  return (
    <CalendarClient
      items={[...bookings, ...due] as any}
      year={year}
      month={month}
      monthLabel={new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}
      prevHref={shift(-1)}
      nextHref={shift(1)}
      todayKey={now.toISOString().slice(0, 10)}
    />
  );
}
