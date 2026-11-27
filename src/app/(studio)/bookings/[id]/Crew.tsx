'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  putOnBooking, takeOffBooking, type Mate, type OnIt,
} from '@/weave/crew/actions';
import { sayCrew } from '@/weave/crew/shape';

/**
 * Who is on this booking, changed where the booking is.
 *
 * Added one at a time behind a button: somebody is on a booking AS something,
 * and a row of names to press cannot carry the second fact.
 *
 * WHAT THEY DO IS THE PERSON'S, not this booking's. It is shown when they
 * already have one and asked for when they do not, and what is typed goes on
 * their record — so it travels with them to the next booking rather than
 * being said again.
 *
 * The heading is the reading. A label saying "Team" over a list of names
 * would be covering for a reading that did not announce itself.
 */
export function Crew({ bookingId, onIt, team }: {
  bookingId: string;
  onIt: OnIt[];
  /** Everybody who works here, so somebody can be added to it. */
  team: Mate[];
}) {
  const [crew, setCrew] = useState(onIt);
  const [adding, setAdding] = useState(false);
  const [personId, setPersonId] = useState('');
  const [role, setRole] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  const free = team.filter((m) => !crew.some((c) => c.personId === m.personId));
  const mateOf = (id: string) => team.find((m) => m.personId === id) ?? null;
  const known = mateOf(personId)?.role ?? null;

  const add = () => {
    const mate = mateOf(personId);
    if (!mate) return;
    const said = (known ?? role).trim() || null;

    setProblem(null);
    /* Shown at once, and taken back off if the server refuses it. */
    setCrew((was) => [...was, { personId: mate.personId, name: mate.name, role: said }]);
    setAdding(false);
    setPersonId('');
    setRole('');

    start(async () => {
      try {
        await putOnBooking({ bookingId, personId: mate.personId, role: said });
      } catch (err) {
        setCrew((was) => was.filter((c) => c.personId !== mate.personId));
        setProblem(err instanceof Error ? err.message : 'Could not do that');
      }
    });
  };

  const remove = (mate: OnIt) => {
    setProblem(null);
    setCrew((was) => was.filter((c) => c.personId !== mate.personId));
    start(async () => {
      try {
        await takeOffBooking({ bookingId, personId: mate.personId });
      } catch (err) {
        setCrew((was) => [...was, mate]);
        setProblem(err instanceof Error ? err.message : 'Could not do that');
      }
    });
  };

  return (
    <section className="q-card q-stack q-stack-sm q-dashboard-target" id="booking-crew">
      <h2 className="q-reading">{sayCrew(crew)}</h2>

      {crew.length > 0 && (
        <div className="q-sheet">
          {crew.map((mate) => (
            <div className="q-onit" key={mate.personId}>
              <span className="q-stack q-stack-xs">
                {/* The studio's own spelling, of the name and of the role. */}
                <strong className="q-strong">{mate.name}</strong>
                <span className="q-meta">{mate.role ?? 'No role given'}</span>
              </span>
              <button
                type="button" className="q-btn q-btn-ghost q-btn-xs"
                disabled={working} onClick={() => remove(mate)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {team.length === 0 ? (
        <p className="q-empty">
          Nobody works here yet. <Link className="q-auth-link" href="/team">Add
          somebody</Link> to put them on a booking.
        </p>
      ) : adding ? (
        <div className="q-stack q-stack-sm">
          <div className="q-field">
            <label className="q-label" htmlFor="mate">Team member</label>
            <select
              className="q-input q-input-sm" id="mate" value={personId}
              disabled={working} onChange={(e) => setPersonId(e.target.value)}
            >
              <option value="">Choose somebody</option>
              {free.map((m) => (
                <option key={m.personId} value={m.personId}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="q-field">
            <label className="q-label" htmlFor="role">Role</label>
            <input
              className="q-input q-input-sm" id="role"
              value={known ?? role} disabled={working || !!known}
              placeholder="Photographer, second shooter, video"
              onChange={(e) => setRole(e.target.value)}
            />
            <span className="q-meta-sm">
              {known
                ? 'Already on the record. Changed on the team page.'
                : "Goes on the person’s record, not on this booking."}
            </span>
          </div>

          <div className="q-row q-row-sm">
            <button
              type="button" className="q-btn q-btn-secondary q-btn-sm"
              onClick={add} disabled={working || !personId}
            >
              Add
            </button>
            <button
              type="button" className="q-btn q-btn-ghost q-btn-sm" disabled={working}
              onClick={() => { setAdding(false); setPersonId(''); setRole(''); }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : free.length > 0 ? (
        <button
          type="button" className="q-btn q-btn-secondary q-btn-sm q-start-btn"
          onClick={() => setAdding(true)} disabled={working}
        >
          Add team member
        </button>
      ) : null}

      {problem && <p className="q-note q-note-bad">{problem}</p>}
    </section>
  );
}
