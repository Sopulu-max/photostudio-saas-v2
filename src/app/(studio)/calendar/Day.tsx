import Link from 'next/link';
import { sayKind, type Entry } from '@/weave/calendar/shape';

/**
 * One day, in full.
 *
 * Not a cell with the words cut off. The month has to fit thirty-one of these
 * on a screen and the week seven, so both show a name and an hour; this one
 * has the room to say what each engagement IS, who it is for, and who from
 * the studio is on it.
 *
 * Timed things first, in the order of the day. Anything untimed comes after
 * rather than being given an invented hour — the studio has not said when,
 * and pretending otherwise would put a thing on the clock that is not on it.
 */
export function Day({ day, entries }: { day: string; entries: Entry[] }) {
  const timed = entries.filter((e) => e.at);
  const untimed = entries.filter((e) => !e.at);

  if (entries.length === 0) {
    return (
      <div className="q-stack q-stack-sm">
        <p className="q-empty">Nothing on this day.</p>
        <Link className="q-btn q-btn-secondary q-btn-sm q-start-btn" href={`/bookings/new?on=${day}`}>
          Start a booking
        </Link>
      </div>
    );
  }

  const Line = ({ entry }: { entry: Entry }) => (
    <Link className="q-row q-row-between q-row-link" href={entry.href}>
      <span className="q-stack q-stack-xs">
        {/* The studio's own words, exactly as typed. */}
        <strong className="q-strong">{entry.who ?? entry.what}</strong>
        <span className="q-meta">
          {sayKind(entry.kind)}
          {entry.who && entry.what !== entry.who ? ` · ${entry.what}` : ''}
        </span>
        {entry.crew.length > 0 && (
          <span className="q-meta-sm">{entry.crew.join(', ')}</span>
        )}
      </span>
      <span className="q-meta">{entry.at ? entry.at.slice(0, 5) : 'No time set'}</span>
    </Link>
  );

  return (
    <div className="q-stack q-stack-md">
      {timed.length > 0 && (
        <section className="q-stack q-stack-sm">
          {timed.map((entry, i) => (
            <Line key={`${entry.kind}-${entry.href}-${i}`} entry={entry} />
          ))}
        </section>
      )}

      {untimed.length > 0 && (
        <section className="q-stack q-stack-sm">
          {/* Said, rather than slotted into the clock at an hour nobody chose. */}
          {timed.length > 0 && <h2 className="q-section-title">No time set</h2>}
          {untimed.map((entry, i) => (
            <Line key={`${entry.kind}-${entry.href}-${i}`} entry={entry} />
          ))}
        </section>
      )}

      <Link className="q-btn q-btn-secondary q-btn-sm q-start-btn" href={`/bookings/new?on=${day}`}>
        Start a booking
      </Link>
    </div>
  );
}
