'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setStudioTimezone } from '@/modules/team/interface';
import { PickOne } from '@/components/Pick';
import { toast, readableError } from '@/components/Toast';

/**
 * Where one working day ends and the next begins.
 *
 * Only attendance reads this today, and it is the whole reason it exists: a
 * check-in is a moment, but "who is in today" needs a date, and a date is a
 * fact about the studio rather than about the server. Left at UTC, an evening
 * check-in in Lagos files itself against tomorrow.
 *
 * The list is whatever this browser knows — every IANA zone, not a shortlist
 * someone curated and then had to maintain. It still accepts anything typed,
 * for the same reason every other list here does; the server rejects a name no
 * timezone database recognises rather than storing nonsense.
 */

const allZones = (): string[] => {
  try {
    // Available in every browser this app supports; guarded because it is the
    // one API here that a stale runtime might not have.
    const supported = (Intl as any).supportedValuesOf?.('timeZone');
    if (Array.isArray(supported) && supported.length > 0) {
      // UTC first, and deliberately: the list is IANA place names and does not
      // contain the literal "UTC", which is the value every studio starts with.
      // Leaving it out meant the one entry every studio needed to recognise was
      // the one entry the list denied — the box said UTC and the menu offered
      // to create it, as though the studio had made the word up.
      return ['UTC', ...supported.filter((z: string) => z !== 'UTC')];
    }
  } catch { /* fall through to the guess below */ }
  const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return guess && guess !== 'UTC' ? ['UTC', guess] : ['UTC'];
};

export function TimezoneForm({ current }: { current: string }) {
  const [zone, setZone] = useState(current);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = zone.trim() !== current;
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const nowThere = (() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        timeZone: zone.trim() || 'UTC', hour: 'numeric', minute: '2-digit', weekday: 'short',
      }).format(new Date());
    } catch { return null; }
  })();

  return (
    <div className="q-stack q-stack-sm">
      <div className="q-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: '16rem', flex: 1, maxWidth: '22rem' }}>
          <PickOne
            value={zone}
            onChange={setZone}
            options={allZones()}
            placeholder="e.g. Africa/Lagos"
            disabled={isPending}
          />
        </div>
        {dirty && (
          <>
            <button
              className="q-btn q-btn-primary"
              aria-busy={isPending}
              disabled={isPending || !zone.trim()}
              onClick={() => startTransition(async () => {
                try {
                    await setStudioTimezone(zone);
                    toast.ok(`The studio timezone is now ${zone}.`);
                    router.refresh();
                  }
                catch (e: any) { toast.bad(readableError(e, 'Could not set the timezone.')); }
              })}
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button className="q-btn q-btn-secondary" onClick={() => setZone(current)}>Cancel</button>
          </>
        )}
      </div>
      <span className="q-meta-sm">
        {nowThere
          ? <>It&rsquo;s <strong>{nowThere}</strong> there right now{here && here !== zone.trim() ? <> — {here} on this device</> : null}.</>
          : 'Not a timezone this system recognises.'}
        {' '}Attendance files each check-in against the studio&rsquo;s day. Days already recorded keep the date they were filed under.
      </span>
    </div>
  );
}
