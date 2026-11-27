import Link from 'next/link';
import { sayKind, type Entry } from '@/weave/calendar/shape';

/**
 * The month, as a studio holds it.
 *
 * A server component: nothing here holds state. Pressing a day starts a
 * booking on it — `/bookings/new?on=<day>` — because taking a booking has its
 * own page, and a form unfolding inside a calendar cell is four fields in a
 * box an inch wide.
 *
 * EVERY LINE IS A DOOR to the thing it is a date for: the booking, the
 * gallery, the follow-up. A calendar that can only be looked at is a wall
 * chart.
 */
export function Month({ weeks, month, today, entries }: {
  weeks: string[][];
  month: number;
  today: string;
  entries: Entry[];
}) {
  const onDay = (day: string) => entries.filter((e) => e.on === day);

  return (
    <div className="q-cal">
      <div className="q-cal-week q-cal-heads">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <span className="q-cal-head" key={d}>{d}</span>
        ))}
      </div>

      {weeks.map((week) => (
        <div className="q-cal-week" key={week[0]}>
          {week.map((day) => {
            const mine = new Date(`${day}T00:00:00`).getUTCMonth() === month;
            const things = onDay(day);

            return (
              <div
                key={day}
                className={[
                  'q-cal-day',
                  mine ? '' : 'q-cal-away',
                  day === today ? 'q-cal-today' : '',
                ].filter(Boolean).join(' ')}
              >
                {/*
                  * The number starts a booking on that day. The date is
                  * carried in the query so the form opens already knowing it
                  * — a studio pressing the thirteenth has said when.
                  */}
                <Link
                  className="q-cal-n"
                  href={`/bookings/new?on=${day}`}
                  aria-label={`Start a booking on ${day}`}
                >
                  {Number(day.slice(8, 10))}
                </Link>

                {things.map((entry, i) => (
                  <Link
                    key={`${entry.kind}-${entry.href}-${i}`}
                    href={entry.href}
                    className={entry.kind === 'shoot' ? 'q-cal-item' : 'q-cal-item q-cal-owed'}
                    /* What kind of engagement it is, for anybody who hovers
                     * or is reading it aloud. The line itself stays short. */
                    title={`${sayKind(entry.kind)} · ${entry.what}`}
                  >
                    {entry.at && <span className="q-cal-at">{entry.at.slice(0, 5)}</span>}
                    <span className="q-cal-who">
                      {/* The studio's own words, exactly as typed. */}
                      {entry.who ?? entry.what}
                    </span>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
