'use client';

import { useState, useTransition } from 'react';
import { amendBooking, moveBooking, type BookingDetail } from '@/weave/bookings/actions';
import { COLUMNS } from '@/weave/bookings/shape';

/**
 * Changing what a booking says, in place.
 *
 * IN THE ORDER THE BOOKING WAS WRITTEN IN. The form that starts one walks
 * client, then date and time, then occasion, then team, then package, then
 * notes — and this read back notes, occasion, date, which is the same booking
 * described in a different order by the same app. Status comes last because
 * it is the one thing here that was never asked at the start.
 *
 * Saving is explicit rather than on every keystroke: a studio's notes are
 * written while somebody is on the phone, and a field that commits half a
 * sentence records half a sentence.
 */
export function BookingAmend({ booking }: { booking: BookingDetail }) {
  const [wants, setWants] = useState(booking.wants ?? '');
  const [occasion, setOccasion] = useState(booking.occasion ?? '');
  const [occasionOn, setOccasionOn] = useState(booking.occasionOn ?? '');
  const [on, setOn] = useState(booking.on ?? '');
  /* Sliced to HH:MM — an <input type="time"> will not take "14:00:00". */
  const [at, setAt] = useState(booking.at?.slice(0, 5) ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [working, start] = useTransition();

  const unsaved = wants !== (booking.wants ?? '')
    || occasion !== (booking.occasion ?? '')
    || occasionOn !== (booking.occasionOn ?? '')
    || on !== (booking.on ?? '')
    || at !== (booking.at?.slice(0, 5) ?? '');

  const save = () => {
    setProblem(null);
    start(async () => {
      try {
        await amendBooking({
          bookingId: booking.id,
          wants,
          occasion: occasion || null,
          occasionOn: occasionOn || null,
          on: on || null,
          at: at || null,
        });
      } catch (err) {
        setProblem(err instanceof Error ? err.message : 'Could not save that');
      }
    });
  };

  const move = (turn: string) => {
    setProblem(null);
    start(async () => {
      try {
        await moveBooking({ bookingId: booking.id, turn: turn as BookingDetail['turn'] });
      } catch (err) {
        setProblem(err instanceof Error ? err.message : 'Could not move that booking');
      }
    });
  };

  return (
    <section className="q-card q-stack q-stack-sm">
      <div className="q-field">
        <label className="q-label" htmlFor="on">Date</label>
        <input
          className="q-input q-input-sm q-dashboard-target"
          id="on"
          type="date"
          value={on}
          onChange={(e) => { setOn(e.target.value); setProblem(null); }}
          disabled={working}
        />
      </div>

      <div className="q-field">
        <label className="q-label" htmlFor="at">Time</label>
        <input
          className="q-input q-input-sm" id="at" type="time" value={at}
          onChange={(e) => { setAt(e.target.value); setProblem(null); }}
          disabled={working}
        />
      </div>

      <div className="q-field">
        <label className="q-label" htmlFor="occasion">Occasion</label>
        <input
          className="q-input" id="occasion" value={occasion}
          placeholder="Wedding, naming ceremony, headshots"
          onChange={(e) => { setOccasion(e.target.value); setProblem(null); }}
          disabled={working}
        />
      </div>

      <div className="q-field">
        <label className="q-label" htmlFor="occasionOn">Occasion date</label>
        <input
          className="q-input q-input-sm" id="occasionOn" type="date" value={occasionOn}
          onChange={(e) => { setOccasionOn(e.target.value); setProblem(null); }}
          disabled={working}
        />
      </div>

      <div className="q-field">
        <label className="q-label" htmlFor="wants">Notes</label>
        <input
          className="q-input"
          id="wants"
          value={wants}
          onChange={(e) => setWants(e.target.value)}
          placeholder="In your own words"
          disabled={working}
        />
      </div>

      <div className="q-field">
        <label className="q-label" htmlFor="turn">Status</label>
        <select
          className="q-input q-input-sm"
          id="turn"
          value={booking.turn}
          onChange={(e) => move(e.target.value)}
          disabled={working}
        >
          {COLUMNS.map((c) => (
            <option key={c.turn} value={c.turn}>{c.heading}</option>
          ))}
        </select>
      </div>

      <div className="q-row q-row-between">
        <span className="q-meta">
          {working ? 'Saving' : unsaved ? 'Not saved yet' : 'Saved'}
        </span>
        <button
          className="q-btn q-btn-primary q-btn-sm"
          type="button"
          onClick={save}
          disabled={working || !unsaved}
        >
          Save
        </button>
      </div>

      {problem && <p className="q-meta">{problem}</p>}
    </section>
  );
}
