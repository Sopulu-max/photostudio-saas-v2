/**
 * What a booking is, and what the board's columns are.
 *
 * Kept apart from the actions because a `'use server'` module may only export
 * async functions — constants and types have to live where both the server and
 * the browser can read them.
 */

/**
 * Whose move it is. These four are ENGINE KINDS, not studio vocabulary: they
 * are the distinct things this system behaves differently about, which is the
 * only thing that earns a fixed value. A studio naming its own stages on top of
 * them comes later, and each named stage will point at one of these.
 */
export type Turn = 'us' | 'them' | 'scheduled' | 'done';

export const MAX_PACKAGE_QUANTITY = 2_147_483_647;

export type PackageQuantity = { packageId: string; quantity: number };

export type BookingPackage = {
  position: number;
  packageId: string | null;
  name: string;
  quantity: number;
  unitMinor: number | null;
  currency: string;
};

export const COLUMNS: { turn: Turn; heading: string; absent: string }[] = [
  { turn: 'us', heading: 'Action needed', absent: 'No action needed.' },
  { turn: 'them', heading: 'Awaiting client', absent: 'Nothing awaiting a client.' },
  { turn: 'scheduled', heading: 'Scheduled', absent: 'Nothing scheduled.' },
  { turn: 'done', heading: 'Complete', absent: 'Nothing completed.' },
];

/**
 * A booking on the board.
 *
 * The date is the booking's own again. It was a column, then it was the
 * nearest of its occasions' dates, and `weave.occasions` was removed because a
 * thing that happens is a property of the work rather than an entity beside
 * it. So: a column, and exactly one of them.
 *
 * Null is a real state, not a gap — agreed, day not settled.
 */
export type BookingCard = {
  id: string;
  wants: string | null;
  clientName: string | null;
  turn: Turn;
  /** What it is for, in the studio's own words. Shown exactly as typed. */
  occasion: string | null;
  /** The day the occasion falls on, which is not always the day worked. */
  occasionOn: string | null;
  on: string | null;
  /** A bare clock time — "14:00:00" — with no date and no zone. */
  at: string | null;
};

/**
 * When a booking happens, said as a statement.
 *
 * An absent day is stated rather than left as a gap: a blank where a date
 * belongs reads as a broken page, and "No date set" is something a studio can
 * do something about. A day with no hour is a day, which is a real answer.
 *
 * The clock time is SLICED, never parsed. `at` is `time without time zone` —
 * the string "14:00:00" — and handing that to `new Date()` gives Invalid Date,
 * which is a bug this project has already shipped once.
 */
export function sayWhen(on: string | null, at: string | null): string {
  if (!on) return 'No date set';
  const day = new Date(`${on}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
  return at ? `${day}, ${at.slice(0, 5)}` : day;
}

export type Board = { turn: Turn; heading: string; absent: string; bookings: BookingCard[] }[];

/**
 * Work that has arrived from outside and not been answered.
 *
 * The same row as a booking — a request IS a booking nobody has agreed to — read
 * differently, because the act it invites is different. A booking is moved along;
 * a request is taken or refused.
 */
export type Request = {
  id: string;
  wants: string | null;
  /** The date they asked for. Not a schedule — nothing is in the diary yet. */
  askedFor: string | null;
  askedBy: string | null;
  askedByEmail: string | null;
  requestedAt: string;
  /** Where the asker reads the answer. The studio sends them here. */
  token: string | null;
};

/**
 * A request, read by the person who made it.
 *
 * The only shape in this system written for somebody who does not work at the
 * studio and has no account. It says what they asked, and what came back.
 */
export type RequestAsAsked = {
  studioName: string;
  studioSlug: string;
  wants: string | null;
  askedFor: string | null;
  requestedAt: string;
  answer: 'waiting' | 'taken' | 'turned away';
  answeredAt: string | null;
  answeredWith: string | null;
};

/**
 * A request that has been answered — taken on, or turned away.
 *
 * Kept and read rather than cleared away: what a studio declined, and why, is
 * a thing it has every reason to look back on, and the ones it took are the
 * record of where its work comes from.
 */
export type AnsweredRequest = Request & {
  answer: 'taken' | 'turned away';
  answeredAt: string;
  because: string | null;
};

/** What a studio shows the world at its own address. */
export type StudioFront = {
  studioId: string;
  name: string;
  slug: string;
};

/**
 * Said plainly, because a count beside a label is not a reading.
 * Nothing waiting is worth saying too — silence reads as a broken page.
 */
export function sayRequests(waiting: Request[]): string {
  if (waiting.length === 0) return 'No pending requests.';
  if (waiting.length === 1) return '1 request awaiting a response.';
  return `${waiting.length} requests awaiting a response.`;
}

/**
 * What a booking is for, and when the occasion itself is.
 *
 * Said only when the two days differ. A studio that shoots a wedding on the
 * day of the wedding does not need to be told twice, and a reading that
 * repeats what is already on the line beside it informs nobody.
 */
export function sayOccasion(
  occasion: string | null, occasionOn: string | null, on: string | null,
): string | null {
  if (!occasion && !occasionOn) return null;
  const day = occasionOn && occasionOn !== on
    ? new Date(`${occasionOn}T00:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
    : null;

  /* The studio's own word, never re-cased and never truncated. */
  if (occasion && day) return `${occasion}, ${day}`;
  if (occasion) return occasion;
  return day;
}

/**
 * What the studio holds, said as a statement.
 *
 * Leads with the absence when there is one. A booking agreed and never given
 * a day is the thing somebody can act on this minute; the next date is only
 * reassurance, and a count on its own is not a reading at all.
 */
export function sayHeld(ahead: BookingCard[], before: number): string {
  if (ahead.length === 0 && before === 0) return 'No bookings.';
  if (ahead.length === 0) {
    return `Nothing ahead, ${before} ${before === 1 ? 'booking' : 'bookings'} behind.`;
  }

  const held = `${ahead.length} ${ahead.length === 1 ? 'booking' : 'bookings'} ahead`;
  const loose = ahead.filter((b) => b.on === null).length;
  if (loose > 0) return `${held}, ${loose} without a date.`;

  const next = ahead.find((b) => b.on !== null)?.on;
  if (!next) return `${held}.`;
  const when = new Date(`${next}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long',
  });
  return `${held}, next on ${when}.`;
}

/** Earlier work, said only when there is some. */
export function sayBefore(n: number): string | null {
  if (n === 0) return null;
  return `${n} earlier ${n === 1 ? 'booking' : 'bookings'}`;
}
