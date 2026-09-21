import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudioCurrency } from '@/kernel/organizations';
import { studioTimezone } from '@/kernel/studioHours';
import { listBookings, type BookingListRow } from './domain';

/**
 * THE BOOKINGS SHEET - the studio's day book, as structured data.
 *
 * The list of every booking is where a studio starts its day, and it was
 * a list: every job, sorted, with a stage on each. What a studio asks of
 * it is different: what is happening today and this week; where each job
 * has got to - the stage, and inside it which step and who is on it; what
 * needs someone - nobody on a step, money owed, no date set, an enquiry
 * waiting. This read answers those, once, so the page only draws them.
 *
 * BANDS BY WHEN THE WORK IS, in the studio's own timezone: today, tomorrow,
 * the rest of this week, later, no date yet, earlier and still open, and
 * closed (completed or cancelled), in that order. A booking is in exactly
 * one. The work on each row is the same reading the Work page makes
 * (Production's), so the two cannot disagree.
 */

export type SheetBand = 'today' | 'tomorrow' | 'week' | 'later' | 'undated' | 'earlier' | 'closed';

export type SheetBooking = BookingListRow & {
  band: SheetBand;
  /** Where the work is, per service, from Production - null when the booking carries no steps. */
  work: { total: number; done: number; unstaffed: number; positions: { service: string; step: string | null; who: string | null; done: boolean }[] } | null;
  /** Whether what is on the booking has been asked for. */
  billing: 'none' | 'draft' | 'issued';
};

export type BookingsSheet = {
  bands: { key: SheetBand; label: string; note: string | null; rows: SheetBooking[] }[];
  attention: {
    today: number;
    week: number;
    enquiries: number;
    /** Live bookings with a step nobody is on. */
    unstaffed: number;
    undated: number;
    /** Money pending, by currency. */
    owed: { amount: number; currency: string }[];
  };
  currency: string;
  /** Today, as the studio reads it - the sheet's headings are dated from it. */
  today: string;
};

const BAND_LABEL: Record<SheetBand, string> = {
  today: 'Today', tomorrow: 'Tomorrow', week: 'This week', later: 'Later',
  undated: 'No date yet', earlier: 'Earlier, still open', closed: 'Closed',
};
const BAND_ORDER: SheetBand[] = ['today', 'tomorrow', 'week', 'later', 'undated', 'earlier', 'closed'];

/** A calendar day, yyyy-mm-dd, as the studio's clock reads the instant. */
function dayIn(iso: string, timezone: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function readBookingsSheet(): Promise<BookingsSheet> {
  const { orgId } = await getAuthOrgId();
  const [rows, currency, timezone] = await Promise.all([listBookings(), getStudioCurrency(), studioTimezone(orgId)]);

  const today = dayIn(new Date().toISOString(), timezone);
  const tomorrow = addDays(today, 1);
  // The week runs to Sunday, as a working week is spoken of.
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const weekEnd = addDays(today, weekday === 0 ? 0 : 7 - weekday);

  const { resolveBookingTasks } = await import('@/modules/production/interface');
  const live = rows.filter((r) => !r.stage || r.stage.kind === 'enquiry' || r.stage.kind === 'booked');
  const tasksByBooking = await resolveBookingTasks(orgId, live.map((r) => r.id));
  const { data: invoiceRows } = await (await import('@/lib/supabase/admin')).supabaseAdmin
    .from('invoices').select('booking_id, status').eq('organization_id', orgId).is('voided_at', null)
    .in('booking_id', rows.map((r) => r.id));
  const billingOf = new Map<string, 'none' | 'draft' | 'issued'>();
  for (const inv of (invoiceRows || []) as any[]) {
    const had = billingOf.get(inv.booking_id);
    billingOf.set(inv.booking_id, inv.status === 'issued' || had === 'issued' ? 'issued' : 'draft');
  }

  const sheetRows: SheetBooking[] = rows.map((r) => {
    const closed = Boolean(r.stage && (r.stage.kind === 'completed' || r.stage.kind === 'cancelled'));
    const day = r.scheduledFor ? dayIn(r.scheduledFor, timezone) : null;
    const band: SheetBand = closed ? 'closed'
      : !day ? 'undated'
      : day < today ? 'earlier'
      : day === today ? 'today'
      : day === tomorrow ? 'tomorrow'
      : day <= weekEnd ? 'week'
      : 'later';

    const tasks = tasksByBooking.get(r.id) || [];
    let work: SheetBooking['work'] = null;
    if (tasks.length > 0) {
      const byService = new Map<string, { service: string; step: string | null; who: string | null; done: boolean; total: number; finished: number }>();
      for (const t of tasks) {
        const key = `${t.lineId ?? ''}:${t.packageServiceId ?? ''}`;
        const s = byService.get(key) ?? { service: t.fromService ?? (t.lineId ? 'Package' : 'Added here'), step: null, who: null, done: true, total: 0, finished: 0 };
        s.total += 1;
        if (t.done) s.finished += 1;
        else { s.done = false; if (!s.step) { s.step = t.name; s.who = t.assignee?.name ?? null; } }
        byService.set(key, s);
      }
      work = {
        total: tasks.length,
        done: tasks.filter((t) => t.done).length,
        unstaffed: tasks.filter((t) => !t.done && !t.assignee).length,
        positions: [...byService.values()].sort((a, b) => a.service.localeCompare(b.service))
          .map(({ service, step, who, done }) => ({ service, step, who, done })),
      };
    }
    return { ...r, band, work, billing: billingOf.get(r.id) ?? 'none' };
  });

  // Within a band, soonest first; undated and closed by when they were made, newest first.
  const byDate = (a: SheetBooking, b: SheetBooking) =>
    a.scheduledFor && b.scheduledFor ? a.scheduledFor.localeCompare(b.scheduledFor) : b.createdAt.localeCompare(a.createdAt);
  const bands = BAND_ORDER
    .map((key) => ({
      key,
      label: BAND_LABEL[key],
      note: key === 'today' ? new Date(`${today}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
        : key === 'week' ? `to ${new Date(`${weekEnd}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}`
        : null,
      rows: sheetRows.filter((r) => r.band === key).sort(byDate),
    }))
    .filter((b) => b.rows.length > 0);

  const owed = new Map<string, number>();
  for (const r of sheetRows) if (r.owed) owed.set(r.owed.currency ?? currency, (owed.get(r.owed.currency ?? currency) ?? 0) + r.owed.amount);
  const liveRows = sheetRows.filter((r) => r.band !== 'closed');
  return {
    bands,
    attention: {
      today: sheetRows.filter((r) => r.band === 'today').length,
      week: sheetRows.filter((r) => r.band === 'today' || r.band === 'tomorrow' || r.band === 'week').length,
      enquiries: liveRows.filter((r) => !r.stage || r.stage.kind === 'enquiry').length,
      unstaffed: liveRows.filter((r) => (r.work?.unstaffed ?? 0) > 0).length,
      undated: liveRows.filter((r) => r.band === 'undated').length,
      owed: [...owed.entries()].map(([c, amount]) => ({ amount, currency: c })),
    },
    currency,
    today,
  };
}
