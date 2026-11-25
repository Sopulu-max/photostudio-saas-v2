/**
 * The studio, read back to itself.
 *
 * Not a page of counters. Every line here is an answer to a question a
 * studio actually asks, and every answer is a door to the thing it is about.
 *
 * ABSENCES, NOT THRESHOLDS. Nothing here is "more than five" or "older than
 * a week" — invented conditions that mean nothing to anybody and have to be
 * explained. What a studio needs told is what is MISSING: a shoot with
 * nobody on it, a job agreed and never put in the diary, work shot and never
 * handed over. Those are facts about the business, not settings.
 *
 * And a reading announces itself. No label beside a number, no key. If a
 * line needs explaining it is not a reading.
 */

export type TodayShoot = {
  id: string;
  jobId: string;
  what: string | null;
  clientName: string | null;
  /** A bare clock time — "14:00:00" — not a timestamp. */
  startsAt: string | null;
  endsAt: string | null;
  crew: string[];
};

export type UnansweredRequest = {
  id: string;
  clientName: string | null;
  wants: string | null;
  requestedAt: string;
};

export type NotInTheDiary = {
  id: string;
  clientName: string | null;
  wants: string | null;
  acceptedAt: string;
};

export type NotHandedOver = {
  jobId: string;
  clientName: string | null;
  galleryId: string | null;
  galleryName: string | null;
  happenedAt: string;
};

export type ShortOfPromise = {
  galleryId: string;
  jobId: string | null;
  name: string;
  have: number;
  promised: number;
};

export type NotSent = {
  id: string;
  clientName: string | null;
  paidAt: string;
};

export type Dashboard = {
  today: TodayShoot[];
  unanswered: UnansweredRequest[];
  notInTheDiary: NotInTheDiary[];
  notHandedOver: NotHandedOver[];
  shortOfPromise: ShortOfPromise[];
  notSent: NotSent[];
};

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Whole days between two dates, by calendar day rather than by hours. */
export function daysSince(iso: string, today: Date): number {
  const then = new Date(iso);
  const a = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  const b = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * How long something has been outstanding, as a duration.
 *
 * A figure, not a narration. "Since Tuesday" is useless by the following
 * week and "4320 minutes" is useless always.
 */
export function sayWaiting(iso: string, today: Date): string {
  const days = daysSince(iso, today);
  if (days === 0) return 'Today';
  return count(days, 'day', 'days');
}

/*
 * TERSE. No full stops, no second clause, no connective tissue.
 *
 * A sentence with a full stop is prose, and six of them stacked up is a
 * report ABOUT the studio rather than the studio itself. An app states a
 * thing and gets out of the way; the detail belongs on the rows underneath,
 * where it sits beside the row it is true of.
 */
/**
 * When a shoot starts, and finishes if that is known.
 *
 * `occasions.starts_at` is `time without time zone` — the string "14:00:00",
 * with no date and no zone. Handing that to `new Date()` produces Invalid
 * Date, which is what this page showed until somebody looked at it. Sliced,
 * the way the calendar has always done it.
 */
export function sayStart(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return 'No time set';
  const clock = (t: string) => t.slice(0, 5);
  return endsAt ? `${clock(startsAt)}–${clock(endsAt)}` : clock(startsAt);
}

export function sayToday(shoots: TodayShoot[]): string {
  if (shoots.length === 0) return 'No shoots today';
  const bare = shoots.filter((s) => s.crew.length === 0).length;
  if (bare === 0) return `${count(shoots.length, 'shoot', 'shoots')} today`;
  return `${count(shoots.length, 'shoot', 'shoots')} today, ${bare} without crew`;
}

export function sayUnanswered(rows: UnansweredRequest[]): string {
  if (rows.length === 0) return 'No unanswered requests';
  return `${count(rows.length, 'unanswered request', 'unanswered requests')}`;
}

export function sayNotInTheDiary(rows: NotInTheDiary[]): string {
  if (rows.length === 0) return 'Every agreed job scheduled';
  return `${count(rows.length, 'job', 'jobs')} without a shoot`;
}

export function sayNotHandedOver(rows: NotHandedOver[]): string {
  if (rows.length === 0) return 'Every completed shoot delivered';
  return `${count(rows.length, 'shoot', 'shoots')} undelivered`;
}

export function sayShortOfPromise(rows: ShortOfPromise[]): string {
  if (rows.length === 0) return 'Every gallery meets its count';
  const owed = rows.reduce((n, r) => n + (r.promised - r.have), 0);
  return `${count(rows.length, 'gallery', 'galleries')} short by ${owed}`;
}

export function sayNotSent(rows: NotSent[]): string {
  if (rows.length === 0) return 'Nothing paid awaiting despatch';
  return `${count(rows.length, 'order', 'orders')} not despatched`;
}

/** How many things are somebody's move. Today's shoots are the day, not a backlog. */
export function outstanding(d: Dashboard): number {
  return d.unanswered.length + d.notInTheDiary.length
    + d.notHandedOver.length + d.shortOfPromise.length + d.notSent.length;
}

/**
 * The line under the title.
 *
 * A figure and a noun. No exhortation, and nothing addressed to whoever is
 * reading it.
 */
export function sayStanding(d: Dashboard): string {
  const n = outstanding(d);
  const today = sayToday(d.today).toLowerCase();
  return n === 0 ? `Nothing outstanding, ${today}` : `${count(n, 'item', 'items')} outstanding, ${today}`;
}
