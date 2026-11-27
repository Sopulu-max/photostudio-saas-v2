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

/**
 * What the month holds, said as a statement.
 *
 * Counts the work, not the days: a studio asks how much is on in December,
 * never how many days in December have something on them. Shoots lead because
 * they are the work; everything else is what the work owes.
 */
export function sayMonth(entries: Entry[], named: string): string {
  if (entries.length === 0) return `Nothing on in ${named}.`;

  const shoots = entries.filter((e) => e.kind === 'shoot').length;
  const rest = entries.length - shoots;

  if (shoots === 0) {
    return `${rest} ${rest === 1 ? 'thing' : 'things'} due in ${named}, no shoots.`;
  }
  const said = `${shoots} ${shoots === 1 ? 'shoot' : 'shoots'} in ${named}`;
  if (rest === 0) return `${said}.`;
  return `${said}, ${rest} ${rest === 1 ? 'other thing' : 'other things'} due.`;
}
