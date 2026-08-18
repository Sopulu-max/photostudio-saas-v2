'use client';

import React, { useEffect, useState } from 'react';

/**
 * The date and the time, in the studio's own zone.
 *
 * This sits on a device by the door, so it is a wall clock before it is a
 * screen: someone tapping at 8:03 should see 8:03 and know that is what got
 * recorded. The date matters for the same reason — a board that only ever says
 * "today" gives you no way to notice it is still showing yesterday because the
 * tab was left open overnight.
 *
 * Shown in the STUDIO's timezone, not the device's. A studio in Lagos with a
 * laptop still set to UTC would otherwise read an hour behind the times it is
 * writing, which is exactly the sort of quiet disagreement that makes people
 * distrust a register.
 *
 * Nothing renders until mounted. Formatting a clock during SSR and again in the
 * browser produces two different strings and a hydration mismatch — the same
 * bug the theme toggle had. The reserved height keeps the header from jumping
 * when the real time arrives a frame later.
 */
export function StudioClock({ timezone }: { timezone: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    // Every second, so the minute turns over exactly when it should rather than
    // up to a minute late.
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    now ? new Intl.DateTimeFormat(undefined, { ...opts, timeZone: timezone }).format(now) : '';

  return (
    <div style={{ minHeight: '4.25rem' }}>
      <div
        className="q-num"
        style={{ fontSize: 'clamp(2rem, 6vw, 2.75rem)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}
        aria-live="off"
      >
        {fmt({ hour: 'numeric', minute: '2-digit' }) || ' '}
      </div>
      <div className="q-meta">
        {now
          ? fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : ' '}
      </div>
    </div>
  );
}
