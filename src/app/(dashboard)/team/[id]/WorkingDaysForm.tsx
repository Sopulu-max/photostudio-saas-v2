'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setWorkingDays } from '@/modules/team/interface';
import { WEEKDAYS } from '@/modules/team/weekdays';

/**
 * Which days of the week this person normally works.
 *
 * Seven toggles, because there are seven days and there is no eighth. This is
 * one of the few genuinely closed sets in this app — closed by the calendar
 * rather than by anyone's opinion — so unlike almost every other list here it
 * offers no way to add to it, and shouldn't.
 *
 * Saying nothing is a real answer. An empty week means "never stated", and the
 * attendance board treats those people exactly as it did before anyone
 * described their week: possibly in, never marked off. That is why clearing it
 * is offered plainly rather than hidden — going back to not knowing is a move a
 * studio is allowed to make.
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
              title={on ? `${d.long} — working` : `${d.long} — off`}
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
          ? `Nothing said about ${name}'s week — they'll show as possibly in on any day, never as off.`
          : offDays.length === 0
            ? 'In every day.'
            : `Off ${offDays.map((d) => d.long).join(', ')}.`}
      </span>

      {!same && (
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending} onClick={save}>
            {isPending ? 'Saving…' : 'Save their week'}
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" disabled={isPending} onClick={() => setDays(initial)}>
            Cancel
          </button>
        </div>
      )}
      {same && days.length > 0 && (
        <button className="q-btn-ghost q-meta-sm" style={{ padding: 0, textAlign: 'left' }}
          disabled={isPending} onClick={() => setDays([])}>
          Clear — go back to not knowing
        </button>
      )}
    </div>
  );
}
