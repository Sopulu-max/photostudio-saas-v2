import Link from 'next/link';
import { sayKind, type Entry } from '@/weave/calendar/shape';

/**
 * Seven days, side by side.
 *
 * The month answers "what is this month like"; the week answers "what is this
 * week", which is a different question and the one a studio asks on a Monday.
 * So the cells are tall enough to read a line in full rather than tall enough
 * to fit five.
 *
 * Every line is a door, and the day number starts a booking on that day.
 */
export function Week({ days, today, entries }: {
  days: string[];
  today: string;
  entries: Entry[];
}) {
  return (
    <div className="q-cal">
      <div className="q-cal-week q-cal-heads">
        {days.map((day) => (
          <span className="q-cal-head" key={day}>
            {new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
              weekday: 'short', timeZone: 'UTC',
            })}
          </span>
        ))}
      </div>

      <div className="q-cal-week q-cal-week-tall">
        {days.map((day) => {
          const things = entries.filter((e) => e.on === day);

          return (
            <div
              key={day}
              className={day === today ? 'q-cal-day q-cal-today' : 'q-cal-day'}
            >
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
    </div>
  );
}
