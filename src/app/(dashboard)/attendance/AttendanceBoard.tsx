'use client';

import React, { useState, useTransition } from 'react';
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

const timeOf = (iso: string | null, timezone: string) =>
  iso
    ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(iso))
    : '';

export function AttendanceBoard({
  roster, workDate, timezone,
}: {
  roster: AttendanceToday[];
  workDate: string;
  timezone: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  const run = (employeeId: string, fn: () => Promise<unknown>) => {
    setBusy(employeeId);
    startTransition(async () => {
      try { await fn(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'That didn’t work.'); }
      finally { setBusy(null); }
    });
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
    const working = busy === person.employeeId && isPending;
    const arrived = timeOf(person.checkedInAt, timezone);
    const departed = timeOf(person.checkedOutAt, timezone);

    return (
      <div className="q-tile q-row q-row-between" style={{ flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        <div className="q-row" style={{ gap: '12px', alignItems: 'center', minWidth: 0 }}>
          <ContactAvatar name={person.name} size="md" />
          <div style={{ minWidth: 0 }}>
            <strong className="q-strong">{person.name}</strong>
            <div className="q-meta-sm">
              {person.state === 'in' && `In since ${arrived}`}
              {person.state === 'out' && `${arrived} – ${departed}`}
              {person.state === 'off' && 'Not one of their days'}
              {person.state === 'away' && (person.roles.length > 0
                ? person.roles.map((r) => r.name).join(', ')
                : person.title || 'Not in yet')}
            </div>
          </div>
        </div>

        {person.state === 'in' ? (
          <button className="q-btn q-btn-secondary" disabled={working}
            onClick={() => run(person.employeeId, () => checkOut(person.employeeId))}>
            {working ? '…' : 'Going home'}
          </button>
        ) : (
          // Someone on their day off can still check in — they came in, and a
          // board that refused would be arguing with the room. It is just not
          // the button anyone reaches for first.
          <button
            className={`q-btn ${person.state === 'off' ? 'q-btn-secondary' : 'q-btn-primary'}`}
            disabled={working}
            onClick={() => run(person.employeeId, () => checkIn(person.employeeId))}
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
