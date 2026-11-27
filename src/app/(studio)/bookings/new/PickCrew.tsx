'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Mate } from '@/weave/crew/actions';

/** Somebody on the booking being written, before it exists to hang them off. */
export type Staffing = { personId: string; role: string };

/**
 * Who is on this booking, and what they do on it.
 *
 * Added one at a time behind a button rather than shown as a row of names to
 * press. A name on its own was not the whole fact — somebody is on a booking
 * AS something — and a pill cannot carry a second field. So: press Add, say
 * who, say what they do, and the line joins the list.
 *
 * THE ROLE IS THE PERSON'S, not this booking's: Chidi is a photographer
 * whichever booking Chidi is on. So it is shown when they already have one
 * and asked for when they do not, and what is typed here is written to their
 * record rather than to the booking.
 *
 * Free text. Nothing in this engine behaves differently for a photographer
 * than a videographer, so nothing earns a fixed list.
 */
export function PickCrew({ team, staffing, onChange, disabled }: {
  team: Mate[];
  staffing: Staffing[];
  onChange: (staffing: Staffing[]) => void;
  disabled: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [personId, setPersonId] = useState('');
  const [role, setRole] = useState('');

  const mateOf = (id: string) => team.find((m) => m.personId === id) ?? null;
  const nameOf = (id: string) => mateOf(id)?.name ?? 'Somebody';
  /* What they already do here, if anybody has written it down. */
  const known = mateOf(personId)?.role ?? null;
  /* Already on it: a studio cannot put the same person on twice. */
  const free = team.filter((m) => !staffing.some((s) => s.personId === m.personId));

  if (team.length === 0) {
    return (
      <p className="q-auth-hint">
        Nobody works here yet. <Link className="q-auth-link" href="/team">Add
        somebody</Link> to put them on a booking.
      </p>
    );
  }

  const add = () => {
    if (!personId) return;
    onChange([...staffing, { personId, role: (known ?? role).trim() }]);
    setPersonId('');
    setRole('');
    setAdding(false);
  };

  return (
    <div className="q-stack q-stack-sm">
      {staffing.length > 0 && (
        <div className="q-sheet">
          {staffing.map((s) => (
            <div className="q-onit" key={s.personId}>
              <span className="q-stack q-stack-xs">
                {/* The studio's own spelling, of both the name and the role. */}
                <strong className="q-strong">{nameOf(s.personId)}</strong>
                <span className="q-meta">{s.role || 'No role given'}</span>
              </span>
              <button
                type="button" className="q-btn q-btn-ghost q-btn-xs" disabled={disabled}
                onClick={() => onChange(staffing.filter((x) => x.personId !== s.personId))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="q-stack q-stack-sm">
          <label className="q-auth-field">
            <span className="q-label">Team member</span>
            <select
              className="q-input" value={personId} disabled={disabled}
              onChange={(e) => setPersonId(e.target.value)}
            >
              <option value="">Choose somebody</option>
              {free.map((m) => (
                <option key={m.personId} value={m.personId}>{m.name}</option>
              ))}
            </select>
          </label>

          <label className="q-auth-field">
            <span className="q-label">Role</span>
            <input
              className="q-input" value={known ?? role} disabled={disabled || !!known}
              placeholder="Photographer, second shooter, video"
              onChange={(e) => setRole(e.target.value)}
            />
            <span className="q-auth-hint">
              {known
                ? 'Already on the record. Changed on the team page.'
                : "Goes on the person’s record, not on this booking."}
            </span>
          </label>

          <div className="q-row q-row-sm">
            <button
              type="button" className="q-btn q-btn-secondary q-btn-sm"
              onClick={add} disabled={disabled || !personId}
            >
              Add
            </button>
            <button
              type="button" className="q-btn q-btn-ghost q-btn-sm" disabled={disabled}
              onClick={() => { setAdding(false); setPersonId(''); setRole(''); }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : free.length > 0 && (
        /*
         * Nothing at all when there is nobody left to add. A disabled button
         * saying "Everybody is on it" is a control that cannot be pressed
         * reporting a fact the list above it already shows.
         */
        <button
          type="button" className="q-btn q-btn-secondary q-btn-sm q-start-btn"
          onClick={() => setAdding(true)} disabled={disabled}
        >
          Add team member
        </button>
      )}
    </div>
  );
}
