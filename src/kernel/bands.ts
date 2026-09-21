/**
 * WHEN, AS A STUDIO SPEAKS OF IT. A dated thing is today, tomorrow, later
 * this week, later, undated, or earlier - read on the studio's own clock,
 * not the server's. One definition, so the bookings sheet and the work
 * sheet band the same booking the same way.
 */

export type Band = 'today' | 'tomorrow' | 'week' | 'later' | 'undated' | 'earlier';

export const BAND_ORDER: Band[] = ['today', 'tomorrow', 'week', 'later', 'undated', 'earlier'];
export const BAND_LABEL: Record<Band, string> = {
  today: 'Today', tomorrow: 'Tomorrow', week: 'This week', later: 'Later',
  undated: 'No date yet', earlier: 'Earlier',
};

/** A calendar day, yyyy-mm-dd, as the studio's clock reads the instant. */
export function dayIn(iso: string, timezone: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type Calendar = { today: string; tomorrow: string; weekEnd: string };

/** Today on the studio's clock, and the days the bands are cut at. The week runs to Sunday. */
export function calendarIn(timezone: string, now = new Date()): Calendar {
  const today = dayIn(now.toISOString(), timezone);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return { today, tomorrow: addDays(today, 1), weekEnd: addDays(today, weekday === 0 ? 0 : 7 - weekday) };
}

export function bandOf(day: string | null, cal: Calendar): Band {
  return !day ? 'undated'
    : day < cal.today ? 'earlier'
    : day === cal.today ? 'today'
    : day === cal.tomorrow ? 'tomorrow'
    : day <= cal.weekEnd ? 'week'
    : 'later';
}

const dateOf = (day: string, style: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { ...style, timeZone: 'UTC' });

/** The "When" axis's values: each band, with today's date and the week's end as notes, today marked. */
export function whenItems(cal: Calendar) {
  return BAND_ORDER.map((b) => ({
    key: b,
    label: BAND_LABEL[b],
    now: b === 'today',
    note: b === 'today' ? dateOf(cal.today, { weekday: 'long', day: 'numeric', month: 'long' })
      : b === 'week' ? `to ${dateOf(cal.weekEnd, { weekday: 'long', day: 'numeric', month: 'short' })}`
      : null,
  }));
}
