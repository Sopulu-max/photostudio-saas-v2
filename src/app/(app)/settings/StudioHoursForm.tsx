'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setWeeklyHours, addHoursException, removeHoursException } from '@/modules/team/interface';
import { WEEKDAYS } from '@/modules/team/weekdays';

/**
 * The hours this studio keeps.
 *
 * Two panels, because they are two different thoughts. The WEEK is the
 * schedule — seven rows, always all seven, whether or not the studio has said
 * anything about a given day. DAYS THAT ARE DIFFERENT are the exceptions to it:
 * a public holiday, or one occurrence of a weekday.
 *
 * Nothing here is supplied by the app. The rule a studio needs — a monthly
 * sanitation morning, a Friday half-day, a Sunday closure — is theirs to state,
 * and a studio that keeps none of them states nothing and nothing happens.
 *
 * The whole week saves at once. A day at a time would let a half-written
 * schedule reach the board, and the board is read by people at a door who
 * cannot tell a half-saved week from a wrong one.
 */

const OCCURRENCES = [
  { value: '-1', label: 'Last' },
  { value: '1', label: 'First' },
  { value: '2', label: 'Second' },
  { value: '3', label: 'Third' },
  { value: '4', label: 'Fourth' },
];

type Day = {
  weekday: number;
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
  stated: boolean;
};

type Exception = {
  id: string;
  label: string | null;
  onDate: string | null;
  weekday: number | null;
  weekOfMonth: number | null;
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
};

/** "Last Saturday of the month", "25 December 2026". */
function describe(e: Exception): string {
  if (e.onDate) {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(`${e.onDate}T00:00:00Z`));
  }
  const day = WEEKDAYS.find((d) => d.iso === e.weekday)?.long ?? 'day';
  const nth = OCCURRENCES.find((o) => o.value === String(e.weekOfMonth))?.label;
  return nth ? `${nth} ${day} of the month` : `Every ${day}`;
}

export function StudioHoursForm({
  week: initialWeek, exceptions,
}: {
  week: Day[];
  exceptions: Exception[];
}) {
  const [week, setWeek] = useState(initialWeek);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [scope, setScope] = useState<'weekday' | 'date'>('weekday');
  const [onDate, setOnDate] = useState('');
  const [exWeekday, setExWeekday] = useState('6');
  const [weekOfMonth, setWeekOfMonth] = useState('-1');
  const [exOpens, setExOpens] = useState('10:00');
  const [exCloses, setExCloses] = useState('');
  const [exClosed, setExClosed] = useState(false);

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'That could not be saved.'); }
    });

  const patch = (weekday: number, next: Partial<Day>) =>
    setWeek((w) => w.map((d) => (d.weekday === weekday ? { ...d, ...next } : d)));

  const dirty = JSON.stringify(week) !== JSON.stringify(initialWeek);

  const saveWeek = () => run(() => setWeeklyHours({
    days: week.map((d) => ({
      weekday: d.weekday,
      opensAt: d.opensAt,
      closesAt: d.closesAt,
      closed: d.closed,
    })),
  }));

  const addException = () => run(
    () => addHoursException({
      label,
      onDate: scope === 'date' ? onDate : null,
      weekday: scope === 'weekday' ? Number(exWeekday) : null,
      weekOfMonth: scope === 'weekday' ? Number(weekOfMonth) : null,
      opensAt: exClosed ? null : exOpens,
      closesAt: exClosed ? null : (exCloses || null),
      closed: exClosed,
    }),
    () => { setLabel(''); setAdding(false); },
  );

  return (
    <div className="q-stack q-stack-md">
      {/* ── The ordinary week ─────────────────────────────────────────────── */}
      <div className="q-stack q-stack-sm">
        {week.map((d) => {
          const name = WEEKDAYS.find((w) => w.iso === d.weekday)!;
          return (
            <div key={d.weekday} className="q-tile q-row" style={{ gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <strong className="q-strong" style={{ minWidth: '6.5rem' }}>{name.long}</strong>

              <label className="q-row q-meta-sm" style={{ gap: '6px', alignItems: 'center', minWidth: '6rem' }}>
                <input
                  type="checkbox"
                  checked={d.closed}
                  disabled={isPending}
                  onChange={(e) => patch(d.weekday, {
                    closed: e.target.checked,
                    ...(e.target.checked ? { opensAt: null, closesAt: null } : {}),
                  })}
                />
                Closed
              </label>

              {d.closed ? (
                <span className="q-meta-sm" style={{ opacity: 0.7 }}>The studio does not open.</span>
              ) : (
                <>
                  <span className="q-row" style={{ gap: '6px', alignItems: 'center' }}>
                    <span className="q-meta-sm">Opens</span>
                    <input
                      className="q-input q-input-sm" type="time" style={{ width: '7.5rem' }}
                      value={d.opensAt ?? ''} disabled={isPending}
                      onChange={(e) => patch(d.weekday, { opensAt: e.target.value || null })}
                    />
                  </span>
                  <span className="q-row" style={{ gap: '6px', alignItems: 'center' }}>
                    <span className="q-meta-sm">Closes</span>
                    <input
                      className="q-input q-input-sm" type="time" style={{ width: '7.5rem' }}
                      value={d.closesAt ?? ''} disabled={isPending}
                      onChange={(e) => patch(d.weekday, { closesAt: e.target.value || null })}
                    />
                  </span>
                  {/* Silence is not the same as an answer. A day nobody has
                      described falls through to the usual hours below, and
                      saying so stops it reading as "opens at midnight". */}
                  {!d.opensAt && (
                    <span className="q-meta-sm" style={{ opacity: 0.7 }}>Not stated — uses the usual hours.</span>
                  )}
                </>
              )}
            </div>
          );
        })}

        {dirty && (
          <div className="q-row">
            <button className="q-btn q-btn-primary" disabled={isPending} onClick={saveWeek}>
              {isPending ? 'Saving…' : 'Save the week'}
            </button>
            <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => setWeek(initialWeek)}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Days that break it ────────────────────────────────────────────── */}
      <div className="q-stack q-stack-sm">
        <h3 className="q-section-title" style={{ marginBottom: 0 }}>Days that are different</h3>
        <p className="q-meta" style={{ margin: 0 }}>
          A date — a public holiday, one day the power is out — or one occurrence of a weekday, such
          as the last Saturday of the month. These beat the week above, and a named date beats
          everything.
        </p>

        {exceptions.length === 0 ? (
          <p className="q-empty" style={{ margin: 0 }}>None. Every week runs the same.</p>
        ) : (
          exceptions.map((e) => (
            <div key={e.id} className="q-tile q-row q-row-between" style={{ alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span className="q-row" style={{ gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong className="q-strong">{e.label || describe(e)}</strong>
                {e.label && <span className="q-meta-sm">{describe(e)}</span>}
                {e.closed
                  ? <span className="q-badge q-badge-c-slate">Closed</span>
                  : <span className="q-badge q-badge-c-amber">{e.opensAt}{e.closesAt ? ` – ${e.closesAt}` : ''}</span>}
              </span>
              <button
                className="q-btn q-btn-secondary q-btn-xs"
                disabled={isPending}
                onClick={() => run(() => removeHoursException(e.id))}
              >
                Remove
              </button>
            </div>
          ))
        )}

        {!adding ? (
          <div className="q-row">
            <button className="q-btn q-btn-secondary" onClick={() => setAdding(true)}>+ Add a different day</button>
          </div>
        ) : (
          <div className="q-tile q-stack q-stack-sm">
            <div className="q-field">
              <label className="q-label">What to call it</label>
              <input
                className="q-input" value={label} autoFocus style={{ maxWidth: '20rem' }}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Sanitation, Christmas Day"
              />
              <span className="q-meta-sm">
                The board shows this on the day, so a different time explains itself.
              </span>
            </div>

            <div className="q-field">
              <label className="q-label">Which days</label>
              <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <select className="q-select" value={scope} disabled={isPending}
                  onChange={(e) => setScope(e.target.value as 'weekday' | 'date')}>
                  <option value="weekday">A day of the week</option>
                  <option value="date">One date</option>
                </select>

                {scope === 'date' ? (
                  <input className="q-input" type="date" value={onDate} disabled={isPending}
                    onChange={(e) => setOnDate(e.target.value)} style={{ maxWidth: '12rem' }} />
                ) : (
                  <>
                    <select className="q-select" value={weekOfMonth} disabled={isPending}
                      onChange={(e) => setWeekOfMonth(e.target.value)}>
                      {OCCURRENCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select className="q-select" value={exWeekday} disabled={isPending}
                      onChange={(e) => setExWeekday(e.target.value)}>
                      {WEEKDAYS.map((d) => <option key={d.iso} value={d.iso}>{d.long}</option>)}
                    </select>
                    <span className="q-meta-sm">of the month</span>
                  </>
                )}
              </div>
            </div>

            <div className="q-field">
              <label className="q-label">What happens</label>
              <div className="q-row" style={{ flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                <label className="q-row q-meta-sm" style={{ gap: '6px', alignItems: 'center' }}>
                  <input type="checkbox" checked={exClosed} disabled={isPending}
                    onChange={(e) => setExClosed(e.target.checked)} />
                  The studio is closed
                </label>
                {!exClosed && (
                  <>
                    <span className="q-meta-sm">Opens</span>
                    <input className="q-input q-input-sm" type="time" value={exOpens} disabled={isPending}
                      onChange={(e) => setExOpens(e.target.value)} style={{ width: '7.5rem' }} />
                    <span className="q-meta-sm">Closes</span>
                    <input className="q-input q-input-sm" type="time" value={exCloses} disabled={isPending}
                      onChange={(e) => setExCloses(e.target.value)} style={{ width: '7.5rem' }} />
                  </>
                )}
              </div>
            </div>

            <div className="q-row">
              <button
                className="q-btn q-btn-primary"
                disabled={isPending || !label.trim() || (scope === 'date' && !onDate)}
                onClick={addException}
              >
                {isPending ? 'Saving…' : 'Add'}
              </button>
              <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
