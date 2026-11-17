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
