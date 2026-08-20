'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setStudioDefaultHours } from '@/modules/team/interface';

/**
 * The studio's usual hours — the answer for any day the week does not cover.
 *
 * Sits beside the timezone because they are the same kind of fact: both are the
 * frame a check-in gets read in. The timezone decides which day a moment
 * belongs to; this decides whether that moment was on time.
 *
 * Beneath everything else. A studio that fills in only this keeps the same
 * hours every day, which is a real and common answer. A studio that describes
 * its week never reaches this, and a studio that describes neither is never
 * told anyone was late — an assumed 09:00 would mark real people late against
 * a number nobody chose. That is why Clear exists rather than just a field.
 *
 * Closing time is recorded and shown, never used to judge anyone. Leaving early
 * is a conversation between people, not a status a register should assign.
 */
export function DefaultHoursForm({
  opensAt: initialOpens, closesAt: initialCloses,
}: {
  opensAt: string | null;
  closesAt: string | null;
}) {
  const [opensAt, setOpensAt] = useState(initialOpens ?? '');
  const [closesAt, setClosesAt] = useState(initialCloses ?? '');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = opensAt !== (initialOpens ?? '') || closesAt !== (initialCloses ?? '');

  const save = (opens: string, closes: string) =>
    startTransition(async () => {
      try {
        await setStudioDefaultHours({ opensAt: opens || null, closesAt: closes || null });
        router.refresh();
      } catch (e: any) { alert(e?.message || 'Could not save the hours.'); }
    });

  return (
    <div className="q-stack q-stack-sm">
      <div className="q-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <span className="q-meta-sm">Usually open</span>
        <input
          className="q-input q-input-sm" type="time" value={opensAt} disabled={isPending}
          onChange={(e) => setOpensAt(e.target.value)} style={{ width: '7.5rem' }}
        />
        <span className="q-meta-sm">to</span>
        <input
          className="q-input q-input-sm" type="time" value={closesAt} disabled={isPending}
          onChange={(e) => setClosesAt(e.target.value)} style={{ width: '7.5rem' }}
        />
        {dirty && (
          <>
            <button className="q-btn q-btn-primary" disabled={isPending} onClick={() => save(opensAt, closesAt)}>
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              className="q-btn q-btn-secondary" disabled={isPending}
              onClick={() => { setOpensAt(initialOpens ?? ''); setClosesAt(initialCloses ?? ''); }}
            >
              Cancel
            </button>
          </>
        )}
        {!dirty && initialOpens && (
          <button
            className="q-btn q-btn-secondary" disabled={isPending}
            onClick={() => { setOpensAt(''); setClosesAt(''); save('', ''); }}
          >
            Clear
          </button>
        )}
      </div>
      <span className="q-meta-sm">
        {initialOpens
          ? <>On any day the week below leaves unstated, anyone checking in after <strong>{initialOpens}</strong> is marked late.</>
          : <>Not set, so nobody is marked late. Set a time, or describe the week below, and the board starts saying who arrived after it.</>}
        {' '}Read in the studio&rsquo;s own timezone.
      </span>
    </div>
  );
}
