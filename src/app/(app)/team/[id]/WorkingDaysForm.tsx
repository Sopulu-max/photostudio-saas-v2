'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setWorkingDays } from '@/modules/team/interface';
import { WEEKDAYS } from '@/modules/team/weekdays';

/**
 * The days of the week this employee normally works.
 *
 * Seven toggles. This is one of the few genuinely closed sets in this system —
 * closed by the calendar rather than by configuration — so unlike almost every
 * other list here, it offers no way to extend it.
 *
 * An empty selection means "not recorded", not "works no days". Employees
 * without a schedule are treated as potentially present on any day and are
 * never marked as not scheduled. Clearing is therefore offered explicitly.
 */
export function WorkingDaysForm({
  employeeId, initial, name,
}: {
  employeeId: string;
  initial: number[];
  name: string;
}) {
  const [days, setDays] = useState<number[]>(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const same =
    days.length === initial.length && days.every((d) => initial.includes(d));

  const toggle = (iso: number) =>
    setDays((prev) => (prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso].sort((a, b) => a - b)));

  const save = () =>
    startTransition(async () => {
      try { await setWorkingDays({ employeeId, days }); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Could not save their week.'); }
    });

  const offDays = WEEKDAYS.filter((d) => !days.includes(d.iso));

  return (
    <div className="q-stack q-stack-sm">
      <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
        {WEEKDAYS.map((d) => {
          const on = days.includes(d.iso);
          return (
            <button
              key={d.iso}
              type="button"
              disabled={isPending}
              aria-pressed={on}
              title={on ? `${d.long}: working` : `${d.long}: day off`}
              className={`q-badge ${on ? 'q-badge-accent' : 'q-badge-neutral'}`}
              style={{ cursor: 'pointer', minWidth: '3.2rem', justifyContent: 'center' }}
              onClick={() => toggle(d.iso)}
            >
              {d.short}
            </button>
          );
        })}
      </div>

      <span className="q-meta-sm" style={{ opacity: 0.8 }}>
        {days.length === 0
          ? `No schedule recorded for ${name}. They will appear as expected on any day.`
          : offDays.length === 0
            ? 'Works every day.'
            : `Days off: ${offDays.map((d) => d.long).join(', ')}.`}
      </span>

      {!same && (
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending} onClick={save}>
            {isPending ? 'Saving…' : 'Save schedule'}
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" disabled={isPending} onClick={() => setDays(initial)}>
            Cancel
          </button>
        </div>
      )}
      {same && days.length > 0 && (
        <button className="q-btn-ghost q-meta-sm" style={{ padding: 0, textAlign: 'left' }}
          disabled={isPending} onClick={() => setDays([])}>
          Clear schedule
        </button>
      )}
    </div>
  );
}
