/**
 * What an occasion is, and how it stands.
 *
 * There is no status column. Where an occasion stands is DERIVED from its date
 * and whether it has happened, so the fact has exactly one home and cannot
 * drift from itself. The previous system carried thirteen status columns and
 * enforced the transitions of one.
 */

export type Occasion = {
  id: string;
  jobId: string | null;
  what: string | null;
  onDate: string;
  startsAt: string | null;
  endsAt: string | null;
  happenedAt: string | null;
  /** Who it is for. Null for something that belongs to no job — a day off. */
  clientName: string | null;
  crew: { id: string; personId: string; name: string }[];
};

export type Standing = 'done' | 'today' | 'ahead' | 'unmarked';

/**
 * `unmarked` is the one that earns its place: a date that has passed with
 * nothing recorded against it. It is not "overdue" — the shoot almost
 * certainly happened — it is the studio not having said so, and that is the
 * thing somebody has to act on.
 */
export function standingOf(o: Occasion, today: string): Standing {
  if (o.happenedAt) return 'done';
  if (o.onDate === today) return 'today';
  return o.onDate > today ? 'ahead' : 'unmarked';
}

/** How an occasion says itself. No labels: the sentence carries its own key. */
export function sayWhen(o: Occasion): string {
  const day = new Date(o.onDate + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  if (!o.startsAt) return day;
  const trim = (t: string) => t.slice(0, 5);
  return o.endsAt ? `${day}, ${trim(o.startsAt)}–${trim(o.endsAt)}` : `${day}, ${trim(o.startsAt)}`;
}

export function sayCrew(o: Occasion): string {
  if (o.crew.length === 0) return 'Nobody on it';
  return o.crew.map((c) => c.name).join(', ');
}

/**
 * Two things one person cannot both be at.
 *
 * Only a SHARED PERSON counts. Two occasions at the same hour with different
 * crews is a studio having a good day, and flagging it would teach an
 * operator to ignore the flag — which is worse than not having one. Where
 * nobody is assigned to either, nothing is claimed: an empty crew is a fact
 * not yet recorded, not a promise that nobody is going.
 */
export type Clash = { a: string; b: string; who: string };

function overlaps(a: Occasion, b: Occasion): boolean {
  if (a.onDate !== b.onDate) return false;
  // A day with no times is the whole day, so it collides with anything on it.
  if (!a.startsAt || !b.startsAt) return true;
  const end = (o: Occasion) => o.endsAt ?? '23:59:59';
  return a.startsAt < end(b) && b.startsAt < end(a);
}

export function clashesIn(occasions: Occasion[]): Clash[] {
  const found: Clash[] = [];
  for (let i = 0; i < occasions.length; i += 1) {
    for (let j = i + 1; j < occasions.length; j += 1) {
      const a = occasions[i];
      const b = occasions[j];
      if (!overlaps(a, b)) continue;
      for (const one of a.crew) {
        if (b.crew.some((other) => other.personId === one.personId)) {
          found.push({ a: a.id, b: b.id, who: one.name });
        }
      }
    }
  }
  return found;
}

/** Said as the problem it is, not as a count of collisions. */
export function sayClashes(clashes: Clash[]): string | null {
  if (clashes.length === 0) return null;
  const people = [...new Set(clashes.map((c) => c.who))];
  if (people.length === 1) return `${people[0]} is booked twice at once.`;
  return `${people.slice(0, -1).join(', ')} and ${people[people.length - 1]} are each booked twice at once.`;
}

/** The days of a month, padded to whole weeks starting Monday. */
export function weeksOf(year: number, month: number): string[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(1 - lead);

  const weeks: string[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w += 1) {
    const week: string[] = [];
    for (let d = 0; d < 7; d += 1) {
      week.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
    // A month never needs a sixth week it does not reach into.
    if (cursor.getUTCMonth() !== month && cursor > new Date(Date.UTC(year, month + 1, 0))) break;
  }
  return weeks;
}
