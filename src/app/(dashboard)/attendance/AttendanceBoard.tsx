'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { checkIn, checkOut, adjustAttendance } from '@/modules/team/interface';
import type { AttendanceToday } from '@/modules/team/interface';
import { ContactAvatar } from '@/components/ContactAvatar';

/**
 * The attendance register.
 *
 * Built for a shared device at the studio entrance: rows are large targets and
 * each state is legible at a glance. No one signs in — the studio's device is
 * signed in, and the operator is recorded on each row.
 *
 * Recorded times are editable. People forget to check in; someone arrives at
 * eight and remembers at ten. A register that cannot be corrected gets worked
 * around rather than used.
 *
 * A record is a date and a time, not a time alone. This device is never closed,
 * so at 00:05 a bare "6:12 PM" reads as tonight when it means last night.
 */

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

/** "HH:MM" in the studio's timezone — the value a time input expects. */
const inputTime = (iso: string | null, timezone: string) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(iso))
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
  const [editing, setEditing] = useState<string | null>(null);
  const router = useRouter();

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
      startTransition(() => { router.refresh(); });
    } catch (e: any) {
      setConfirmation(null);
      alert(e?.message || 'The change could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const present = roster.filter((r) => r.state === 'in');
  const departed = roster.filter((r) => r.state === 'out');
  const expected = roster.filter((r) => r.state === 'away');
  const notScheduled = roster.filter((r) => r.state === 'off');

  if (roster.length === 0) {
    return (
      <p className="q-empty">
        No employees yet — <a className="q-accent" href="/team">add your team</a> to begin recording attendance.
      </p>
    );
  }

  const EditTimes = ({ person }: { person: AttendanceToday }) => {
    const [inAt, setInAt] = useState(inputTime(person.checkedInAt, timezone));
    const [outAt, setOutAt] = useState(inputTime(person.checkedOutAt, timezone));
    const [saving, setSaving] = useState(false);

    const save = async () => {
      if (!person.attendanceId) return;
      setSaving(true);
      try {
        await adjustAttendance({
          attendanceId: person.attendanceId,
          checkedInAt: inAt,
          checkedOutAt: outAt || null,
        });
        setEditing(null);
        startTransition(() => { router.refresh(); });
      } catch (e: any) {
        alert(e?.message || 'The change could not be saved.');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="q-stack q-stack-sm" style={{ width: '100%', marginTop: '4px' }}>
        <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <label className="q-meta-sm" style={{ minWidth: '5rem' }}>Check-in</label>
          <input className="q-input q-input-sm" type="time" value={inAt}
            onChange={(e) => setInAt(e.target.value)} disabled={saving} style={{ width: '8rem' }} />
        </div>
        <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <label className="q-meta-sm" style={{ minWidth: '5rem' }}>Check-out</label>
          <input className="q-input q-input-sm" type="time" value={outAt}
            onChange={(e) => setOutAt(e.target.value)} disabled={saving} style={{ width: '8rem' }} />
          {outAt && (
            <button className="q-btn-ghost q-meta-sm" style={{ padding: 0 }} disabled={saving}
              onClick={() => setOutAt('')}>
              Clear
            </button>
          )}
        </div>
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" disabled={saving || !inAt} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" disabled={saving} onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
        <span className="q-meta-sm" style={{ opacity: 0.7 }}>
          Times are in {timezone}. Clearing the check-out time marks them as still present.
        </span>
      </div>
    );
  };

  const Row = ({ person }: { person: AttendanceToday }) => {
    const working = busy === person.employeeId;
    const arrived = timeOf(person.checkedInAt, timezone);
    const left = timeOf(person.checkedOutAt, timezone);
    const arrivedOn = dateOf(person.checkedInAt, timezone);
    const leftOn = dateOf(person.checkedOutAt, timezone);
    // The date is repeated only when the two differ — a shift that ran past
    // midnight. Repeating it on a normal day is noise.
    const spanned = !!leftOn && leftOn !== arrivedOn;
    const isEditing = editing === person.employeeId;

    return (
      <div className="q-tile q-stack q-stack-sm">
        <div className="q-row q-row-between" style={{ flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div className="q-row" style={{ gap: '12px', alignItems: 'center', minWidth: 0 }}>
            <ContactAvatar name={person.name} size="md" />
            <div style={{ minWidth: 0 }}>
              <strong className="q-strong">{person.name}</strong>
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
                {person.state === 'away' && (person.roles.length > 0
                  ? person.roles.map((r) => r.name).join(', ')
                  : person.title || 'Not checked in')}
              </div>
            </div>
          </div>

          <div className="q-row" style={{ gap: '8px' }}>
            {person.attendanceId && !isEditing && (
              <button className="q-btn q-btn-secondary q-btn-sm" disabled={working}
                onClick={() => setEditing(person.employeeId)}>
                Edit times
              </button>
            )}
            {person.state === 'in' ? (
              <button className="q-btn q-btn-secondary" disabled={working}
                onClick={() => run(person, () => checkOut(person.employeeId), 'out')}>
                {working ? 'Saving…' : 'Check out'}
              </button>
            ) : (
              // Someone not scheduled today can still check in — the register
              // records what happened. It is simply not the primary action.
              <button
                className={`q-btn ${person.state === 'off' ? 'q-btn-secondary' : 'q-btn-primary'}`}
                disabled={working}
                onClick={() => run(person, () => checkIn(person.employeeId), 'in')}
              >
                {working ? 'Saving…' : 'Check in'}
              </button>
            )}
          </div>
        </div>

        {isEditing && <EditTimes person={person} />}
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
