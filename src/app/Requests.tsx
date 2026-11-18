'use client';

import { useState, useTransition } from 'react';
import { acceptRequest, declineRequest } from '@/weave/jobs/requests';
import { sayRequests, type Request } from '@/weave/jobs/shape';

/**
 * What somebody outside has asked for, and not yet been answered about.
 *
 * Above the board rather than inside it, because the act is different. A job on
 * the board is moved along; a request is taken or refused, and until it is, a
 * person is sitting somewhere waiting to hear back. That is the most urgent
 * thing on this page and it is given the top of it.
 *
 * It says how long they have waited, in days, because "asked on the 14th" makes
 * an operator do the subtraction and the answer to that subtraction is the
 * whole point.
 */
export function Requests({ waiting }: { waiting: Request[] }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [working, start] = useTransition();

  const run = (fn: () => Promise<unknown>) => {
    setProblem(null);
    start(async () => {
      try { await fn(); setDecliningId(null); } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That did not work');
      }
    });
  };

  // Nothing waiting is still worth saying; an empty band reads as a broken one.
  if (waiting.length === 0) return null;

  return (
    <section className="q-asks">
      <h2 className="q-section-title">{sayRequests(waiting)}</h2>

      {waiting.map((ask) => {
        const days = Math.floor(
          (Date.now() - new Date(ask.requestedAt).getTime()) / 86_400_000,
        );
        const waited = days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;

        return (
          <article className="q-ask" key={ask.id} data-busy={working ? 'yes' : undefined}>
            <header className="q-ask-head">
              <div className="q-ask-who">
                <strong className="q-ask-name">{ask.askedBy ?? 'Somebody'}</strong>
                {ask.askedByEmail && <span className="q-meta-sm">{ask.askedByEmail}</span>}
              </div>
              <span className="q-ask-waited">{waited}</span>
            </header>

            <p className="q-ask-wants">{ask.wants ?? 'They did not say what for.'}</p>

            {ask.expectedOn && (
              <p className="q-meta">
                They asked for{' '}
                {new Date(`${ask.expectedOn}T00:00:00`).toLocaleDateString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
              </p>
            )}

            {decliningId === ask.id ? (
              <form
                className="q-row q-row-sm"
                onSubmit={(event) => {
                  event.preventDefault();
                  const because = String(new FormData(event.currentTarget).get('because') ?? '');
                  run(() => declineRequest({ jobId: ask.id, because }));
                }}
              >
                <input
                  className="q-input q-input-sm" name="because" autoFocus disabled={working}
                  placeholder="Why, for your own records"
                />
                <button className="q-btn q-btn-secondary q-btn-xs" type="submit" disabled={working}>
                  Decline it
                </button>
                <button
                  type="button" className="q-btn q-btn-ghost q-btn-xs"
                  onClick={() => setDecliningId(null)} disabled={working}
                >
                  Keep it open
                </button>
              </form>
            ) : (
              <div className="q-row q-row-sm">
                <button
                  type="button" className="q-btn q-btn-primary q-btn-sm" disabled={working}
                  onClick={() => run(() => acceptRequest({ jobId: ask.id }))}
                >
                  Take it on
                </button>
                <button
                  type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                  onClick={() => setDecliningId(ask.id)}
                >
                  Not this one
                </button>
              </div>
            )}
          </article>
        );
      })}

      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </section>
  );
}
