/**
 * What a job is, and what the board's columns are.
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

export const COLUMNS: { turn: Turn; heading: string; absent: string }[] = [
  { turn: 'us', heading: 'Needs you', absent: 'Nothing needs you.' },
  { turn: 'them', heading: 'Waiting on them', absent: 'Nobody is holding you up.' },
  { turn: 'scheduled', heading: 'Scheduled', absent: 'Nothing is booked ahead.' },
  { turn: 'done', heading: 'Done', absent: 'Nothing finished yet.' },
];

export type JobCard = {
  id: string;
  wants: string | null;
  expectedOn: string | null;
  clientName: string | null;
  turn: Turn;
};

export type Board = { turn: Turn; heading: string; absent: string; jobs: JobCard[] }[];

/**
 * Work that has arrived from outside and not been answered.
 *
 * The same row as a job — a request IS a job nobody has agreed to — read
 * differently, because the act it invites is different. A job is moved along;
 * a request is taken or refused.
 */
export type Request = {
  id: string;
  wants: string | null;
  expectedOn: string | null;
  askedBy: string | null;
  askedByEmail: string | null;
  requestedAt: string;
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
  if (waiting.length === 0) return 'Nobody is waiting on an answer.';
  if (waiting.length === 1) return 'One person is waiting on an answer.';
  return `${waiting.length} people are waiting on an answer.`;
}
