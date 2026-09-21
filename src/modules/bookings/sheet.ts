import { getAuthOrgId } from '@/lib/supabase/getOrgId';
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
 * needs someone - a role nobody is on, a date not set. This read answers those,
 * once, so the page only draws them - and the questions are the studio's own
 * (its stages, its roles, its dimensions), read off the rows, not a fixed
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
  /** The roles this booking still needs someone for - each role with an unfinished step nobody is on. */
  needs: { id: string; name: string }[];
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
 * A FIGURE is one measure of bookings - made in the period, held in it,
 * live now, live and undated now - the first two against the same measure
 * over the period before, so the delta is a fact and not a feeling; the
 * last two balances, with a note. Money is not here: this page is every
 * booking, and money is Finances' page. These are the app's measures, not
 * a studio's vocabulary: every studio makes bookings and holds sessions.
 * What a studio calls its stages is read off the data below (lenses).
 */
export type Figure = {
  key: 'new' | 'sessions' | 'live' | 'undated';
  label: string;
  value: number;
  /** The same measure over the period before; null when it has no period (a balance). */
  before: number | null;
  /** Said under the figure when there is no delta to say. */
  note: string | null;
};

/** One measure, month by month, for the last twelve months. */
export type SeriesLine = { key: 'new' | 'sessions'; label: string; points: number[] };

export type BookingsSheet = {
  bands: { key: SheetBand; label: string; note: string | null; rows: SheetBooking[] }[];
  lenses: LensGroup[];
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
  const [rows, stages, timezone] = await Promise.all([listBookings(), listStages(), studioTimezone(orgId)]);

  const cal = calendarIn(timezone);
  const { today } = cal;

  const { resolveBookingTasks } = await import('@/modules/production/interface');
  const live = rows.filter((r) => !r.stage || r.stage.kind === 'enquiry' || r.stage.kind === 'booked');
  const tasksByBooking = await resolveBookingTasks(orgId, live.map((r) => r.id));

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
    const needs = [...needsById.values()];
    const takes: Takes = {
      stage: r.stage ? [r.stage.id] : [],
      when: [band],
      needs: closed ? [] : needs.map((n) => n.id),
    };
    for (const c of r.classification) (takes[`dim:${c.dimensionId}`] ??= []).push(c.valueId);
    return { ...r, band, day, work, needs, takes };
  });

  // ---- The axes: for each, the values present, with counts, in the order the axis is read.
  const roleName = new Map(sheetRows.flatMap((r) => r.needs.map((n) => [n.id, n.name] as const)));
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
  const liveRows = sheetRows.filter((r) => r.band !== 'closed');
  const undated = liveRows.filter((r) => r.day === null).length;
  const figures: Figure[] = [
    { key: 'new', label: 'New bookings', note: null,
      value: rows.filter((r) => within(dayOf(r.createdAt), from, today)).length,
      before: rows.filter((r) => within(dayOf(r.createdAt), beforeFrom, beforeTo)).length },
    { key: 'sessions', label: 'Sessions', note: null,
      // A session is a booking scheduled in the window that was not cancelled.
      value: sheetRows.filter((r) => within(r.day, from, today) && r.stage?.kind !== 'cancelled').length,
      before: sheetRows.filter((r) => within(r.day, beforeFrom, beforeTo) && r.stage?.kind !== 'cancelled').length },
    { key: 'live', label: 'Live', before: null, value: liveRows.length,
      note: liveRows.length > 0 ? `${liveRows.filter((r) => (r.work?.unstaffed ?? 0) > 0).length} with a step nobody is on` : 'nothing open' },
    { key: 'undated', label: 'No date yet', before: null, value: undated,
      note: undated > 0 ? 'live, and not yet scheduled' : 'every live booking has a date' },
  ];

  // ---- Twelve months of each measure, oldest first.
  const monthKey = (day: string) => day.slice(0, 7);
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  const byMonth = (days: (string | null)[]) => months.map((m) => days.filter((day) => day && monthKey(day) === m).length);
  const series = {
    months,
    lines: [
      { key: 'new' as const, label: 'New bookings', points: byMonth(rows.map((r) => dayOf(r.createdAt))) },
      { key: 'sessions' as const, label: 'Sessions', points: byMonth(sheetRows.filter((r) => r.stage?.kind !== 'cancelled').map((r) => r.day)) },
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
    bands, lenses, today,
    period: { days: periodDays, from, to: today, beforeFrom, beforeTo },
    figures, series, byStage,
  };
}
