'use client';

import React, { useState, useEffect } from 'react';
import { studioDay, whatElseIsOn } from '@/modules/bookings/interface';
import { wallClockIn } from '@/kernel/wallClock';

/**
 * WHAT THAT DAY IS ALREADY LIKE.
 *
 * Two things anyone choosing a date needs to know and neither of which the
 * field itself can say: whether the studio is open, and what is already on.
 *
 * TOLD, NOT REFUSED. Whether a studio can run two shoots at once is a fact
 * about the studio that nothing here has been told, and a booking wrongly
 * refused is worse than one taken with open eyes. So both lines are advisory —
 * the studio's own hours are enforced on the public intake path, where a
 * stranger is choosing, and never on an operator who may well be booking a
 * Sunday on purpose.
 *
 * ONE DEFINITION, TWO SCREENS. This was written into the new-booking form and
 * lived only there, so the edit page — where rescheduling actually happens, and
 * where a clash matters most — asked neither question. Somebody moving a shoot
 * onto a day the studio is shut, or on top of another shoot, was told nothing.
 * That is the shape of gap this whole area keeps producing: a rule written
 * inside one screen is a rule only that screen obeys.
 */
export function DayContext({
  when,
  timeZone,
  exceptBookingId,
}: {
  /** The datetime-local value being chosen — "2026-08-29T10:00", or ''. */
  when: string;
  /**
   * The studio's zone, because a booking at 10:00 is at 10:00 in the STUDIO.
   * Listing what else is on used toLocaleTimeString, which answers in the
   * browser's zone — so an operator abroad was shown a day's bookings an hour
   * out, which is exactly the misreading that makes a clash invisible.
   */
  timeZone: string;
  /** The booking being edited, so it does not report itself as a clash. */
  exceptBookingId?: string;
}) {
  const [dayHours, setDayHours] = useState<
    { opensAt: string | null; closesAt: string | null; closed: boolean; label: string | null } | null
  >(null);
  const [alsoOn, setAlsoOn] = useState<{ bookingId: string; title: string; at: string; stage: string | null }[]>([]);

  useEffect(() => {
    const date = when.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setDayHours(null); setAlsoOn([]); return; }
    /*
     * Cleared before asking, not only when the date is unreadable.
     *
     * Without this the previous day's answer stayed on screen while the new one
     * was in flight, so a Wednesday could be told the studio opens at 13:00 —
     * which is true of Sunday and false of Wednesday. A stale true sentence
     * about the wrong day is worse than no sentence, because there is nothing
     * about it that looks wrong.
     */
    setDayHours(null); setAlsoOn([]);
    let live = true;
    Promise.all([studioDay(date), whatElseIsOn(date, exceptBookingId)])
      .then(([h, others]) => { if (!live) return; setDayHours(h as any); setAlsoOn(others as any); })
      .catch(() => { if (live) { setDayHours(null); setAlsoOn([]); } });
    return () => { live = false; };
  }, [when, exceptBookingId]);

  return (
    <>
      {dayHours && (dayHours.closed || dayHours.opensAt || dayHours.closesAt) && (() => {
        // Compared as wall clocks within one studio day, so no timezone
        // arithmetic reaches the decision — the same rule the server applies.
        const t = when.slice(11, 16);
        const early = dayHours.opensAt && t && t < dayHours.opensAt;
        const late = dayHours.closesAt && t && t >= dayHours.closesAt;
        const off = dayHours.closed || early || late;
        return (
          <span className={off ? 'q-meta-sm q-text-danger q-appear' : 'q-meta-sm q-appear'}>
            {dayHours.closed
              ? `The studio is closed that day${dayHours.label ? ` (${dayHours.label})` : ''}. You can still book it.`
              : early
                ? `The studio opens at ${dayHours.opensAt} that day.`
                : late
                  ? `The studio closes at ${dayHours.closesAt} that day.`
                  : `The studio is open ${dayHours.opensAt ?? '—'} to ${dayHours.closesAt ?? '—'} that day.`}
          </span>
        );
      })()}

      {alsoOn.length > 0 && (
        <span className="q-meta-sm q-appear">
          Already that day: {alsoOn.map((b) => {
            // The studio's clock, not the reader's.
            const at = wallClockIn(b.at, timeZone).slice(11, 16);
            return `${at} ${b.title}${b.stage ? ` (${b.stage})` : ''}`;
          }).join(' · ')}
        </span>
      )}
    </>
  );
}
