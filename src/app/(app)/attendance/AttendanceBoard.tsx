'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { checkIn, checkOut } from '@/modules/team/interface';
import type { AttendanceToday } from '@/modules/team/interface';
import { ContactAvatar } from '@/components/ContactAvatar';
import { WEEKDAYS } from '@/modules/team/weekdays';
import { toast, readableError } from '@/components/Toast';

/**
 * The attendance register.
 *
 * Built for a shared device at the studio entrance: rows are large targets and
 * each state is legible at a glance. No one signs in — the studio's device is
 * signed in, and the operator is recorded on each row.
 *
 * The time is typed on the row, beside the action. People forget to check in —
 * someone arrives at eight and taps at ten — so the field defaults to now and
 * is overwritten in four keystrokes. Recording and correcting are one step,
 * because they are one fact. Past days are corrected on the employee's profile.
 *
 * A record is a date and a time, not a time alone. This device is never closed,
 * so at 00:05 a bare "6:12 PM" reads as tonight when it means last night.
 */

/**
 * What each state looks like, in one place.
 *
 * The board had four groups distinguished only by their headings, so telling
 * "here" from "hasn't come" meant reading rather than glancing — on a screen by
 * a door, read at arm's length, in a hurry. The hue is a Lumen token and the
 * same one drives the row's badge and the count above it, so a card and the
 * rows beneath it cannot drift apart.
 */
const STATES = {
  in:   { label: 'Present',       count: 'Present',     badge: 'q-badge-c-green', card: 'q-stat-c-green' },
  away: { label: 'Not in yet',    count: 'Not in yet',  badge: 'q-badge-c-amber', card: 'q-stat-c-amber' },
  out:  { label: 'Checked out',   count: 'Checked out', badge: 'q-badge-c-blue',  card: 'q-stat-c-blue' },
  // Shorter on the card than on the row: four counts sit side by side and this
  // is the only label long enough to wrap, which drags its tile out of line.
  off:  { label: 'Not scheduled', count: 'Off today',   badge: 'q-badge-c-slate', card: 'q-stat-c-slate' },
} as const;

/** "12m late", "1h 20m late" — the number matters more than the precision. */
const lateness = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60 ? `${minutes % 60}m` : ''}`.trim() + ' late'
    : `${minutes}m late`;

const timeOf = (iso: string | null, timezone: string) =>
  iso
    ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(iso))
    : '';

const dateOf = (iso: string | null, timezone: string) =>
  iso
    ? new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: timezone }).format(new Date(iso))
    : '';

/** The full stamp, for a tooltip — to the second, when a rounded minute is not enough. */
const exactly = (iso: string | null, timezone: string) =>
  iso
    ? new Intl.DateTimeFormat(undefined, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: timezone,
      }).format(new Date(iso))
    : '';

export function AttendanceBoard({
  roster, workDate, timezone, isoWeekday, opensAt, closesAt, closed, openingLabel,
}: {
  roster: AttendanceToday[];
  workDate: string;
  timezone: string;
  /** Which weekday it is where the studio is — so the pips can mark today. */
  isoWeekday: number;
  /** "08:30", or null when the studio has not said — then nobody is late. */
  opensAt: string | null;
  /** "17:00", or null. Shown, never used to judge anyone: leaving early is a
      conversation, not a status a register should assign. */
  closesAt: string | null;
  /** The studio is shut today, so nobody is expected and nobody is late. */
  closed: boolean;
  /** Why today differs — "Sanitation", "Public holiday". Null on an ordinary day. */
  openingLabel: string | null;
}) {
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  /*
   * Pressing the button asks for the time before recording anything.
   *
   * Nobody taps a register at the moment they walk in. They arrive, put their
   * bag down, talk to someone, and reach the screen twenty minutes later — so
   * recording the moment of the tap records the wrong thing. The button opens a
   * field instead, showing the current time as the likely answer, and nothing is
   * written until it is confirmed.
   *
   * Always prefilled with the current time, never with what the record already
   * holds. The field answers "what time is it now, and is that when this
   * happened" — the common case by a wide margin — so the studio confirms or
   * types over it.
   *
   * The consequence, chosen deliberately: confirming a check-in on a day that
   * was already closed records the confirmed time as the arrival. Someone back
   * from lunch who confirms without reading replaces the morning. The record
   * holds one arrival and one departure per day, so a return has nowhere else
   * to go, and what is confirmed on screen is what gets stored.
   */
  const [asking, setAsking] = useState<{ employeeId: string; kind: 'in' | 'out'; time: string } | null>(null);
  const [nowLocal, setNowLocal] = useState('');

  useEffect(() => {
    const read = () => setNowLocal(
      new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date())
    );
    read();
    const tick = setInterval(read, 15000);
    return () => clearInterval(tick);
  }, [timezone]);

  const ask = (person: AttendanceToday, kind: 'in' | 'out') =>
    setAsking({ employeeId: person.employeeId, kind, time: nowLocal });

  /*
   * Confirmation of what was recorded.
   *
   * The interaction lasts two seconds and the person walks away, so the recorded
   * time is stated back explicitly rather than implied by a row moving between
   * groups. The time comes from the server, never from this device's clock — a
   * board with a drifting clock would confirm a time the record does not hold.
   */
  const [confirmation, setConfirmation] = useState<
    { name: string; kind: 'in' | 'out' | 'already' | 'saving'; at: string | null }
  | null>(null);

  useEffect(() => {
    // A saving message stays until the result replaces it. Clearing it on a
    // timer would blank the message mid-request, which reads as failure.
    if (!confirmation || confirmation.kind === 'saving') return;
    const clear = setTimeout(() => setConfirmation(null), 8000);
    return () => clearTimeout(clear);
  }, [confirmation]);

  /*
   * Recording a check-in is several sequential round trips to the database, so
   * the action is acknowledged immediately and the confirmed time replaces the
   * acknowledgement when the server answers. `setConfirmation` stays outside the
   * transition so it is not held behind the board reloading afterwards.
   */
  const run = async (
    person: AttendanceToday,
    fn: () => Promise<{ at?: string; alreadyIn?: boolean } | unknown>,
    kind: 'in' | 'out',
  ) => {
    setBusy(person.employeeId);
    setConfirmation({ name: person.name, kind: 'saving', at: null });
    try {
      const result = (await fn()) as { at?: string; alreadyIn?: boolean } | undefined;
      setConfirmation({
        name: person.name,
        kind: kind === 'in' && result?.alreadyIn ? 'already' : kind,
        at: result?.at ?? null,
      });
      setAsking(null);
      startTransition(() => { router.refresh(); });
    } catch (e: any) {
      setConfirmation(null);
      toast.bad(readableError(e, 'The change could not be saved.'));
    } finally {
      setBusy(null);
    }
  };

  const present = roster.filter((r) => r.state === 'in');
  const departed = roster.filter((r) => r.state === 'out');
  const expected = roster.filter((r) => r.state === 'away');
  const notScheduled = roster.filter((r) => r.state === 'off');
  // Everyone the studio can currently say arrived late — which is nobody at
  // all until an opening time exists.
  const lateToday = roster.filter((r) => r.lateBy !== null).length;

  if (roster.length === 0) {
    return (
      <p className="q-empty">
        No employees yet — <a className="q-accent" href="/team">add your team</a> to begin recording attendance.
      </p>
    );
  }

  /**
   * The room at a glance, before any names.
   *
   * The page said "3 present, 2 expected" in a sentence. A sentence is read;
   * numbers are seen. Expected leads because first thing in the morning it is
   * the only figure anyone is acting on.
   */
  const Counts = () => (
    <div className="q-count-grid">
      {([
        ['away', expected.length],
        ['in', present.length],
        ['out', departed.length],
        ['off', notScheduled.length],
      ] as const).map(([state, n]) => (
        <div key={state} className={`q-stat-card ${STATES[state].card} q-rise`}>
          <div className="q-stat-label">{STATES[state].count}</div>
          <div className="q-stat-value-lg">{n}</div>
        </div>
      ))}
      {/* Only a studio that has said when it opens gets a late count. Without
          an opening time there is no line to be late against, and a permanent
          zero would imply one exists. */}
      {opensAt && !closed && (
        <div className="q-stat-card q-stat-c-red q-rise">
          <div className="q-stat-label">Late</div>
          <div className="q-stat-value-lg">{lateToday}</div>
        </div>
      )}
    </div>
  );

  /**
   * Which days are theirs, and whether today is one.
   *
   * The roster has carried `workingDays` since working days were built and the
   * board never showed it, so "not scheduled" was an assertion you had to take
   * on trust. Seven pips make it checkable without leaving the screen. Someone
   * whose week nobody has stated has nothing to draw.
   */
  const DayPips = ({ person }: { person: AttendanceToday }) =>
    person.workingDays.length === 0 ? null : (
      <div className="q-daypips" title="The days this person works">
        {WEEKDAYS.map((d) => {
          const theirs = person.workingDays.includes(d.iso);
          const today = d.iso === isoWeekday;
          return (
            <span
              key={d.iso}
              className={`q-daypip ${theirs ? (today ? 'q-daypip-today' : 'q-daypip-on') : ''}`}
              title={d.long}
            >
              {d.short}
            </span>
          );
        })}
      </div>
    );

  const Row = ({ person }: { person: AttendanceToday }) => {
    const working = busy === person.employeeId;
    const arrived = timeOf(person.checkedInAt, timezone);
    const left = timeOf(person.checkedOutAt, timezone);
    const arrivedOn = dateOf(person.checkedInAt, timezone);
    const leftOn = dateOf(person.checkedOutAt, timezone);
    // The date is repeated only when the two differ — a shift that ran past
    // midnight. Repeating it on a normal day is noise.
    const spanned = !!leftOn && leftOn !== arrivedOn;
    const key = person.employeeId;
    const prompting = asking?.employeeId === key ? asking : null;

    return (
      <div className="q-tile q-stack q-stack-sm">
        <div className="q-row q-row-between" style={{ flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div className="q-row" style={{ gap: '12px', alignItems: 'center', minWidth: 0 }}>
            <ContactAvatar name={person.name} url={person.avatarUrl} size="md" />
            <div style={{ minWidth: 0 }}>
              {/*
                * Roles sit beside the name in every state.
                *
                * They used to appear only for people who had not arrived, so
                * checking someone in removed the one piece of information that
                * says what they can do — and "four people are here, is one of
                * them a photographer" became unanswerable on the screen that
                * knows the answer. What someone does is true whether or not
                * they have turned up, so it belongs to the name, not the state.
                */}
              <span className="q-row" style={{ gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong className="q-strong">{person.name}</strong>
                <span className={`q-badge ${STATES[person.state].badge}`}>
                  {STATES[person.state].label}
                </span>
                {/* How late, not just that they were. "12m" and "two hours"
                    are different conversations, and the board knows which. */}
                {person.lateBy !== null && (
                  <span className="q-badge q-badge-c-red" title={`Arrived after ${opensAt}`}>
                    {lateness(person.lateBy)}
                  </span>
                )}
                {person.roles.map((r) => (
                  <span key={r.id} className="q-badge q-badge-neutral">{r.name}</span>
                ))}
              </span>
              <div className="q-meta-sm" title={
                person.checkedInAt
                  ? `Check-in: ${exactly(person.checkedInAt, timezone)}${person.checkedOutAt ? `\nCheck-out: ${exactly(person.checkedOutAt, timezone)}` : ''}`
                  : undefined
              }>
                {person.state === 'in' && `Checked in ${arrivedOn}, ${arrived}`}
                {person.state === 'out' && (spanned
                  ? `${arrivedOn}, ${arrived} – ${leftOn}, ${left}`
                  : `${arrivedOn}, ${arrived} – ${left}`)}
                {person.state === 'off' && 'Not scheduled today'}
                {person.state === 'away' && 'Not checked in'}
              </div>
              <div style={{ marginTop: '6px' }}>
                <DayPips person={person} />
              </div>
            </div>
          </div>

          <div className="q-row" style={{ gap: '8px', alignItems: 'center' }}>
            {person.state === 'in' ? (
              <button className="q-btn q-btn-secondary" disabled={working || !!prompting}
                onClick={() => ask(person, 'out')}>
                Check out
              </button>
            ) : (
              // Someone not scheduled today can still check in — the register
              // records what happened. It is simply not the primary action.
              <button
                className={`q-btn ${person.state === 'off' ? 'q-btn-secondary' : 'q-btn-primary'}`}
                disabled={working || !!prompting}
                onClick={() => ask(person, 'in')}
              >
                Check in
              </button>
            )}
          </div>
        </div>

        {prompting && (
          <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
            <label className="q-meta-sm" htmlFor={`t-${key}`} style={{ minWidth: '7.5rem' }}>
              {prompting.kind === 'in' ? 'Time they arrived' : 'Time they left'}
            </label>
            <input
              id={`t-${key}`}
              className="q-input q-input-sm"
              type="time"
              autoFocus
              value={prompting.time}
              disabled={working}
              onChange={(e) => setAsking({ ...prompting, time: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Escape') setAsking(null); }}
              style={{ width: '8rem' }}
            />
            {/* Said before it is recorded, not after. Both are "HH:MM" wall
                clock in the same studio's day, so comparing the strings is
                exact — no timezone arithmetic, nothing to get wrong. */}
            {prompting.kind === 'in' && opensAt && prompting.time > opensAt && (
              <span className="q-badge q-badge-c-red">Late</span>
            )}
            <button
              className="q-btn q-btn-primary"
              disabled={working || !prompting.time}
              onClick={() => run(
                person,
                () => (prompting.kind === 'in'
                  ? checkIn(person.employeeId, prompting.time)
                  : checkOut(person.employeeId, prompting.time)),
                prompting.kind,
              )}
            >
              {working ? 'Saving…' : prompting.kind === 'in' ? 'Check in' : 'Check out'}
            </button>
            <button className="q-btn q-btn-secondary" disabled={working} onClick={() => setAsking(null)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  };

  const Group = ({ title, people }: { title: string; people: AttendanceToday[] }) =>
    people.length === 0 ? null : (
      <section>
        <h2 className="q-section-title">{title} <span className="q-meta-sm">{people.length}</span></h2>
        <div className="q-stack q-stack-sm" style={{ marginTop: '8px' }}>
          {people.map((p) => (
            <div key={p.employeeId} className="q-rise">
              <Row person={p} />
            </div>
          ))}
        </div>
      </section>
    );

  return (
    <div className="q-stack q-stack-lg">
      {confirmation && (
        <div
          className="q-note"
          role="status"
          style={{ borderColor: 'var(--q-color-primary)', display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}
        >
          <strong style={{ fontSize: '1.15rem' }}>{confirmation.name}</strong>
          <span className="q-meta">
            {confirmation.kind === 'saving' ? 'Saving…'
              : confirmation.kind === 'out' ? 'checked out at'
              : confirmation.kind === 'already' ? 'was already checked in at'
              : 'checked in at'}
          </span>
          {confirmation.at && (
            <>
              <strong className="q-num" style={{ fontSize: '1.35rem' }}>{timeOf(confirmation.at, timezone)}</strong>
              <span className="q-meta-sm">{dateOf(confirmation.at, timezone)}</span>
            </>
          )}
        </div>
      )}

      {/*
        * Why today is different, said before the counts.
        *
        * A board that opens at ten on one Saturday a month and half past eight
        * the rest looks broken unless it says which rule applied. The studio
        * named the rule; this repeats the name back on the day it bites, so a
        * later opening reads as intended rather than as a fault.
        */}
      {(openingLabel || closed) && (
        <p className="q-note" role="status" style={{ margin: 0 }}>
          {openingLabel && <strong>{openingLabel}</strong>}{openingLabel ? ' — ' : ''}
          {closed
            ? 'The studio is closed today. No attendance is expected and no one is marked late. Staff who come in can still be checked in.'
            : `the studio is open ${opensAt}${closesAt ? ` – ${closesAt}` : ''} today rather than its usual hours.`}
        </p>
      )}

      <Counts />

      {/* Expected leads: first thing in the morning that is the whole list, and
          the only group anyone acts on. Not scheduled sits last, as context. */}
      <Group title="Expected" people={expected} />
      <Group title="Present" people={present} />
      <Group title="Checked out" people={departed} />
      <Group title="Not scheduled" people={notScheduled} />

      <p className="q-meta-sm" style={{ opacity: 0.7 }}>
        Recorded against {workDate} in {timezone}. One record per employee per day: checking in twice
        makes no difference, and checking in again after checking out reopens the same record.
      </p>
    </div>
  );
}
