'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { bookIn } from '@/weave/occasions/actions';
import {
  clashesIn, sayClashes, standingOf, weeksOf, type Occasion,
} from '@/weave/occasions/shape';

/**
 * The month, as a studio holds it.
 *
 * Occasions are the scheduled things, so a calendar is a second reading of
 * what the diary already knows rather than anything new. What it adds is the
 * two things a month view is actually for: seeing the shape of the weeks, and
 * catching the day somebody is in two places at once.
 *
 * Pressing a day books into it. A studio taking a booking is doing one thing
 * — somebody is coming, on a day, at a time — and it should be one act.
 */
export function Diary({
  occasions, year, month, today,
}: {
  occasions: Occasion[];
  year: number;
  month: number;
  today: string;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  const weeks = weeksOf(year, month);
  const clashes = clashesIn(occasions);
  const clashing = new Set(clashes.flatMap((c) => [c.a, c.b]));
  const said = sayClashes(clashes);

  const onDay = (day: string) => occasions.filter((o) => o.onDate === day);

  return (
    <div className="q-stack q-stack-sm">
      {/* The one thing a month can tell you that a list cannot. */}
      {said && <p className="q-clash">{said}</p>}

      <div className="q-cal">
        <div className="q-cal-week q-cal-heads">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <span className="q-cal-head" key={d}>{d}</span>
          ))}
        </div>

        {weeks.map((week) => (
          <div className="q-cal-week" key={week[0]}>
            {week.map((day) => {
              const mine = new Date(`${day}T00:00:00`).getMonth() === month;
              const things = onDay(day);
              const isToday = day === today;

              return (
                <div
                  key={day}
                  className={[
                    'q-cal-day',
                    mine ? '' : 'q-cal-away',
                    isToday ? 'q-cal-today' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <button
                    type="button"
                    className="q-cal-n"
                    onClick={() => { setProblem(null); setOpening(opening === day ? null : day); }}
                    aria-label={`Book into ${day}`}
                  >
                    {Number(day.slice(8, 10))}
                  </button>

                  {things.map((o) => {
                    const stands = standingOf(o, today);
                    return (
                      <Link
                        key={o.id}
                        href={o.jobId ? `/jobs/${o.jobId}` : '/calendar'}
                        className={[
                          'q-cal-item',
                          clashing.has(o.id) ? 'q-cal-clash' : '',
                          stands === 'done' ? 'q-cal-done' : '',
                          stands === 'unmarked' ? 'q-cal-unmarked' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {o.startsAt && <span className="q-cal-at">{o.startsAt.slice(0, 5)}</span>}
                        <span className="q-cal-who">
                          {o.clientName ?? o.what ?? 'Something'}
                        </span>
                      </Link>
                    );
                  })}

                  {opening === day && (
                    <form
                      className="q-cal-new"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        setProblem(null);
                        start(async () => {
                          try {
                            await bookIn({
                              clientName: String(form.get('clientName') ?? ''),
                              what: String(form.get('what') ?? ''),
                              onDate: day,
                              startsAt: String(form.get('startsAt') ?? '') || null,
                              endsAt: String(form.get('endsAt') ?? '') || null,
                            });
                            setOpening(null);
                          } catch (err) {
                            setProblem(err instanceof Error ? err.message : 'That did not book');
                          }
                        });
                      }}
                    >
                      <input
                        className="q-input q-input-sm" name="clientName" autoFocus required
                        placeholder="Who is it for" disabled={working}
                      />
                      <input
                        className="q-input q-input-sm" name="what"
                        placeholder="What is it" disabled={working}
                      />
                      <span className="q-row q-row-sm">
                        <input className="q-input q-input-sm" name="startsAt" type="time" disabled={working} />
                        <input className="q-input q-input-sm" name="endsAt" type="time" disabled={working} />
                      </span>
                      <span className="q-row q-row-sm">
                        <button className="q-btn q-btn-primary q-btn-xs" type="submit" disabled={working}>
                          {working ? 'Booking' : 'Book it'}
                        </button>
                        <button
                          type="button" className="q-btn q-btn-ghost q-btn-xs"
                          onClick={() => setOpening(null)} disabled={working}
                        >
                          Cancel
                        </button>
                      </span>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </div>
  );
}
