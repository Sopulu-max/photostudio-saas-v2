import { listRecentActivity } from '@/kernel/events';
import { readBookingsSheet, MISSING, type BookingsSheet, type SheetBooking, type Period, type MissingKey } from './sheet';
import { getLineConfigurationForm } from './domain';
import { getBookingTeam } from '@/modules/production/interface';

/**
 * THE BOOKINGS DASHBOARD - the day's questions about bookings, each
 * answered with the bookings themselves, decided here so the page draws.
 *
 *   What requires attention? - attention: the edges a live booking has
 *                              not yet grown - a decision, a client, a
 *                              date, a package, a crew for its session.
 *   What is today, and next? - today / week: the sessions ahead.
 *   What is in post-production? - works: booked sessions that have taken
 *                              place with steps still open, oldest first;
 *                              and those finished but not yet closed.
 *   Where is everything?     - pipeline: each stage, how many, and the fact
 *                              that matters for its kind.
 *   What changed recently?   - recent: the last events on bookings, named.
 *   How is the period going? - the sheet's figures and series (sheet.ts).
 *
 * Every widget is a reading of the same rows the day book shows, so it
 * cannot disagree with it, and every widget is a door: it says how to
 * narrow the day book to exactly its question. The conditions are the
 * ontology's - an edge not yet there, a date passed with work open; the
 * values are the studio's - its stages, its people.
 */

export type Position = { service: string; step: string; who: string | null };

export type NextRow = {
  booking: SheetBooking;
  /** The declared crew (assignments): who is coming, by role - a different fact from who is on a step. */
  crew: string[];
  /** One position per service of the booking - its first open step and who is on it - unassigned first. The within-booking hierarchy, on the row. */
  positions: Position[];
  /**
   * Questions the package asked at booking that have no answer yet - what
   * the day still needs to know. Decided by the same rule the booking form
   * uses (getLineConfigurationForm), never re-derived here; read only for
   * the sessions ahead, since that is where an unanswered question costs.
   */
  unanswered: string[];
};

export type WorkRow = {
  booking: SheetBooking;
  /** Days since the session. */
  since: number;
  /** Every open position, unassigned first. */
  open: Position[];
  done: number;
  total: number;
};

export type Attention = {
  key: MissingKey;
  label: string;
  count: number;
  /** The longest wait, or the first date - whichever the condition makes relevant. */
  note: string | null;
  sample: SheetBooking[];
  /** The day book, narrowed to exactly these. */
  narrow: Record<string, string>;
};

export type PipelineStage = {
  key: string;
  label: string;
  look: { kind: string | null; color: string | null } | null;
  kind: string | null;
  count: number;
  /** For a booked stage: sessions ahead, and in post-production. */
  ahead: number;
  inPost: number;
  /** The fact for the kind: an enquiry stage's longest-waiting booking; a booked stage's next session. */
  fact: { booking: SheetBooking; text: string } | null;
};

export type RecentRow = { id: string; at: string; who: string; phrase: string; booking: { id: string; title: string } | null };

/** One calendar: every live strand's dated facts on the studio's one axis, as day offsets from today. */
export type Calendar = {
  sessions: { booking: SheetBooking; offset: number; held: boolean; today: boolean }[];
  occasions: { booking: SheetBooking; label: string; offset: number }[];
  reminders: { booking: SheetBooking; offset: number }[];
  /** Sessions per week, three weeks back and three ahead. */
  perWeek: { from: number; count: number; ahead: boolean }[];
};

export type BookingsDashboard = {
  sheet: BookingsSheet;
  attention: Attention[];
  /** Open, unassigned step points across live strands, by the role they need - the people plane read from the other side. */
  roleTotals: { id: string; name: string; count: number }[];
  calendar: Calendar;
  today: NextRow[];
  week: NextRow[];
  /** What follows the week, shown only when the week is empty. */
  later: NextRow[];
  works: WorkRow[];
  /** Sessions held, every step done, still in a live stage. */
  toClose: SheetBooking[];
  pipeline: PipelineStage[];
  recent: RecentRow[];
};

const daysBetween = (a: string, b: string) => Math.max(0, Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export async function readBookingsDashboard(period: Period = 30): Promise<BookingsDashboard> {
  const [sheet, events] = await Promise.all([readBookingsSheet(period), listRecentActivity(6, 'booking')]);
  const rows = sheet.bands.flatMap((b) => b.rows);
  const live = rows.filter((r) => r.band !== 'closed');
  const { today } = sheet;
  const madeOn = (r: SheetBooking) => r.createdAt.slice(0, 10);
  const byCreated = (a: SheetBooking, b: SheetBooking) => a.createdAt.localeCompare(b.createdAt);
  const bySoon = (a: SheetBooking, b: SheetBooking) => (a.scheduledFor ?? '￿').localeCompare(b.scheduledFor ?? '￿');
  const positionsOf = (r: SheetBooking): Position[] =>
    (r.work?.positions ?? []).filter((p) => !p.done && p.step).map((p) => ({ service: p.service, step: p.step!, who: p.who }));
  const sayDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  // ---- What requires attention: each absence, on the live bookings that have it.
  /* Each absence orders its rows by what makes it urgent, and says so in its note. */
  const attention: Attention[] = MISSING.map((m) => {
    const have = live.filter((r) => (r.takes.missing ?? []).includes(m.key));
    const ordered =
      m.key === 'crew' ? [...have].sort(bySoon)
      : m.key === 'lapsed' ? [...have].sort(bySoon)
      : m.key === 'reminder' ? [...have].sort((a, b) => a.reminders!.earliest.localeCompare(b.reminders!.earliest))
      : [...have].sort(byCreated);
    const first = ordered[0];
    const note = !first ? null
      : m.key === 'crew' ? (first.scheduledFor ? `first ${sayDate(first.scheduledFor)}` : null)
      : m.key === 'lapsed' ? `longest ${plural(daysBetween(first.day!, today), 'day')} since the date`
      : m.key === 'reminder' ? `earliest ${sayDate(first.reminders!.earliest)}`
      : `longest ${plural(daysBetween(madeOn(first), today), 'day')}`;
    return { key: m.key, label: m.label, count: have.length, note, sample: ordered.slice(0, 3), narrow: { missing: m.key } };
  });

  // ---- Today, the rest of the week, and what follows when the week is empty.
  const ahead = live.filter((r) => r.band === 'today' || r.band === 'tomorrow' || r.band === 'week').sort(bySoon);
  const shownAhead = ahead.length > 0
    ? [...ahead.filter((r) => r.band === 'today'), ...ahead.filter((r) => r.band !== 'today').slice(0, 6)]
    : live.filter((r) => r.band === 'later').sort(bySoon).slice(0, 6);
  const unansweredOf = new Map<string, string[]>();
  await Promise.all(shownAhead.map(async (r) => {
    const forms = await Promise.all(r.lineIds.map((id) => getLineConfigurationForm(id).catch(() => [] as any[])));
    unansweredOf.set(r.id, forms.flat().filter((x: any) => x.asked && (x.value === null || x.value === undefined || x.value === '')).map((x: any) => x.label as string));
  }));
  // The declared crew, for the sessions ahead: the fact a session row needs that the steps do not carry.
  const crewOf = new Map<string, string[]>();
  await Promise.all(shownAhead.map(async (r) => {
    const team = await getBookingTeam(r.id).catch(() => null);
    crewOf.set(r.id, (team?.roles ?? []).flatMap((role: any) => (role.covering ?? []).map((p: any) => `${p.name} (${role.roleName ?? 'no role'})`)));
  }));
  const next = (r: SheetBooking): NextRow => ({
    booking: r,
    crew: crewOf.get(r.id) ?? [],
    positions: positionsOf(r).sort((a, b) => Number(Boolean(a.who)) - Number(Boolean(b.who))),
    unanswered: unansweredOf.get(r.id) ?? [],
  });
  const todayRows = shownAhead.filter((r) => r.band === 'today').map(next);
  const weekRows = ahead.length > 0 ? shownAhead.filter((r) => r.band !== 'today').map(next) : [];
  const laterRows = ahead.length === 0 ? shownAhead.map(next) : [];

  // ---- In post-production: booked, session held, steps open - oldest session first; and those done but not closed.
  const held = live.filter((r) => r.stage?.kind === 'booked' && r.day !== null && r.day < today);
  const works: WorkRow[] = held
    .filter((r) => r.work && r.work.done < r.work.total)
    .sort((a, b) => (a.day! < b.day! ? -1 : a.day! > b.day! ? 1 : 0))
    .map((r) => ({
      booking: r, since: daysBetween(r.day!, today),
      open: positionsOf(r).sort((a, b) => Number(Boolean(a.who)) - Number(Boolean(b.who))),
      done: r.work!.done, total: r.work!.total,
    }));
  const toClose = held.filter((r) => r.work && r.work.total > 0 && r.work.done === r.work.total);

  // ---- Where everything is: the studio's stages, with the fact that matters for each kind.
  const pipeline: PipelineStage[] = sheet.byStage.map((st) => {
    const inStage = rows.filter((r) => (r.stage?.id ?? '') === st.key);
    const kind = st.look?.kind ?? null;
    const dated = inStage.filter((r) => r.day !== null && r.day >= today).sort(bySoon);
    const past = inStage.filter((r) => r.day !== null && r.day < today);
    // Time in stage is read from the stage_changed history, not from when the booking was made.
    const longest = [...inStage].sort((a, b) => a.stageSince.localeCompare(b.stageSince))[0];
    const fact = kind === 'booked' && dated[0]
      ? { booking: dated[0], text: `next session ${dated[0].band === 'today' ? 'today' : dated[0].band === 'tomorrow' ? 'tomorrow' : sayDate(dated[0].scheduledFor!)}` }
      : (kind === 'enquiry' || kind === null) && longest
        ? { booking: longest, text: `longest in stage, ${plural(daysBetween(longest.stageSince.slice(0, 10), today), 'day')}` }
        : null;
    return { key: st.key, label: st.label, look: st.look, kind, count: st.count, ahead: dated.length, inPost: kind === 'booked' ? past.length : 0, fact };
  });

  // ---- What changed recently, with the booking named where it still exists.
  const titleOf = new Map(rows.map((r) => [r.id, r.title] as const));
  const recent: RecentRow[] = events.map((e) => ({
    id: e.id, at: e.at, who: e.who, phrase: e.phrase,
    booking: titleOf.has(e.entityId) ? { id: e.entityId, title: titleOf.get(e.entityId)! } : null,
  }));

  // ---- The people plane, read from the other side: open unassigned points by role.
  const roleCount = new Map<string, { id: string; name: string; count: number }>();
  for (const r of live) for (const n of r.needs) {
    const had = roleCount.get(n.id) ?? { id: n.id, name: n.name, count: 0 };
    had.count += 1; roleCount.set(n.id, had);
  }
  const roleTotals = [...roleCount.values()].sort((a, b) => b.count - a.count);

  // ---- One calendar: every live strand's dated facts within ±30 days of today.
  const within30 = (o: number) => o >= -30 && o <= 30;
  const calendar: Calendar = {
    sessions: live.filter((r) => r.strand.axis.session !== null && within30(r.strand.axis.session!)).sort((a, b) => a.strand.axis.session! - b.strand.axis.session!)
      .map((r) => ({ booking: r, offset: r.strand.axis.session!, held: r.strand.axis.session! < 0, today: r.strand.axis.session === 0 })),
    occasions: live.flatMap((r) => r.strand.axis.occasions.filter((o) => within30(o.offset)).map((o) => ({ booking: r, label: o.label, offset: o.offset }))),
    reminders: live.flatMap((r) => r.strand.axis.reminders.filter(within30).map((offset) => ({ booking: r, offset }))),
    perWeek: [-21, -14, -7, 0, 7, 14].map((from) => ({
      from, ahead: from >= 0,
      count: live.filter((r) => r.strand.axis.session !== null && r.strand.axis.session! >= from && r.strand.axis.session! < from + 7).length,
    })),
  };

  return { sheet, attention, roleTotals, calendar, today: todayRows, week: weekRows, later: laterRows, works, toClose, pipeline, recent };
}
