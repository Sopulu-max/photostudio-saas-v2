import { listRecentActivity } from '@/kernel/events';
import { readBookingsSheet, MISSING, type BookingsSheet, type SheetBooking, type Period, type MissingKey } from './sheet';

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
  /** The first unassigned step if any, else the first open one - what the session needs, or where it is. */
  position: Position | null;
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

export type BookingsDashboard = {
  sheet: BookingsSheet;
  attention: Attention[];
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
  const [sheet, events] = await Promise.all([readBookingsSheet(period), listRecentActivity(8, 'booking')]);
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
  const attention: Attention[] = MISSING.map((m) => {
    const have = live.filter((r) => (r.takes.missing ?? []).includes(m.key));
    const ordered = m.key === 'crew' ? [...have].sort(bySoon) : [...have].sort(byCreated);
    const note = ordered.length === 0 ? null
      : m.key === 'crew' ? (ordered[0].scheduledFor ? `first ${sayDate(ordered[0].scheduledFor)}` : null)
      : `longest ${plural(daysBetween(madeOn(ordered[0]), today), 'day')}`;
    return { key: m.key, label: m.label, count: have.length, note, sample: ordered.slice(0, 3), narrow: { missing: m.key } };
  });

  // ---- Today, the rest of the week, and what follows when the week is empty.
  const next = (r: SheetBooking): NextRow => {
    const open = positionsOf(r);
    return { booking: r, position: open.find((p) => !p.who) ?? open[0] ?? null };
  };
  const ahead = live.filter((r) => r.band === 'today' || r.band === 'tomorrow' || r.band === 'week').sort(bySoon);
  const todayRows = ahead.filter((r) => r.band === 'today').map(next);
  const weekRows = ahead.filter((r) => r.band !== 'today').slice(0, 6).map(next);
  const laterRows = ahead.length === 0 ? live.filter((r) => r.band === 'later').sort(bySoon).slice(0, 6).map(next) : [];

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
    const oldest = [...inStage].sort(byCreated)[0];
    const fact = kind === 'booked' && dated[0]
      ? { booking: dated[0], text: `next session ${dated[0].band === 'today' ? 'today' : dated[0].band === 'tomorrow' ? 'tomorrow' : sayDate(dated[0].scheduledFor!)}` }
      : (kind === 'enquiry' || kind === null) && oldest
        ? { booking: oldest, text: `longest waiting, ${plural(daysBetween(madeOn(oldest), today), 'day')}` }
        : null;
    return { key: st.key, label: st.label, look: st.look, kind, count: st.count, ahead: dated.length, inPost: kind === 'booked' ? past.length : 0, fact };
  });

  // ---- What changed recently, with the booking named where it still exists.
  const titleOf = new Map(rows.map((r) => [r.id, r.title] as const));
  const recent: RecentRow[] = events.map((e) => ({
    id: e.id, at: e.at, who: e.who, phrase: e.phrase,
    booking: titleOf.has(e.entityId) ? { id: e.entityId, title: titleOf.get(e.entityId)! } : null,
  }));

  return { sheet, attention, today: todayRows, week: weekRows, later: laterRows, works, toClose, pipeline, recent };
}
