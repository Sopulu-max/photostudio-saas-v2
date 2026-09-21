import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudioCurrency } from '@/kernel/organizations';
import { studioTimezone } from '@/kernel/studioHours';
import { listBookings, listStages, type BookingListRow } from './domain';

/**
 * THE BOOKINGS SHEET - the studio's day book, as structured data.
 *
 * The list of every booking is where a studio starts its day, and it was
 * a list: every job, sorted, with a stage on each. What a studio asks of
 * it is different: what is happening today and this week; where each job
 * has got to - the stage, and inside it which step and who is on it; what
 * needs someone - a role nobody is on, money owed. This read answers those,
 * once, so the page only draws them - and the questions are the studio's own
 * (its stages, its roles, its currencies), read off the rows, not a fixed
 * six named here (see LensGroup).
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
  /** The roles this booking still needs someone for - each role with an unfinished step nobody is on. */
  needs: { id: string; name: string }[];
  /** What the money says: owed (something pending), not yet invoiced, or nothing to say. */
  money: 'owed' | 'uninvoiced' | null;
};

/**
 * A LENS IS A VALUE THE SHEET'S ROWS TAKE ON ONE OF ITS AXES, with how many
 * take it. The strip above the sheet is these, read off the data - never a
 * list named in code, which would lock every studio into one studio's six
 * questions. When: each band with bookings. Stage: each stage this studio
 * defined. Needs: each role with a step nobody is on. Money: owed, per
 * currency present; not yet invoiced. A studio that adds a stage or a role
 * sees a new lens; one with no enquiries sees no enquiry lens.
 */
export type LensGroup = {
  key: 'when' | 'stage' | 'needs' | 'money';
  label: string;
  items: { key: string; label: string; count: number; due?: boolean }[];
};

export type BookingsSheet = {
  bands: { key: SheetBand; label: string; note: string | null; rows: SheetBooking[] }[];
  lenses: LensGroup[];
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
  const [rows, stages, currency, timezone] = await Promise.all([listBookings(), listStages(), getStudioCurrency(), studioTimezone(orgId)]);

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
    const needsById = new Map<string, { id: string; name: string }>();
    for (const t of tasks) {
      // A step with nobody on it and no role saying who should be is a need too.
      if (!t.done && !t.assignee) needsById.set(t.roleId ?? 'none', { id: t.roleId ?? 'none', name: t.roleName ?? 'no role set' });
    }
    const billing = billingOf.get(r.id) ?? 'none';
    const money: SheetBooking['money'] = r.owed ? 'owed' : (!closed && billing === 'none' && r.lineCount > 0) ? 'uninvoiced' : null;
    return { ...r, band, work, billing, needs: [...needsById.values()], money };
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

  // ---- The lenses: each axis, the values present, with counts.
  const count = <K extends string>(rows: SheetBooking[], of: (r: SheetBooking) => K[]) => {
    const m = new Map<K, number>();
    for (const r of rows) for (const k of of(r)) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const open = sheetRows.filter((r) => r.band !== 'closed');

  const whenCounts = count(sheetRows, (r) => [r.band]);
  const when: LensGroup = {
    key: 'when', label: 'When',
    items: BAND_ORDER.filter((b) => whenCounts.has(b)).map((b) => ({ key: b, label: BAND_LABEL[b], count: whenCounts.get(b)! })),
  };

  // The studio's own stages, in the order it arranged them, each that has a booking.
  const stageCounts = count(sheetRows, (r) => (r.stage ? [r.stage.id] : []));
  const stage: LensGroup = {
    key: 'stage', label: 'Stage',
    items: (stages as { id: string; name: string }[]).filter((st) => stageCounts.has(st.id)).map((st) => ({ key: st.id, label: st.name, count: stageCounts.get(st.id)! })),
  };

  // Each role with a step nobody is on, most needed first.
  const needCounts = count(open, (r) => r.needs.map((n) => n.id));
  const roleName = new Map(open.flatMap((r) => r.needs.map((n) => [n.id, n.name] as const)));
  const needs: LensGroup = {
    key: 'needs', label: 'Needs',
    items: [...needCounts.entries()].sort((a, b) => b[1] - a[1])
      .map(([id, c]) => ({ key: id, label: roleName.get(id) ?? 'no role set', count: c, due: true })),
  };

  // Money: owed per currency present, and what has not been asked for at all.
  const owedBy = new Map<string, { amount: number; count: number }>();
  for (const r of sheetRows) if (r.owed) {
    const c = r.owed.currency ?? currency;
    const had = owedBy.get(c) ?? { amount: 0, count: 0 };
    owedBy.set(c, { amount: had.amount + r.owed.amount, count: had.count + 1 });
  }
  const uninvoiced = open.filter((r) => r.money === 'uninvoiced').length;
  const money: LensGroup = {
    key: 'money', label: 'Money',
    items: [
      ...[...owedBy.entries()].map(([c, v]) => ({ key: `owed:${c}`, label: `owed · ${new Intl.NumberFormat('en', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(v.amount)}`, count: v.count, due: true })),
      ...(uninvoiced > 0 ? [{ key: 'uninvoiced', label: 'not invoiced yet', count: uninvoiced }] : []),
    ],
  };

  return {
    bands,
    lenses: [when, stage, needs, money].filter((g) => g.items.length > 0),
    currency,
    today,
  };
}
