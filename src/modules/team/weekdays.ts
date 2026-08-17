/**
 * The seven days, once.
 *
 * A plain module rather than part of `attendance.ts`, because a `'use server'`
 * file may only export async functions — a bare const there is a runtime error
 * that no typecheck catches. Same reason `dimensions.ts` and `variableTypes.ts`
 * exist alongside their domains.
 *
 * ISO 8601 numbering: 1 = Monday … 7 = Sunday, matching `extract(isodow)` in
 * the database rather than JavaScript's 0 = Sunday, because the database is
 * where a working week is stored.
 *
 * Monday first, because a working week starts on one. This is one of the very
 * few genuinely closed sets in this app — closed by the calendar rather than by
 * anyone's opinion — so unlike almost every list here, nothing may be added.
 */
export type Weekday = { iso: number; short: string; long: string };

export const WEEKDAYS: Weekday[] = [
  { iso: 1, short: 'Mon', long: 'Monday' },
  { iso: 2, short: 'Tue', long: 'Tuesday' },
  { iso: 3, short: 'Wed', long: 'Wednesday' },
  { iso: 4, short: 'Thu', long: 'Thursday' },
  { iso: 5, short: 'Fri', long: 'Friday' },
  { iso: 6, short: 'Sat', long: 'Saturday' },
  { iso: 7, short: 'Sun', long: 'Sunday' },
];

/** Only the days a studio actually named, in week order. */
export const namedDays = (days: number[]): Weekday[] =>
  WEEKDAYS.filter((d) => days.includes(d.iso));
