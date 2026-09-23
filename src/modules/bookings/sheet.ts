import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { studioTimezone } from '@/kernel/studioHours';
import { calendarIn, dayIn, addDays, bandOf, whenItems, type Band } from '@/kernel/bands';
import { axisOf, valuesSeen, type LensGroup, type Takes } from '@/kernel/lenses';
import { listEventsSince } from '@/kernel/events';
import { listNoteRemindersInRange } from '@/modules/notes/interface';
import { listStudioDimensions } from '@/modules/services/interface';
import { packageNarrowingsFor } from '@/modules/packages/interface';
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
  /**
   * THE PLANES this row sits on, each decided here so a statement is only
   * ever composed and never re-derived (12-BOOKINGS_READABILITY §5): which
   * edges it has, what it is for and what its packages left open, its dated
   * facts, where its work is, and whether it is finished. The page says these
   * in words (say.ts); nothing here is drawn as a mark.
   */
  planes: Planes;
};

export type StepState = 'done' | 'current' | 'open' | 'ahead';
export type Planes = {
  /** The four edges a booking grows first, in the order a job resolves them. */
  intake: { client: boolean; package: boolean; date: boolean; agreement: 'none' | 'proposed' | 'agreed' };
  /**
   * The semantic plane: what it is for, and the dimensions its packages leave
   * open that it has not answered. An open one carries the studio's OWN
   * question ("What occasion is it for?"), so a statement can ask it in their
   * words instead of the app's paraphrase of its name.
   */
  forValues: { id: string; name: string }[];
  forOpen: { id: string; name: string; question: string | null }[];
  /** Its dated facts as day offsets from today on the studio's clock (negative = past); the days themselves are on facts. */
  axis: { session: number | null; occasions: { label: string; offset: number }[]; reminders: number[] };
  /** The within-booking hierarchy: per package, per service, its steps in workflow order. */
  runs: { packageName: string; services: { name: string; steps: { name: string; state: StepState; who: string | null }[] }[] }[];
  /** Closed, complete but still live (ready to close), or still running. */
  close: 'done' | 'ready' | 'ahead';
  /** The one figure for how long this has been where it is, and whether it needs the operator. */
  figure: { text: string; warm: boolean; today: boolean };
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
  { key: 'classification', label: 'Classification open' },
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
  const [stageEvents, allReminders, studioDimensions] = await Promise.all([
    listEventsSince('booking', 'stage_changed', '1970-01-01'),
    // Every reminder on a booking, past and ahead: a dated obligation, warm once it is past.
    listNoteRemindersInRange('1970-01-01', addDays(today, 60) + 'T23:59:59Z'),
    listStudioDimensions(),
  ]);
  const dueReminders = allReminders.filter((n) => n.remindAt && n.remindAt <= nowIso);
  const dimensionName = new Map(studioDimensions.map((d) => [d.id, d.name] as const));
  // A dimension's own question, so an unanswered one can be asked in the studio's words.
  const dimensionAsks = new Map(studioDimensions.map((d) => [d.id, d.question ?? null] as const));
  // What each package on the book leaves open: a dimension it allows more than one value of.
  const packageIds = [...new Set(rows.flatMap((r) => r.packageIds))];
  /*
   * WHAT THE PACKAGES NARROW and WHERE THE WORK IS are asked at the same time.
   *
   * They were sequential, and neither waits on the other: one reads the
   * packages on the book, the other resolves the tasks of the live bookings.
   * On this studio's connection a round trip costs between a fifth and two
   * thirds of a second, so every await in series is another wait the operator
   * sits through. Ordering them only where one truly needs the other is most
   * of what makes a page feel like an app rather than a website.
   */
  const { resolveBookingTasks } = await import('@/modules/production/interface');
  const live = rows.filter((r) => !r.stage || r.stage.kind === 'enquiry' || r.stage.kind === 'booked');
  const [narrowings, tasksByBooking]: [Map<string, Map<string, Set<string>>>, Awaited<ReturnType<typeof resolveBookingTasks>>] = await Promise.all([
    packageIds.length > 0 ? packageNarrowingsFor(orgId, packageIds) : Promise.resolve(new Map()),
    resolveBookingTasks(orgId, live.map((r) => r.id)),
  ]);
  const agreedEvents = stageEvents.filter((e) => e.payload.kind === 'booked');
  const stageSinceOf = new Map<string, string>();
  for (const e of stageEvents) stageSinceOf.set(e.entityId, e.at);
  const remindersAll = new Map<string, string[]>();
  for (const n of allReminders) {
    if (n.aboutType !== 'booking' || !n.aboutId || !n.remindAt) continue;
    (remindersAll.get(n.aboutId) ?? remindersAll.set(n.aboutId, []).get(n.aboutId)!).push(n.remindAt);
  }
  const remindersOf = new Map<string, { count: number; earliest: string }>();
  for (const n of dueReminders) {
    if (n.aboutType !== 'booking' || !n.aboutId || !n.remindAt) continue;
    const had = remindersOf.get(n.aboutId);
    remindersOf.set(n.aboutId, { count: (had?.count ?? 0) + 1, earliest: had && had.earliest < n.remindAt ? had.earliest : n.remindAt });
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
    // Which dimensions this booking's packages leave open, unanswered - an absence on the semantic plane.
    {
      const answeredDims = new Set(r.classification.map((c) => c.dimensionId));
      const open = r.packageIds.some((pid) => [...((narrowings.get(pid) ?? new Map()) as Map<string, Set<string>>).entries()].some(([dimId, values]) => values.size > 1 && !answeredDims.has(dimId) && dimensionName.has(dimId)));
      if (!closed && open) missing.push('classification');
    }
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

    // ---- The planes this row sits on.
    const offset = (d: string) => Math.round((new Date(`${d}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
    const answered = new Set(r.classification.map((c) => c.dimensionId));
    const openDims = new Map<string, string>();
    for (const pid of r.packageIds) for (const [dimId, values] of (narrowings.get(pid) ?? new Map()) as Map<string, Set<string>>) {
      if (values.size > 1 && !answered.has(dimId) && dimensionName.has(dimId)) openDims.set(dimId, dimensionName.get(dimId)!);
    }
    // A bracket per package, a run per service, a point per step: the first open step of a run is current
    // when someone is on it and open (warm) when nobody is; the rest of the open steps are ahead.
    const byLine = new Map<string, { packageName: string; services: Map<string, { name: string; steps: { name: string; state: StepState; who: string | null }[] }> }>();
    for (const t of [...tasks].sort((a, b) => a.position - b.position)) {
      const lk = t.lineId ?? '';
      const line = byLine.get(lk) ?? { packageName: t.fromPackage ?? 'This booking', services: new Map() };
      byLine.set(lk, line);
      const sk = t.packageServiceId ?? '';
      const svc = line.services.get(sk) ?? { name: t.fromService ?? (t.lineId ? 'Package' : 'Added here'), steps: [] };
      line.services.set(sk, svc);
      svc.steps.push({ name: t.name, state: t.done ? 'done' : 'ahead', who: t.assignee?.name ?? null });
    }
    const runs = [...byLine.values()].map((l) => ({
      packageName: l.packageName,
      services: [...l.services.values()].sort((a, b) => a.name.localeCompare(b.name)).map((svc) => {
        const first = svc.steps.find((st) => st.state !== 'done');
        if (first) first.state = first.who ? 'current' : 'open';
        return svc;
      }),
    }));
    const allDone = tasks.length > 0 && tasks.every((t) => t.done);
    const held = day !== null && day < today;
    const upcomingDays = day !== null ? offset(day) : null;
    const figure = closed ? { text: '', warm: false, today: false }
      : band === 'today' ? { text: r.scheduledFor ? new Date(r.scheduledFor).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'today', warm: false, today: true }
      : held && r.stage?.kind === 'booked' ? { text: `${-upcomingDays!}d since${work ? ` · ${work.done}/${work.total}` : ''}`, warm: false, today: false }
      : upcomingDays !== null && upcomingDays > 0 ? { text: `in ${upcomingDays}d`, warm: false, today: false }
      : (!r.stage || r.stage.kind === 'enquiry') && r.proposalOut ? { text: `${Math.max(0, Math.round((Date.now() - new Date(stageSinceOf.get(r.id) ?? r.createdAt).getTime()) / 86_400_000))}d with client`, warm: false, today: false }
      : { text: `${Math.max(0, Math.round((Date.now() - new Date(stageSinceOf.get(r.id) ?? r.createdAt).getTime()) / 86_400_000))}d waiting`, warm: true, today: false };
    const planes: Planes = {
      intake: { client: Boolean(r.clientName), package: r.lineCount > 0, date: day !== null, agreement: r.hasContract && !r.proposalOut ? 'agreed' : r.proposalOut ? 'proposed' : 'none' },
      forValues: r.classification.map((c) => ({ id: c.valueId, name: c.valueName })),
      forOpen: [...openDims.entries()].map(([id, name]) => ({ id, name, question: dimensionAsks.get(id) ?? null })),
      axis: {
        session: day !== null ? offset(day) : null,
        occasions: facts.filter((f) => f.day).map((f) => ({ label: f.label, offset: offset(f.day!) })),
        reminders: (remindersAll.get(r.id) ?? []).map((iso) => offset(dayIn(iso, timezone))),
      },
      runs,
      close: closed ? 'done' : allDone && held ? 'ready' : 'ahead',
      figure,
    };
    return { ...r, band, day, work, needs, facts, stageSince: stageSinceOf.get(r.id) ?? r.createdAt, reminders, takes, planes };
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
