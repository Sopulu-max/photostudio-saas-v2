'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setBookingClassification } from '@/modules/bookings/interface';
import { toast, readableError } from '@/components/Toast';

type Dimension = {
  id: string;
  name: string;
  question: string | null;
  values: { id: string; name: string }[];
};

/**
 * WHAT THE STUDIO UNDERSTANDS THIS BOOKING TO BE FOR.
 *
 * A client ticks a box on a form they are reading for the first time, and
 * sometimes they tick the wrong one: Pius James asked for a wedding and
 * answered Maternity. Until now the only record of the classification WAS the
 * record of his submission, so there was no way to correct the understanding
 * without falsifying the evidence — and the studio was left being offered
 * maternity packages for a wedding, with no way out of it.
 *
 * TWO FACTS, SHOWN AS TWO. What they submitted is history and is never
 * rewritten; this is the studio's working answer, seeded from theirs. Where the
 * two differ the difference is shown, because a booking filed as a wedding
 * against a form that says maternity should say so on its face rather than
 * leaving the next person to wonder.
 *
 * The difference is DERIVED by comparing the two, not stored as a third flag —
 * so it cannot fall out of step with either.
 */
export function BookingClassification({
  bookingId,
  dimensions,
  current,
  submitted,
}: {
  bookingId: string;
  /** Every question this studio asks, with the answers it accepts. */
  dimensions: Dimension[];
  /** What the studio currently understands, by dimension id. */
  current: Record<string, string>;
  /** What the client submitted, by dimension id — for showing a correction. */
  submitted: Record<string, string>;
}) {
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  if (dimensions.length === 0) return null;

  const choose = (dimensionId: string, valueId: string) => {
    setBusy(dimensionId);
    startTransition(async () => {
      try {
        await setBookingClassification({ bookingId, dimensionId, valueId: valueId || null });
        router.refresh();
      } catch (e) {
        toast.bad(readableError(e, 'That answer could not be recorded.'));
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <div className="q-stack q-stack-sm">
      <div>
        <strong className="q-strong">What this booking is for</strong>
        <p className="q-meta" style={{ margin: '2px 0 0' }}>
          Set from what the client answered. Change it if they meant something else.
        </p>
      </div>

      <div className="q-facts">
        {dimensions.map((d) => {
          const chosen = current[d.id] || '';
          const said = submitted[d.id];
          /* Only a real disagreement counts. A question the client never
             answered is not a correction, it is a blank being filled in. */
          const corrected = !!said && !!chosen && said !== chosen;
          const saidName = said ? d.values.find((v) => v.id === said)?.name : null;

          return (
            <div key={d.id} className="q-fact-group">
              <span className="q-eyebrow">{d.name}</span>
              <span className="q-fact-values" style={{ alignItems: 'center', gap: '8px' }}>
                <select
                  className="q-select"
                  value={chosen}
                  disabled={isPending && busy === d.id}
                  onChange={(e) => choose(d.id, e.target.value)}
                  aria-label={d.question || d.name}
                >
                  <option value="">Not said</option>
                  {d.values.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                {corrected && (
                  <span className="q-meta-sm">
                    Client answered {saidName}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
