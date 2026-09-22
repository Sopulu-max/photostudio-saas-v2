import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { studioHoursFor, studioTimezone, type StudioDayHours } from '@/kernel/studioHours';
import { calendarIn } from '@/kernel/bands';

/**
 * THE CALENDAR FRAME - the studio's own days, for the month the operator is
 * looking at.
 *
 * Only the frame: which days the grid holds, which of them belong to the month,
 * which is today on the studio's clock, and WHAT HOURS THE STUDIO KEEPS on each
 * one. What falls on a day is the bookings the page already has in hand, so
 * nothing about a booking is read twice.
 *
 * The hours come from the kernel one date at a time, because the precedence
 * between a named date, an nth weekday, the ordinary week and the studio's
 * usual hours is written once, in Postgres (kernel/studioHours). Asking it
 * thirty-five times in parallel is cheaper than keeping a second copy of those
 * rules here and eventually disagreeing with it.
 */

export type MonthDay = {
  /** yyyy-mm-dd. */
  day: string;
  /** The day number, as the studio's calendar shows it. */
  date: number;
  /** False for the days either side that fill the grid's first and last weeks. */
  inMonth: boolean;
  today: boolean;
  /** Behind today on the studio's clock. */
  behind: boolean;
  hours: StudioDayHours;
};

export type BookingsMonth = {
  /** The month asked for, yyyy-mm. */
  month: string;
  /** Said for a heading: "September 2026". */
  label: string;
  /** The month before and after, for the controls. */
  previous: string;
  next: string;
  /** Monday-first weeks, six at most, five when the month fits. */
  days: MonthDay[];
  /** Today, on the studio's clock - the same day the rest of the page reckons from. */
  today: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthOf = (d: Date) => iso(d).slice(0, 7);

export async function readBookingsMonth(month?: string): Promise<BookingsMonth> {
  const { orgId } = await getAuthOrgId();
  const timezone = await studioTimezone(orgId);
  const { today } = calendarIn(timezone);

  const asked = /^\d{4}-\d{2}$/.test(month ?? '') ? month! : today.slice(0, 7);
  const [y, m] = asked.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));

  // Monday first: a studio's week starts where its own hours table starts.
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - lead);
  const cells = Math.ceil((lead + last.getUTCDate()) / 7) * 7;

  const days: { day: string; date: number; inMonth: boolean }[] = [];
  for (let i = 0; i < cells; i += 1) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    days.push({ day: iso(d), date: d.getUTCDate(), inMonth: monthOf(d) === asked });
  }

  const hours = await Promise.all(days.map((d) => studioHoursFor(orgId, d.day)));

  const step = (by: number) => {
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    return monthOf(d);
  };

  return {
    month: asked,
    label: first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    previous: step(-1),
    next: step(1),
    today,
    days: days.map((d, i) => ({
      ...d,
      today: d.day === today,
      behind: d.day < today,
      hours: hours[i],
    })),
  };
}
