'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adjustAttendance } from '@/modules/team/interface';
import { toast, readableError } from '@/components/Toast';

/**
 * One employee's recorded days, each correctable.
 *
 * The register argument applies here more than on the board: mistakes are
 * usually noticed later. Someone realises on Wednesday that Monday's check-out
 * never happened, and correcting today is no use to them. The board could
 * already fix the current day; this is the other thirteen.
 *
 * Times are entered as wall-clock in the studio's timezone and resolved against
 * each record's own working day on the server, so correcting a past Tuesday
 * uses that Tuesday's offset rather than today's.
 */

type Day = {
  id: string;
  workDate: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  minutes: number | null;
  /** Who last recorded or corrected this day, if it is known. */
  recordedBy: string | null;
};

export function AttendanceHistory({
  days, timezone,
}: {
  days: Day[];
  timezone: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const asDay = (day: string) =>
    new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
      .format(new Date(`${day}T00:00:00Z`));

  const asTime = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(iso)) : '';

  const asInput = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(iso)) : '';

  const asSpan = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim() : `${m}m`);

  const Editor = ({ day }: { day: Day }) => {
    const [inAt, setInAt] = useState(asInput(day.checkedInAt));
    const [outAt, setOutAt] = useState(asInput(day.checkedOutAt));
    const [saving, setSaving] = useState(false);

    const save = async () => {
      setSaving(true);
      try {
        await adjustAttendance({ attendanceId: day.id, checkedInAt: inAt, checkedOutAt: outAt || null });
        setEditing(null);
        startTransition(() => { router.refresh(); });
      } catch (e: any) {
        toast.bad(readableError(e, 'The change could not be saved.'));
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="q-stack q-stack-sm" style={{ width: '100%', marginTop: '8px' }}>
        <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <label className="q-meta-sm" style={{ minWidth: '5rem' }}>Check-in</label>
          <input className="q-input q-input-sm" type="time" value={inAt} disabled={saving}
            onChange={(e) => setInAt(e.target.value)} style={{ width: '8rem' }} />
        </div>
        <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <label className="q-meta-sm" style={{ minWidth: '5rem' }}>Check-out</label>
          <input className="q-input q-input-sm" type="time" value={outAt} disabled={saving}
            onChange={(e) => setOutAt(e.target.value)} style={{ width: '8rem' }} />
          {outAt && (
            <button className="q-btn-ghost q-meta-sm" style={{ padding: 0 }} disabled={saving}
              onClick={() => setOutAt('')}>Clear</button>
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
          Times are in {timezone}. Clearing the check-out time marks the day as still open. Saving
          records you as the person who last corrected this day.
        </span>
      </div>
    );
  };

  return (
    <div className="q-stack q-stack-sm">
      {days.map((a) => (
        <div key={a.id} className="q-tile q-stack q-stack-sm">
          <div className="q-row q-row-between" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <strong className="q-strong">{asDay(a.workDate)}</strong>
            <span className="q-row" style={{ gap: '10px', alignItems: 'center' }}>
              <span className="q-meta-sm">
                {asTime(a.checkedInAt)}
                {a.checkedOutAt ? ` – ${asTime(a.checkedOutAt)}` : ''}
              </span>
              {a.minutes != null
                ? <span className="q-badge q-badge-neutral">{asSpan(a.minutes)}</span>
                : <span className="q-badge q-badge-success">Present</span>}
              {/* A shared device means anyone can tap any name, so a time with
                  nobody's name on it is a time nobody can question. Rows from
                  before this was kept simply have no one to name. */}
              {a.recordedBy && (
                <span className="q-meta-sm" style={{ opacity: 0.7 }}>by {a.recordedBy}</span>
              )}
              {editing !== a.id && (
                <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => setEditing(a.id)}>
                  Edit
                </button>
              )}
            </span>
          </div>
          {editing === a.id && <Editor day={a} />}
        </div>
      ))}
    </div>
  );
}
