'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { checkIn, checkOut } from '@/modules/team/interface';
import type { AttendanceToday } from '@/modules/team/interface';
import { ContactAvatar } from '@/components/ContactAvatar';

/**
 * The board by the door.
 *
 * A shared device, so this is built for a thumb and a glance rather than for an
 * operator at a desk: whole rows are the target, the state is legible from
 * across a room, and nothing needs reading twice. Nobody signs in — the studio's
 * own device is signed in, and the person tapping is recorded on the row.
 *
 * Deliberately not a table. A register is something you scan for a face, not a
 * grid you read cell by cell.
 */

/**
 * A check-in is a date AND a time.
 *
 * The rows used to show the time alone, on the reasoning that everything on
 * this board is today. That reasoning fails exactly when it matters: a device
 * by a door is never closed, so at 00:05 "In since 6:12 PM" reads as tonight
 * when it means last night. A stamp that cannot say which day it belongs to is
 * not a record, it is a rumour.
 */
const timeOf = (iso: string | null, timezone: string) =>
  iso
    ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(iso))
    : '';

const dateOf = (iso: string | null, timezone: string) =>
  iso
    ? new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: timezone }).format(new Date(iso))
    : '';

/** The whole stamp, for a title attribute — seconds and all, when something looks wrong. */
const exactly = (iso: string | null, timezone: string) =>
  iso
    ? new Intl.DateTimeFormat(undefined, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: timezone,
      }).format(new Date(iso))
    : '';

export function AttendanceBoard({
  roster, workDate, timezone,
}: {
  roster: AttendanceToday[];
  workDate: string;
  timezone: string;
}) {
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  /*
   * What just happened, said back.
   *
   * On a device by a door you tap and walk away — the whole interaction is two
   * seconds long. Watching a row quietly move between groups is not
   * confirmation; you need to be told, in words, at what time you were marked
   * in, or you will stand there wondering whether it took.
   *
   * The time shown is the one the SERVER stamped, returned by the action. A
   * board formatting its own clock would confirm a time the record does not
   * hold, which is the one thing a register must never do.
   */
  const [said, setSaid] = useState<
    { name: string; kind: 'in' | 'out' | 'already' | 'pending'; at: string | null }
  | null>(null);

  useEffect(() => {
    // A pending message stays until the answer replaces it — clearing it on a
    // timer would blank the screen mid-wait, which reads as failure.
    if (!said || said.kind === 'pending') return;
    // Long enough to read walking away, short enough that the next person does
    // not see somebody else's name.
    const clear = setTimeout(() => setSaid(null), 8000);
    return () => clearTimeout(clear);
  }, [said]);

  /*
   * Acknowledge the tap immediately; confirm it when the server answers.
   *
   * Writing a check-in is about five sequential round trips to a database that
   * is ~400ms away — measured at 3.8 seconds from tap to confirmation. That is
   * an eternity on a device somebody taps on their way past, and it cannot be
   * fixed by rearranging the UI: the wait is real.
   *
   * So the tap is answered at once, by name, and the recorded time replaces the
   * placeholder when it arrives. The time always comes from the SERVER — a
   * board that guessed would confirm a time the record does not hold, which is
   * the one thing a register must never do.
   *
   * `setSaid` also sits outside the transition, so the answer is not held back
   * behind `router.refresh()` re-fetching the whole board afterwards.
   */
  const run = async (
    person: AttendanceToday,
    fn: () => Promise<{ at?: string; alreadyIn?: boolean } | unknown>,
    kind: 'in' | 'out',
  ) => {
    setBusy(person.employeeId);
    setSaid({ name: person.name, kind: 'pending', at: null });
    try {
      const result = (await fn()) as { at?: string; alreadyIn?: boolean } | undefined;
      setSaid({
        name: person.name,
        kind: kind === 'in' && result?.alreadyIn ? 'already' : kind,
        at: result?.at ?? null,
      });
      startTransition(() => { router.refresh(); });
    } catch (e: any) {
      setSaid(null);
      alert(e?.message || 'That didn’t work.');
    } finally {
      setBusy(null);
    }
  };

  const here = roster.filter((r) => r.state === 'in');
  const left = roster.filter((r) => r.state === 'out');
  const away = roster.filter((r) => r.state === 'away');
  // Not the same as away, and the board used to say they were. Someone on their
  // day off isn't late.
  const off = roster.filter((r) => r.state === 'off');

  if (roster.length === 0) {
    return (
      <p className="q-empty">
        Nobody on the team yet — <a className="q-accent" href="/team">add people</a> and they can start checking in.
      </p>
    );
  }

  const Row = ({ person }: { person: AttendanceToday }) => {
    const working = busy === person.employeeId;
    const arrived = timeOf(person.checkedInAt, timezone);
    const departed = timeOf(person.checkedOutAt, timezone);
    const arrivedOn = dateOf(person.checkedInAt, timezone);
    const departedOn = dateOf(person.checkedOutAt, timezone);
    // Only say the day twice when they actually differ — someone who arrived
    // yesterday evening and left after midnight.
    const spanned = !!departedOn && departedOn !== arrivedOn;

    return (
      <div className="q-tile q-row q-row-between" style={{ flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        <div className="q-row" style={{ gap: '12px', alignItems: 'center', minWidth: 0 }}>
          <ContactAvatar name={person.name} size="md" />
          <div style={{ minWidth: 0 }}>
            <strong className="q-strong">{person.name}</strong>
            <div className="q-meta-sm" title={
              person.checkedInAt
                ? `In: ${exactly(person.checkedInAt, timezone)}${person.checkedOutAt ? `
Out: ${exactly(person.checkedOutAt, timezone)}` : ''}`
                : undefined
            }>
              {person.state === 'in' && `In since ${arrivedOn}, ${arrived}`}
              {person.state === 'out' && (spanned
                ? `${arrivedOn}, ${arrived} – ${departedOn}, ${departed}`
                : `${arrivedOn}, ${arrived} – ${departed}`)}
              {person.state === 'off' && 'Not one of their days'}
              {person.state === 'away' && (person.roles.length > 0
                ? person.roles.map((r) => r.name).join(', ')
                : person.title || 'Not in yet')}
            </div>
          </div>
        </div>

        {person.state === 'in' ? (
          <button className="q-btn q-btn-secondary" disabled={working}
            onClick={() => run(person, () => checkOut(person.employeeId), 'out')}>
            {working ? '…' : 'Going home'}
          </button>
        ) : (
          // Someone on their day off can still check in — they came in, and a
          // board that refused would be arguing with the room. It is just not
          // the button anyone reaches for first.
          <button
            className={`q-btn ${person.state === 'off' ? 'q-btn-secondary' : 'q-btn-primary'}`}
            disabled={working}
            onClick={() => run(person, () => checkIn(person.employeeId), 'in')}
          >
            {working ? '…' : person.state === 'out' ? 'Back' : person.state === 'off' ? 'In anyway' : "I'm in"}
          </button>
        )}
      </div>
    );
  };

  const Group = ({ title, people }: { title: string; people: AttendanceToday[] }) =>
    people.length === 0 ? null : (
      <section>
        <h2 className="q-section-title">{title} <span className="q-meta-sm">{people.length}</span></h2>
        <div className="q-stack q-stack-sm" style={{ marginTop: '8px' }}>
          {people.map((p) => <Row key={p.employeeId} person={p} />)}
        </div>
      </section>
    );

  return (
    <div className="q-stack q-stack-lg">
      {said && (
        <div
          className="q-note"
          role="status"
          style={{ borderColor: 'var(--q-color-primary)', display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}
        >
          <strong style={{ fontSize: '1.15rem' }}>{said.name}</strong>
          <span className="q-meta">
            {said.kind === 'pending' ? 'recording…'
              : said.kind === 'out' ? 'checked out at'
              : said.kind === 'already' ? 'was already in since'
              : 'checked in at'}
          </span>
          {said.at && (
            <>
              <strong className="q-num" style={{ fontSize: '1.35rem' }}>{timeOf(said.at, timezone)}</strong>
              <span className="q-meta-sm">{dateOf(said.at, timezone)}</span>
            </>
          )}
        </div>
      )}

      {/* Not in yet leads: at 8am that is the whole list, and it is the only
          group anyone taps first thing. Off today sits last — it is context,
          not something anyone is waiting on. */}
      <Group title="Not in yet" people={away} />
      <Group title="Here" people={here} />
      <Group title="Gone for the day" people={left} />
      <Group title="Off today" people={off} />
      <p className="q-meta-sm" style={{ opacity: 0.7 }}>
        Filed against {workDate} in {timezone}. Tapping twice changes nothing — one record a day, and
        coming back reopens it rather than starting a second one.
      </p>
    </div>
  );
}
