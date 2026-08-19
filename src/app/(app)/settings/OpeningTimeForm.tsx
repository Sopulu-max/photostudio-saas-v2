'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setStudioOpeningTime } from '@/modules/team/interface';

/**
 * When the studio opens — the line an arrival is early or late against.
 *
 * Sits beside the timezone because they are the same kind of fact: both are
 * the frame a check-in gets read in. The timezone decides which day a moment
 * belongs to; this decides whether that moment was on time.
 *
 * Empty is a real answer, and the reason there is a Clear button rather than
 * just a field. A studio without fixed hours has no opinion about lateness,
 * and the register should not invent one — an assumed 09:00 would mark real
 * people late against a number nobody chose.
 */
export function OpeningTimeForm({ current }: { current: string | null }) {
  const [opensAt, setOpensAt] = useState(current ?? '');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = opensAt !== (current ?? '');

  const save = (value: string) =>
    startTransition(async () => {
      try { await setStudioOpeningTime(value || null); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Could not save the opening time.'); }
    });

  return (
    <div className="q-stack q-stack-sm">
      <div className="q-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="q-input"
          type="time"
          value={opensAt}
          disabled={isPending}
          onChange={(e) => setOpensAt(e.target.value)}
          style={{ width: '9rem' }}
        />
        {dirty && (
          <>
            <button className="q-btn q-btn-primary" disabled={isPending} onClick={() => save(opensAt)}>
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => setOpensAt(current ?? '')}>
              Cancel
            </button>
          </>
        )}
        {!dirty && current && (
          <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => { setOpensAt(''); save(''); }}>
            Clear
          </button>
        )}
      </div>
      <span className="q-meta-sm">
        {current
          ? <>Anyone checking in after <strong>{current}</strong> is marked late on the attendance board.</>
          : <>Not set, so nobody is marked late. Set a time and the board starts saying who arrived after it.</>}
        {' '}Read in the studio&rsquo;s own timezone, and only ever applied to arrivals recorded from now on.
      </span>
    </div>
  );
}
