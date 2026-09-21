import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudioCurrency } from '@/kernel/organizations';
import { studioTimezone } from '@/kernel/studioHours';
import { calendarIn, dayIn, addDays, bandOf, whenItems, type Band } from '@/kernel/bands';
import { axisOf, valuesSeen, type LensGroup, type Takes } from '@/kernel/lenses';
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

/** The kernel's bands, plus closed: completed or cancelled, carrying nothing to do. */
export type SheetBand = Band | 'closed';

export type SheetBooking = BookingListRow & {
  band: SheetBand;
  /** The calendar day the work is, yyyy-mm-dd as the studio's clock reads it - null when unscheduled. */
  day: string | null;
  /** Where the work is, per service, from Production - null when the booking carries no steps. */
  work: { total: number; done: number; unstaffed: number; positions: { service: string; step: string | null; who: string | null; done: boolean }[] } | null;
  /** Whether what is on the booking has been asked for. */
  billing: 'none' | 'draft' | 'issued';
  /** The roles this booking still needs someone for - each role with an unfinished step nobody is on. */
  needs: { id: string; name: string }[];
  /** What the money says: owed (something pending), not yet invoiced, or nothing to say. */
  money: 'owed' | 'uninvoiced' | null;
  /** The values this row takes on each axis - axis key to item keys (kernel/lenses). */
  takes: Takes;
};

export type { LensGroup };

/**
 * THE PERIOD frames the figures: a rolling window ending today, on the
 * studio's clock, compared against the window of the same length before
 * it. Rolling, not calendar, so the 1st of a month does not read as a
 * collapse.
 */
export type Period = 7 | 30 | 90 | 365;
export const PERIODS: { days: Period; label: string }[] = [
  { days: 7, label: 'Last 7 days' }, { days: 30, label: 'Last 30 days' }, { days: 90, label: 'Last 90 days' }, { days: 365, label: 'Last year' },
];

/**
 * A FIGURE is one measure of the ontology over the period - bookings made,
 * sessions held, money in, money owed - with the same measure over the
 * period before, so the delta is a fact and not a feeling. These are the
 * app's measures, not a studio's vocabulary: every studio makes bookings,
 * holds sessions and takes money. What a studio calls its stages and roles
 * is read off the data below (lenses), never here.
 */
export type Figure = {
  key: 'new' | 'sessions' | 'collected' | 'owed';
  label: string;
  /** The value, and the unit it is in - a count, or a currency code. */
  value: number;
  unit: 'count' | string;
  /** The same measure over the period before; null when it has no period (a balance). */
  before: number | null;
  /** Said under the figure when there is no delta to say. */
  note: string | null;
};

/** One measure, month by month, for the last twelve months. */
export type SeriesLine = { key: Figure['key']; label: string; unit: 'count' | string; points: number[] };

export type BookingsSheet = {
  bands: { key: SheetBand; label: string; note: string | null; rows: SheetBooking[] }[];
  lenses: LensGroup[];
  currency: string;
  /** Today, as the studio reads it - the sheet's headings are dated from it. */
  today: string;
  period: { days: Period; from: string; to: string; beforeFrom: string; beforeTo: string };
  figures: Figure[];
  series: { months: string[]; lines: SeriesLine[] };
  /** Every booking by the studio's stage, in the studio's colours - the donut. */
  byStage: { key: string; label: string; count: number; look: { kind: string | null; color: string | null } | null }[];
};

const BAND_ORDER: SheetBand[] = ['today', 'tomorrow', 'week', 'later', 'undated', 'earlier', 'closed'];

export async function readBookingsSheet(periodDays: Period = 30): Promise<BookingsSheet> {
  const { orgId } = await getAuthOrgId();
  const [rows, stages, currency, timezone] = await Promise.all([listBookings(), listStages(), getStudioCurrency(), studioTimezone(orgId)]);

  const cal = calendarIn(timezone);
  const { today } = cal;

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
    const band: SheetBand = closed ? 'closed' : bandOf(day, cal);

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
    const needs = [...needsById.values()];
    const takes: Takes = {
      stage: r.stage ? [r.stage.id] : [],
      when: [band],
      needs: closed ? [] : needs.map((n) => n.id),
      money: money === 'owed' ? [`owed:${r.owed!.currency ?? currency}`] : money === 'uninvoiced' && !closed ? ['uninvoiced'] : [],
    };
    for (const c of r.classification) (takes[`dim:${c.dimensionId}`] ??= []).push(c.valueId);
    return { ...r, band, day, work, billing, needs, money, takes };
  });

  // ---- The axes: for each, the values present, with counts, in the order the axis is read.
  const roleName = new Map(sheetRows.flatMap((r) => r.needs.map((n) => [n.id, n.name] as const)));
  const owedBy = new Map<string, number>();
  for (const r of sheetRows) if (r.owed) { const c = r.owed.currency ?? currency; owedBy.set(c, (owedBy.get(c) ?? 0) + r.owed.amount); }
  const dimensions = new Map<string, { name: string; values: Map<string, string> }>();
  for (const r of sheetRows) for (const c of r.classification) {
    const d = dimensions.get(c.dimensionId) ?? { name: c.dimensionName, values: new Map<string, string>() };
    d.values.set(c.valueId, c.valueName);
    dimensions.set(c.dimensionId, d);
  }

  const whenOrder = [
    ...whenItems(cal).map((it) => (it.key === 'earlier' ? { ...it, label: 'Earlier, still open' } : it)),
    { key: 'closed', label: 'Closed' },
  ];
  const lenses: LensGroup[] = [
    axisOf(sheetRows, 'when', 'When', whenOrder),
    // The studio's own stages, in the order it arranged them, each in its chosen colour.
    axisOf(sheetRows, 'stage', 'Stage', (stages as { id: string; name: string; kind: string | null; color: string | null }[])
      .map((st) => ({ key: st.id, label: st.name, look: { kind: st.kind, color: st.color } })), { none: 'No stage' }),
    // Each role with a step nobody is on, most needed first.
    axisOf(sheetRows, 'needs', 'Needs', [...roleName.entries()].map(([id, name]) => ({ key: id, label: name, due: true })), { none: 'Nobody needed', mostFirst: true }),
    axisOf(sheetRows, 'money', 'Money', [
      ...[...owedBy.entries()].map(([c, amount]) => ({ key: `owed:${c}`, label: `Owed ${new Intl.NumberFormat('en', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(amount)}`, due: true })),
      { key: 'uninvoiced', label: 'Not invoiced yet' },
    ], { none: 'Nothing owed or pending' }),
    // Every dimension the studio classifies bookings by, its values by name.
    ...[...dimensions.entries()].map(([id, d]) =>
      axisOf(sheetRows, `dim:${id}`, d.name, valuesSeen(sheetRows, `dim:${id}`, (k) => d.values.get(k) ?? k), { none: `No ${d.name.toLowerCase()}` })),
  ].filter((g) => g.items.length > 0);

  // Within a band, soonest first; undated and closed by when they were made, newest first.
  const byDate = (a: SheetBooking, b: SheetBooking) =>
    a.scheduledFor && b.scheduledFor ? a.scheduledFor.localeCompare(b.scheduledFor) : b.createdAt.localeCompare(a.createdAt);
  const whenLabel = new Map(whenOrder.map((w) => [w.key, w]));
  const bands = BAND_ORDER
    .map((key) => ({
      key,
      label: whenLabel.get(key)!.label,
      note: (whenLabel.get(key) as { note?: string | null }).note ?? null,
      rows: sheetRows.filter((r) => r.band === key).sort(byDate),
    }))
    .filter((b) => b.rows.length > 0);

  // ---- The period, and the figures over it against the period before.
  const from = addDays(today, -(periodDays - 1));
  const beforeTo = addDays(from, -1);
  const beforeFrom = addDays(beforeTo, -(periodDays - 1));
  const within = (day: string | null, a: string, b: string) => day !== null && day >= a && day <= b;
  const dayOf = (iso: string | null) => (iso ? dayIn(iso, timezone) : null);
  const inbound = rows.flatMap((r) => r.transactions.filter((t) => t.direction === 'inbound'));
  const collected = (a: string, b: string) => inbound
    .filter((t) => t.status === 'settled' && within(dayOf(t.settledAt ?? t.createdAt), a, b))
    .reduce((n, t) => n + t.amount, 0);
  const owedNow = inbound.filter((t) => t.status === 'pending').reduce((n, t) => n + t.amount, 0);
  const owedOn = rows.filter((r) => r.owed).length;
  const figures: Figure[] = [
    { key: 'new', label: 'New bookings', unit: 'count', note: null,
      value: rows.filter((r) => within(dayOf(r.createdAt), from, today)).length,
      before: rows.filter((r) => within(dayOf(r.createdAt), beforeFrom, beforeTo)).length },
    { key: 'sessions', label: 'Sessions', unit: 'count', note: null,
      // A session is a booking scheduled in the window that was not cancelled.
      value: sheetRows.filter((r) => within(r.day, from, today) && r.stage?.kind !== 'cancelled').length,
      before: sheetRows.filter((r) => within(r.day, beforeFrom, beforeTo) && r.stage?.kind !== 'cancelled').length },
    { key: 'collected', label: 'Collected', unit: currency, note: null,
      value: collected(from, today), before: collected(beforeFrom, beforeTo) },
    { key: 'owed', label: 'Owed', unit: currency, before: null,
      value: owedNow, note: owedOn > 0 ? `across ${owedOn} booking${owedOn === 1 ? '' : 's'}` : 'nothing pending' },
  ];

  // ---- Twelve months of each measure, oldest first.
  const monthKey = (day: string) => day.slice(0, 7);
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  const byMonth = (days: (string | null)[], weight: number[] = []) => months.map((m) =>
    days.reduce((n, day, i) => (day && monthKey(day) === m ? n + (weight[i] ?? 1) : n), 0));
  const settled = inbound.filter((t) => t.status === 'settled');
  const series = {
    months,
    lines: [
      { key: 'new' as const, label: 'New bookings', unit: 'count' as const, points: byMonth(rows.map((r) => dayOf(r.createdAt))) },
      { key: 'sessions' as const, label: 'Sessions', unit: 'count' as const, points: byMonth(sheetRows.filter((r) => r.stage?.kind !== 'cancelled').map((r) => r.day)) },
      { key: 'collected' as const, label: 'Collected', unit: currency, points: byMonth(settled.map((t) => dayOf(t.settledAt ?? t.createdAt)), settled.map((t) => t.amount)) },
    ],
  };

  // ---- Every booking by the studio's stage, in the studio's order and colours.
  const stageCount = new Map<string, number>();
  for (const r of rows) stageCount.set(r.stage?.id ?? '', (stageCount.get(r.stage?.id ?? '') ?? 0) + 1);
  const byStage = [
    ...(stages as { id: string; name: string; kind: string | null; color: string | null }[])
      .filter((st) => stageCount.has(st.id))
      .map((st) => ({ key: st.id, label: st.name, count: stageCount.get(st.id)!, look: { kind: st.kind, color: st.color } })),
    ...(stageCount.has('') ? [{ key: '', label: 'No stage', count: stageCount.get('')!, look: null }] : []),
  ];

  return {
    bands, lenses, currency, today,
    period: { days: periodDays, from, to: today, beforeFrom, beforeTo },
    figures, series, byStage,
  };
}
