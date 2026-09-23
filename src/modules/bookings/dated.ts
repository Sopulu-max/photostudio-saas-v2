import { sayDatedSession, sayDatedOccasion, plural, type Say } from './say';
import type { SheetBooking } from './sheet';

/**
 * WHEN EVERYTHING IS - derived from rows, asking nothing.
 *
 * The dated readings the calendar needs are functions of rows the page already
 * holds: which day each session falls on, which day each date-kind answer
 * falls on, and how the days group into weeks. Nothing here is a query.
 *
 * It used to come from readBookingsDashboard, which meant the page paid for
 * that entire read - the absences, the pipeline, the period, the trace, and two
 * reads that ran once per booking - to obtain the one part of it the views
 * actually use. On a connection where a single round trip costs the better part
 * of a second, that is most of the wait.
 *
 * Pure, so the server can derive it for the first paint and the browser can
 * re-derive it the instant the cut changes.
 */

export type DayColumn = {
  day: string;
  /** Who is shot that day, by name - printed, never hovered for. */
  sessions: string[];
  occasions: string[];
  today: boolean;
  behind: boolean;
};

export type DatedDay = {
  day: string;
  today: boolean;
  lines: { bookingId: string; say: Say }[];
};

export type Dated = {
  columns: DayColumn[];
  weeks: { from: string; label: string; count: number }[];
  days: DatedDay[];
  /** Live bookings with no session date: they fall on no day, which is the fact. */
  undated: number;
  /** Sessions dated from today onwards, within the window. */
  ahead: number;
};

const SPAN = 30;
const dayAt = (today: string, offset: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const offsetOf = (today: string, day: string) =>
  Math.round((new Date(`${day}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
const weekLabel = (from: string) =>
  new Date(`${from}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function datedFrom(rows: SheetBooking[], today: string): Dated {
  const live = rows.filter((r) => r.band !== 'closed');
  const nameOf = (r: SheetBooking) => r.clientName ?? r.title;
  const within = (day: string) => Math.abs(offsetOf(today, day)) <= SPAN;

  const sessionsOn = new Map<string, string[]>();
  const occasionsOn = new Map<string, string[]>();
  const lines = new Map<string, { bookingId: string; say: Say }[]>();
  const add = <T>(m: Map<string, T[]>, key: string, value: T) => (m.get(key) ?? m.set(key, []).get(key)!).push(value);

  for (const r of live) {
    if (r.day && within(r.day)) {
      add(sessionsOn, r.day, nameOf(r));
      add(lines, r.day, { bookingId: r.id, say: sayDatedSession(r, today) });
    }
    // A date-kind answer is the occasion the booking is for - a different date from the session.
    for (const f of r.facts) {
      if (f.kind !== 'date' || !f.day || !within(f.day)) continue;
      add(occasionsOn, f.day, `${f.label} on ${nameOf(r)}`);
      if (r.day !== f.day) add(lines, f.day, { bookingId: r.id, say: sayDatedOccasion(r, f.label, f.day, today) });
    }
  }

  const columns: DayColumn[] = Array.from({ length: SPAN * 2 + 1 }, (_, i) => {
    const day = dayAt(today, i - SPAN);
    return {
      day,
      sessions: sessionsOn.get(day) ?? [],
      occasions: occasionsOn.get(day) ?? [],
      today: day === today,
      behind: day < today,
    };
  });

  const weeks = [-28, -21, -14, -7, 0, 7, 14, 21].map((from) => {
    const start = dayAt(today, from);
    const end = dayAt(today, from + 7);
    return {
      from: start,
      label: from === 0 ? `this week, from ${weekLabel(start)}` : weekLabel(start),
      count: live.filter((r) => r.day !== null && r.day >= start && r.day < end).length,
    };
  });

  return {
    columns,
    weeks,
    days: [...lines.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([day, on]) => ({ day, today: day === today, lines: on })),
    undated: live.filter((r) => r.day === null).length,
    ahead: live.filter((r) => r.day !== null && r.day >= today && within(r.day)).length,
  };
}

/** Said for the strip's own caption: this week's load, and the quiet that follows. */
export function sayLoad(dated: Dated, today: string) {
  const thisWeek = dated.weeks.find((w) => w.label.startsWith('this week'))?.count ?? 0;
  const quiet = dated.weeks.filter((w) => w.from > today && w.count === 0).length;
  return quiet > 0
    ? `${thisWeek} this week, none in ${plural(quiet, 'week')} after`
    : `${thisWeek} this week`;
}
