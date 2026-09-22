import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { studioTimezone } from '@/kernel/studioHours';
import { calendarIn, dayIn, addDays, bandOf, whenItems, type Band } from '@/kernel/bands';
import { axisOf, valuesSeen, type LensGroup, type Takes } from '@/kernel/lenses';
import { listEventsSince } from '@/kernel/events';
import { listNoteRemindersInRange } from '@/modules/notes/interface';
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
  /**
   * The answers, said: each with its kind, so a surface can place it without
   * knowing its name - a date-kind answer is a calendar fact (the occasion's
   * date, distinct from the session), a text one is what the crew needs on
   * the day, a number a quantity. Dates first, then the rest, in the order
   * the package asked them.
   */
  facts: { label: string; kind: string; text: string; day: string | null }[];
  /** When it entered its current stage - the last stage_changed event, else when it was made. */
  stageSince: string;
  /** Reminders on this booking now due, and the earliest of them. */
  reminders: { count: number; earliest: string } | null;
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
 * A FIGURE is one measure of bookings over the period, against the same
 * measure over the period before, so the delta is a fact and not a
 * feeling: bookings made; bookings agreed (an enquiry moved to a booked
 * stage - read from the stage_changed events, since a booking has no
 * "agreed at" of its own); the conversion of the two; sessions held (a
 * booked or completed booking on a date in the period - an enquiry with a
 * proposed date that was never agreed is not a session). Money is not
 * here: this page is every booking, and money is Finances' page. These
 * are the app's measures, not a studio's vocabulary; what a studio calls
 * its stages is read off the data below (lenses).
 */
export type Figure = {
  key: 'new' | 'agreed' | 'conversion' | 'sessions';
  label: string;
  value: number;
  unit: 'count' | 'percent';
  /** The same measure over the period before. */
  before: number;
  /** Said under the figure alongside the delta. */
  note: string | null;
};

/** One measure, month by month, for the last twelve months. */
export type SeriesLine = { key: 'new' | 'agreed' | 'sessions'; label: string; points: number[] };

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

/** An answer as text, by its kind - the only thing about a question the app may know. */
function sayAnswer(a: { kind: string; unit: string | null; value: unknown }): string {
  const v = a.value;
  switch (a.kind) {
    case 'date': return typeof v === 'string' ? new Date(`${v.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : String(v);
    case 'boolean': return v ? 'Yes' : 'No';
    case 'number': return a.unit ? `${v} ${a.unit}${Number(v) === 1 ? '' : 's'}` : String(v);
    case 'size': return typeof v === 'object' && v && 'w' in (v as any) ? `${(v as any).w}×${(v as any).h}${a.unit ? ` ${a.unit}` : ''}` : String(v);
    case 'multichoice': return Array.isArray(v) ? v.join(', ') : String(v);
    default: return String(v);
  }
}

/**
 * The absences and obligations a live booking can carry, in the order they
 * are resolved (11-BOOKINGS_INFORMATION_ARCHITECTURE §5-6): an enquiry
 * whose session date passed undecided; a decision awaited from the studio
 * or the client; a reminder the studio set itself, now due; no client, no
 * date, no package; a session coming up with a step unassigned.
 */
export const MISSING = [
  { key: 'lapsed', label: 'Session date passed, undecided' },
  { key: 'decision-studio', label: 'Awaiting studio decision' },
  { key: 'decision-client', label: 'Awaiting client decision' },
  { key: 'reminder', label: 'Reminder due' },
  { key: 'client', label: 'No client' },
  { key: 'date', label: 'No date' },
  { key: 'package', label: 'No package' },
  { key: 'crew', label: 'Unassigned steps, upcoming' },
] as const;
export type MissingKey = (typeof MISSING)[number]['key'];

export async function readBookingsSheet(periodDays: Period = 30): Promise<BookingsSheet> {
  const { orgId } = await getAuthOrgId();
  const [rows, stages, timezone] = await Promise.all([listBookings(), listStages(), studioTimezone(orgId)]);

  const cal = calendarIn(timezone);
  const { today } = cal;
  // Transitions are events. Every stage change, oldest first: the latest per
  // booking says when it entered its stage; those into a booked stage are the
  // agreements the period figures and the series count.
  const nowIso = new Date().toISOString();
  const [stageEvents, dueReminders] = await Promise.all([
    listEventsSince('booking', 'stage_changed', '1970-01-01'),
    listNoteRemindersInRange('1970-01-01', nowIso),
  ]);
  const agreedEvents = stageEvents.filter((e) => e.payload.kind === 'booked');
  const stageSinceOf = new Map<string, string>();
  for (const e of stageEvents) stageSinceOf.set(e.entityId, e.at);
  const remindersOf = new Map<string, { count: number; earliest: string }>();
  for (const n of dueReminders) {
    if (n.aboutType !== 'booking' || !n.aboutId || !n.remindAt) continue;
    const had = remindersOf.get(n.aboutId);
    remindersOf.set(n.aboutId, { count: (had?.count ?? 0) + 1, earliest: had && had.earliest < n.remindAt ? had.earliest : n.remindAt });
  }

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
      if (!t.done && !t.assignee) needsById.set(t.roleId ?? 'none', { id: t.roleId ?? 'none', name: t.roleName ?? 'No role set' });
    }
    const needs = [...needsById.values()];
    /*
     * WHAT IS MISSING - the edges a live booking grows over time and has not
     * yet: a client, a date, a package, a decision (an enquiry not yet agreed
     * - awaiting the client when a proposal is out, else the studio), and a
     * crew for a session coming up. Read off the row, never declared.
     */
    const upcoming = day !== null && day >= today;
    const enquiry = !r.stage || r.stage.kind === 'enquiry';
    const reminders = remindersOf.get(r.id) ?? null;
    const missing = closed ? [] : [
      ...(enquiry && day !== null && day < today ? ['lapsed'] : []),
      ...(enquiry ? [r.proposalOut ? 'decision-client' : 'decision-studio'] : []),
      ...(reminders ? ['reminder'] : []),
      ...(!r.clientName ? ['client'] : []),
      ...(day === null ? ['date'] : []),
      ...(r.lineCount === 0 ? ['package'] : []),
      ...(r.stage?.kind === 'booked' && upcoming && (work?.unstaffed ?? 0) > 0 ? ['crew'] : []),
    ];
    const takes: Takes = {
      stage: r.stage ? [r.stage.id] : [],
      when: [band],
      needs: closed ? [] : needs.map((n) => n.id),
      missing,
    };
    for (const c of r.classification) (takes[`dim:${c.dimensionId}`] ??= []).push(c.valueId);
    const facts = [...r.answers]
      .sort((a, b) => Number(b.kind === 'date') - Number(a.kind === 'date'))
      .map((a) => ({ label: a.label, kind: a.kind, text: sayAnswer(a), day: a.kind === 'date' && typeof a.value === 'string' ? a.value.slice(0, 10) : null }));
    return { ...r, band, day, work, needs, facts, stageSince: stageSinceOf.get(r.id) ?? r.createdAt, reminders, takes };
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
    // Each role with an unassigned step, most needed first.
    axisOf(sheetRows, 'needs', 'Needs', [...roleName.entries()].map(([id, name]) => ({ key: id, label: name, due: true })), { none: 'Fully assigned', mostFirst: true }),
    // What a live booking has not yet - each a door from the dashboard.
    axisOf(sheetRows, 'missing', 'Missing', MISSING.map((m) => ({ key: m.key, label: m.label, due: true })), { none: 'Nothing missing' }),
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
  const held = (r: SheetBooking) => r.stage?.kind === 'booked' || r.stage?.kind === 'completed';
  const madeIn = (a: string, b: string) => rows.filter((r) => within(dayOf(r.createdAt), a, b)).length;
  const agreedIn = (a: string, b: string) => new Set(agreedEvents.filter((e) => within(dayOf(e.at), a, b)).map((e) => e.entityId)).size;
  const sessionsIn = (a: string, b: string) => sheetRows.filter((r) => held(r) && within(r.day, a, b)).length;
  const rate = (agreed: number, made: number) => (made > 0 ? Math.round((agreed / made) * 100) : 0);
  const made = madeIn(from, today), madeBefore = madeIn(beforeFrom, beforeTo);
  const agreed = agreedIn(from, today), agreedBefore = agreedIn(beforeFrom, beforeTo);
  const figures: Figure[] = [
    { key: 'new', label: 'New bookings', unit: 'count', value: made, before: madeBefore, note: null },
    { key: 'agreed', label: 'Agreed', unit: 'count', value: agreed, before: agreedBefore, note: null },
    { key: 'conversion', label: 'Conversion', unit: 'percent', value: rate(agreed, made), before: rate(agreedBefore, madeBefore), note: `${agreed} agreed of ${made} new` },
    { key: 'sessions', label: 'Sessions', unit: 'count', value: sessionsIn(from, today), before: sessionsIn(beforeFrom, beforeTo), note: null },
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
      { key: 'agreed' as const, label: 'Agreed', points: byMonth(agreedEvents.map((e) => dayOf(e.at))) },
      { key: 'sessions' as const, label: 'Sessions', points: byMonth(sheetRows.filter(held).map((r) => r.day)) },
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
