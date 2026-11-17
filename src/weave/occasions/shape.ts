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
