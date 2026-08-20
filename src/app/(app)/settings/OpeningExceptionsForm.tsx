'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addOpeningException, removeOpeningException } from '@/modules/team/interface';
import { WEEKDAYS } from '@/modules/team/weekdays';

/**
 * Days the studio does not open at its usual time.
 *
 * The case that prompted this: in Nigeria the last Saturday of the month is
 * sanitation and businesses open at 10:00. That is not built in — a studio that
 * works through it says nothing and nothing happens, and a studio elsewhere
 * never hears about it. What is built in is the shape: on days matching a rule,
 * this studio opens later, or not at all.
 *
 * Two scopes, because they answer the same question at different scales. A
 * DATE is Christmas, or one Tuesday the power went. A DAY OF THE WEEK is
 * Saturdays, optionally narrowed to which one in the month — which is exactly
 * what "last Saturday" means, said generally.
 *
 * The more specific rule wins, and the list is ordered the way the database
 * resolves it, so what you see at the top is what happens first.
 */

const OCCURRENCES = [
  { value: '', label: 'Every' },
  { value: '1', label: 'First' },
  { value: '2', label: 'Second' },
  { value: '3', label: 'Third' },
  { value: '4', label: 'Fourth' },
  { value: '-1', label: 'Last' },
];

type Exception = {
  id: string;
  label: string;
  onDate: string | null;
  weekday: number | null;
  weekOfMonth: number | null;
  opensAt: string | null;
  closed: boolean;
};

/** "Last Saturday of the month", "Every Tuesday", "25 December 2026". */
function describe(e: Exception): string {
  if (e.onDate) {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(`${e.onDate}T00:00:00Z`));
  }
  const day = WEEKDAYS.find((d) => d.iso === e.weekday)?.long ?? 'day';
  if (e.weekOfMonth === null) return `Every ${day}`;
  const nth = OCCURRENCES.find((o) => o.value === String(e.weekOfMonth))?.label ?? '';
  return `${nth} ${day} of the month`;
}

export function OpeningExceptionsForm({ exceptions }: { exceptions: Exception[] }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [scope, setScope] = useState<'weekday' | 'date'>('weekday');
  const [onDate, setOnDate] = useState('');
  const [weekday, setWeekday] = useState('6');
  const [weekOfMonth, setWeekOfMonth] = useState('-1');
  const [opensAt, setOpensAt] = useState('10:00');
  const [closed, setClosed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'That could not be saved.'); }
    });

  const submit = () => run(
    () => addOpeningException({
      label,
      onDate: scope === 'date' ? onDate : null,
      weekday: scope === 'weekday' ? Number(weekday) : null,
      weekOfMonth: scope === 'weekday' && weekOfMonth !== '' ? Number(weekOfMonth) : null,
      opensAt: closed ? null : opensAt,
      closed,
    }),
    () => { setLabel(''); setOpen(false); },
  );

  return (
    <div className="q-stack q-stack-sm">
      {exceptions.length === 0 ? (
        <p className="q-empty" style={{ margin: 0 }}>
          None. The studio opens at its usual time every day.
        </p>
      ) : (
        <div className="q-stack q-stack-sm">
          {exceptions.map((e) => (
            <div key={e.id} className="q-tile q-row q-row-between" style={{ alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span className="q-row" style={{ gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong className="q-strong">{e.label}</strong>
                <span className="q-meta-sm">{describe(e)}</span>
                {e.closed
                  ? <span className="q-badge q-badge-c-slate">Closed</span>
                  : <span className="q-badge q-badge-c-amber">Opens {e.opensAt}</span>}
              </span>
              <button
                className="q-btn q-btn-secondary q-btn-xs"
                disabled={isPending}
                onClick={() => run(() => removeOpeningException(e.id))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <div className="q-row">
          <button className="q-btn q-btn-secondary" onClick={() => setOpen(true)}>+ Add a different day</button>
        </div>
      ) : (
        <div className="q-tile q-stack q-stack-sm">
          <div className="q-field">
            <label className="q-label">What to call it</label>
            <input
              className="q-input"
              value={label}
              autoFocus
              onChange={(ev) => setLabel(ev.target.value)}
              placeholder="e.g. Sanitation"
              style={{ maxWidth: '20rem' }}
            />
            <span className="q-meta-sm">The board shows this name on the day, so the different time explains itself.</span>
          </div>

          <div className="q-field">
            <label className="q-label">Which days</label>
            <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <select className="q-select" value={scope} onChange={(ev) => setScope(ev.target.value as 'weekday' | 'date')} disabled={isPending}>
                <option value="weekday">A day of the week</option>
                <option value="date">One date</option>
              </select>

              {scope === 'date' ? (
                <input className="q-input" type="date" value={onDate} onChange={(ev) => setOnDate(ev.target.value)} disabled={isPending} style={{ maxWidth: '12rem' }} />
              ) : (
                <>
                  <select className="q-select" value={weekOfMonth} onChange={(ev) => setWeekOfMonth(ev.target.value)} disabled={isPending}>
                    {OCCURRENCES.map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
                  </select>
                  <select className="q-select" value={weekday} onChange={(ev) => setWeekday(ev.target.value)} disabled={isPending}>
                    {WEEKDAYS.map((d) => <option key={d.iso} value={d.iso}>{d.long}</option>)}
                  </select>
                  {weekOfMonth !== '' && <span className="q-meta-sm">of the month</span>}
                </>
              )}
            </div>
          </div>

          <div className="q-field">
            <label className="q-label">What happens</label>
            <div className="q-row" style={{ flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
              <label className="q-row q-meta-sm" style={{ gap: '6px', alignItems: 'center' }}>
                <input type="checkbox" checked={closed} onChange={(ev) => setClosed(ev.target.checked)} disabled={isPending} />
                The studio is closed
              </label>
              {!closed && (
                <>
                  <span className="q-meta-sm">Opens at</span>
                  <input className="q-input q-input-sm" type="time" value={opensAt} onChange={(ev) => setOpensAt(ev.target.value)} disabled={isPending} style={{ width: '8rem' }} />
                </>
              )}
            </div>
          </div>

          <div className="q-row">
            <button className="q-btn q-btn-primary" disabled={isPending || !label.trim() || (scope === 'date' && !onDate)} onClick={submit}>
              {isPending ? 'Saving…' : 'Add'}
            </button>
            <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
