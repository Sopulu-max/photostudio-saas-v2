'use client';

import { useState, useTransition } from 'react';
import { acceptRequest, declineRequest } from '@/weave/bookings/requests';
import { sayRequests, type Request } from '@/weave/bookings/shape';

/**
 * What somebody outside has asked for, and not yet been answered about.
 *
 * Above the board rather than inside it, because the act is different. A booking on
 * the board is moved along; a request is taken or refused, and until it is, a
 * person is sitting somewhere waiting to hear back. That is the most urgent
 * thing on this page and it is given the top of it.
 *
 * It says how long they have waited, in days, because "asked on the 14th" makes
 * an operator do the subtraction and the answer to that subtraction is the
 * whole point.
 */
export function Requests({ waiting, origin, heading = true }: {
  waiting: Request[];
  /** Written out in full, because the studio has to paste it into a message. */
  origin: string;
  /**
   * Off where the page has already said it. On the board this band has to
   * announce itself; on the Bookings page the title says the same sentence
   * two lines above, and saying it twice reads as a stutter rather than
   * emphasis.
   */
  heading?: boolean;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [mode, setMode] = useState<'take' | 'decline'>('take');
  const [working, start] = useTransition();

  const run = (fn: () => Promise<unknown>) => {
    setProblem(null);
    start(async () => {
      try { await fn(); setAnsweringId(null); } catch (err) {
        setProblem(err instanceof Error ? err.message : 'That did not work');
      }
    });
  };

  // Nothing waiting is still worth saying; an empty band reads as a broken one.
  if (waiting.length === 0) return null;

  return (
    <section className="q-asks">
      {heading && <h2 className="q-section-title">{sayRequests(waiting)}</h2>}

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

            <p className="q-ask-wants">{ask.wants ?? 'No details provided.'}</p>

{/*
              * A statement, not a key. "Requested date:" followed by a date is
              * a label covering for a reading that does not announce itself.
              */}
            {ask.askedFor && (
              <p className="q-meta">
                Asked for{' '}
                {new Date(`${ask.askedFor}T00:00:00`).toLocaleDateString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
              </p>
            )}

            {/*
              * The link the asker reads the answer on. Shown before answering
              * as well as after, because until email is wired this is the only
              * way they hear anything at all, and it has to be copyable.
              */}
            {ask.token && (
              <a className="q-share" href={`/r/${ask.token}`}>
                {origin}/r/{ask.token}
              </a>
            )}

            {answeringId === ask.id ? (
              <form
                className="q-stack q-stack-xs"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const saying = String(form.get('saying') ?? '');
                  const because = String(form.get('because') ?? '');
                  run(() => mode === 'take'
                    ? acceptRequest({ bookingId: ask.id, saying })
                    : declineRequest({ bookingId: ask.id, because, saying }));
                }}
              >
                <textarea
                  className="q-input" name="saying" rows={3} autoFocus disabled={working}
                  placeholder={mode === 'take'
                    ? 'Reply to the client'
                    : 'Reply to the client'}
                />
                {mode === 'decline' && (
                  <input
                    className="q-input q-input-sm" name="because" disabled={working}
                    placeholder="Internal note, not shown to the client"
                  />
                )}
                <div className="q-row q-row-sm">
                  <button
                    className={mode === 'take' ? 'q-btn q-btn-primary q-btn-sm' : 'q-btn q-btn-secondary q-btn-sm'}
                    type="submit" disabled={working}
                  >
                    {mode === 'take' ? 'Accept' : 'Decline'}
                  </button>
                  <button
                    type="button" className="q-btn q-btn-ghost q-btn-xs"
                    onClick={() => setAnsweringId(null)} disabled={working}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="q-row q-row-sm">
                <button
                  type="button" className="q-btn q-btn-primary q-btn-sm" disabled={working}
                  onClick={() => { setMode('take'); setAnsweringId(ask.id); }}
                >
                  Accept
                </button>
                <button
                  type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={working}
                  onClick={() => { setMode('decline'); setAnsweringId(ask.id); }}
                >
                  Decline
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
