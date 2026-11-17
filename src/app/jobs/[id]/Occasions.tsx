'use client';

import { useState, useTransition } from 'react';
import {
  addOccasion, markHappened, removeOccasion, setCrew,
} from '@/weave/occasions/actions';
import { standingOf, sayWhen, sayCrew, type Occasion } from '@/weave/occasions/shape';

/**
 * What is to happen on this job, and who is on it.
 *
 * Each row states itself — when, what the studio called it, who is on it —
 * with no column headings, because a reading that needs a key is not a
 * reading. Absence is stated too: "Nobody on it" is a fact somebody has to act
 * on and blank space is not.
 */
export function Occasions({
  jobId, occasions, people, today,
}: {
  jobId: string;
  occasions: Occasion[];
  people: { id: string; name: string }[];
  today: string;
}) {
  const [what, setWhat] = useState('');
  const [onDate, setOnDate] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  const run = (fn: () => Promise<unknown>) => {
    setProblem(null);
    start(async () => {
      try { await fn(); } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That did not work');
      }
    });
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onDate) { setProblem('Something that happens needs a day.'); return; }
    run(async () => {
      await addOccasion({ jobId, what, onDate, startsAt: startsAt || null, endsAt: endsAt || null });
      setWhat(''); setOnDate(''); setStartsAt(''); setEndsAt('');
    });
  };

  const standingWord: Record<string, string> = {
    done: 'Happened',
    today: 'Today',
    ahead: 'Ahead',
    unmarked: 'Not marked as happened',
  };

  return (
    <section className="q-card q-stack q-stack-sm">
      <h2 className="q-section-title">What happens</h2>

      {occasions.length === 0 ? (
        <p className="q-empty">Nothing is arranged on this job yet.</p>
      ) : (
        <div className="q-stack q-stack-sm">
          {occasions.map((o) => {
            const standing = standingOf(o, today);
            return (
              <div key={o.id} className="q-tile q-stack q-stack-xs">
                <div className="q-row q-row-between">
                  <strong className="q-strong">{sayWhen(o)}</strong>
                  <span className={standing === 'unmarked' ? 'q-meta q-warm' : 'q-meta'}>
                    {standingWord[standing]}
                  </span>
                </div>

                <span className="q-meta">{o.what ?? 'Not said what it is'}</span>
                <span className="q-meta">{sayCrew(o)}</span>

                <div className="q-row q-row-sm">
                  <button
                    type="button"
                    className="q-btn q-btn-ghost q-btn-xs"
                    disabled={working}
                    onClick={() => run(() => markHappened({ occasionId: o.id, happened: !o.happenedAt }))}
                  >
                    {o.happenedAt ? 'It did not happen' : 'It happened'}
                  </button>
                  <button
                    type="button"
                    className="q-btn q-btn-ghost q-btn-xs"
                    disabled={working}
                    onClick={() => setOpen(open === o.id ? null : o.id)}
                  >
                    Who is on it
                  </button>
                  <button
                    type="button"
                    className="q-btn q-btn-ghost q-btn-xs"
                    disabled={working}
                    onClick={() => run(() => removeOccasion({ occasionId: o.id }))}
                  >
                    Take it off
                  </button>
                </div>

                {open === o.id && (
                  <div className="q-stack q-stack-xs">
                    {people.length === 0 ? (
                      <p className="q-meta">Nobody is on the books yet.</p>
                    ) : people.map((p) => {
                      const on = o.crew.some((c) => c.personId === p.id);
                      return (
                        <label key={p.id} className="q-row q-row-sm">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={working}
                            onChange={() => run(() => setCrew({
                              occasionId: o.id, personId: p.id, on: !on,
                            }))}
                          />
                          <span className="q-meta">{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <form className="q-row q-row-sm" onSubmit={add}>
        <input
          className="q-input"
          placeholder="What happens"
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          disabled={working}
        />
        <input
          className="q-input q-input-sm"
          type="date"
          value={onDate}
          onChange={(e) => setOnDate(e.target.value)}
          disabled={working}
        />
        <input
          className="q-input q-input-sm"
          type="time"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          disabled={working}
        />
        <input
          className="q-input q-input-sm"
          type="time"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          disabled={working}
        />
        <button className="q-btn q-btn-secondary" type="submit" disabled={working}>
          {working ? 'Adding' : 'Add'}
        </button>
      </form>

      {problem && <p className="q-meta">{problem}</p>}
    </section>
  );
}
