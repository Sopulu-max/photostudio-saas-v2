/**
 * The month a studio holds in its head.
 *
 * A calendar here is a SECOND READING of dates that already exist, not a
 * thing of its own. Nothing is stored for its sake; a day with nothing on it
 * is a day nothing points at.
 */

/**
 * What kind of engagement a line is.
 *
 * NOT A COLUMN ANYWHERE, and it never becomes one. These say which table a
 * date was read out of so the calendar can name it and link it — a
 * presentation discriminator. A stored `kind` has to be earned by the engine
 * doing something distinct, and nothing here does.
 */
export type Kind =
  | 'shoot'       // the studio works
  | 'occasion'    // the wedding itself, when that is not the day worked
  | 'asked'       // a day somebody has asked for and nobody has answered
  | 'selects'     // a client's choosing due
  | 'submission'  // a collaborator's hand-in due
  | 'closes'      // a gallery link closing
  | 'code'        // a discount expiring
  | 'follow-up';  // a message owed

export type Entry = {
  kind: Kind;
  /** The day it falls on. */
  on: string;
  /** A bare clock time — "14:00:00" — or null when the hour is not settled. */
  at: string | null;
  /** The studio's own words, shown exactly as typed. */
  what: string;
  who: string | null;
  crew: string[];
  href: string;
};

/**
 * What a line is, in a word.
 *
 * The trade's words, and the data model's own where it has one. Nothing here
 * addresses whoever is reading it.
 */
export function sayKind(kind: Kind): string {
  switch (kind) {
    case 'shoot': return 'Shoot';
    case 'occasion': return 'Occasion';
    case 'asked': return 'Asked for';
    case 'selects': return 'Selects due';
    case 'submission': return 'Submission due';
    case 'closes': return 'Gallery closes';
    case 'code': return 'Code expires';
    case 'follow-up': return 'Follow-up due';
  }
}

/**
 * The days of a month, padded to whole weeks starting Monday.
 *
 * The tail of the previous month and the head of the next come with it: a
 * grid that stopped at the first and the thirty-first would show blank cells
 * on days that have work on them.
 */
export function weeksOf(year: number, month: number): string[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;

  const cursor = new Date(first);
  cursor.setUTCDate(1 - lead);

  const weeks: string[][] = [];
  for (let w = 0; w < 6; w += 1) {
    const week: string[] = [];
    for (let d = 0; d < 7; d += 1) {
      week.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
    /* Stop once the month is behind: a sixth row of next month is padding. */
    if (cursor.getUTCMonth() !== month && cursor > first) break;
  }
  return weeks;
}

/**
 * Somebody in two places on one day.
 *
 * NOT CALLED A CLASH, deliberately. A clash used to be computable: an
 * occasion carried a start AND an end, so two spans could be compared and a
 * real overlap found. A booking carries one time now, so the most that can be
 * said honestly is that the same person is on two bookings the same day —
 * which, for a studio shooting a morning christening and an evening party, is
 * perfectly ordinary. It is stated as the fact it is and left for a studio to
 * judge. An alarm that cries wolf is worse than silence.
 */
export type Doubled = { name: string; on: string; count: number };

export function doubledIn(entries: Entry[]): Doubled[] {
  const tally = new Map<string, Doubled>();
  for (const entry of entries) {
    if (entry.kind !== 'shoot') continue;
    for (const name of entry.crew) {
      const key = `${entry.on}|${name}`;
      const seen = tally.get(key);
      if (seen) seen.count += 1;
      else tally.set(key, { name, on: entry.on, count: 1 });
    }
  }
  return [...tally.values()].filter((d) => d.count > 1);
}

/** Said only when there is something to say. Silence is the good case. */
export function sayDoubled(doubled: Doubled[]): string | null {
  if (doubled.length === 0) return null;
  const people = [...new Set(doubled.map((d) => d.name))];
  if (people.length === 1) {
    return `${people[0]} is on ${doubled[0].count} shoots in one day.`;
  }
  return `${people.slice(0, -1).join(', ')} and ${people[people.length - 1]} `
    + 'are each on more than one shoot in a day.';
}

/* ---- Views --------------------------------------------------------------- */
/*
 * Three ways of looking at the same dates. Not three sets of data: every view
 * asks `theCalendar` for a range and draws what comes back, so a line cannot
 * appear in one and be missing from another.
 */
export type View = 'month' | 'week' | 'day';

export function isView(v: string | undefined): v is View {
  return v === 'month' || v === 'week' || v === 'day';
}

/** The Monday of the week a day falls in. */
function mondayOf(day: string): Date {
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d;
}

const asDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * What a view has to ask for.
 *
 * The month reaches past its own edges on purpose: the grid shows the tail of
 * the previous month and the head of the next, and a range stopping at the
 * first and the thirty-first would leave work missing from cells that are on
 * the screen.
 */
export function rangeOf(view: View, anchor: string): { from: string; to: string } {
  if (view === 'day') return { from: anchor, to: anchor };

  if (view === 'week') {
    const start = mondayOf(anchor);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { from: asDay(start), to: asDay(end) };
  }

  const d = new Date(`${anchor}T00:00:00Z`);
  const weeks = weeksOf(d.getUTCFullYear(), d.getUTCMonth());
  return { from: weeks[0][0], to: weeks[weeks.length - 1][6] };
}

/** The same view, a step earlier or later. */
export function step(view: View, anchor: string, by: number): string {
  const d = new Date(`${anchor}T00:00:00Z`);
  if (view === 'day') d.setUTCDate(d.getUTCDate() + by);
  else if (view === 'week') d.setUTCDate(d.getUTCDate() + by * 7);
  else d.setUTCMonth(d.getUTCMonth() + by, 1);
  return asDay(d);
}

/**
 * What the page is called, in the words a studio would use for the span.
 *
 * A month is named; a week is said as the days it runs between, because
 * "week 50" is a number nobody thinks in; a day is the day.
 */
export function titleOf(view: View, anchor: string): string {
  const d = new Date(`${anchor}T00:00:00Z`);

  if (view === 'month') {
    return d.toLocaleDateString('en-GB', {
      month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  }

  if (view === 'day') {
    return d.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  }

  const { from, to } = rangeOf('week', anchor);
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  const short = (x: Date, withMonth: boolean) => x.toLocaleDateString('en-GB', {
    day: 'numeric', ...(withMonth ? { month: 'long' } : {}), timeZone: 'UTC',
  });
  const year = b.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'UTC' });
  return `${short(a, !sameMonth)} – ${short(b, true)} ${year}`;
}

/**
 * What a span holds, said as a statement.
 *
 * It does NOT name the span. The title says which month, week or day this is,
 * directly above — repeating it read "1 shoot in Sunday, 13 December 2026",
 * which is both redundant and ungrammatical, since a day takes "on" and a
 * month takes "in" and one sentence cannot do both.
 *
 * Shoots lead because they are the work; everything else is what the work
 * owes.
 */
export function saySpan(entries: Entry[]): string {
  if (entries.length === 0) return 'Nothing on.';

  const shoots = entries.filter((e) => e.kind === 'shoot').length;
  const rest = entries.length - shoots;

  if (shoots === 0) {
    return `${rest} ${rest === 1 ? 'thing' : 'things'} due, no shoots.`;
  }
  const said = `${shoots} ${shoots === 1 ? 'shoot' : 'shoots'}`;
  if (rest === 0) return `${said}.`;
  return `${said}, ${rest} ${rest === 1 ? 'other thing' : 'other things'} due.`;
}

/** The days a span covers, inclusive. */
export function daysOf(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
