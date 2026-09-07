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
 * TWO FACTS, ONE SHOWN. What they submitted stays in metadata and is never
 * rewritten; this is the studio's working answer, seeded from theirs.
 *
 * THE DIFFERENCE IS NOT DISPLAYED, and that is a decision rather than an
 * omission. This showed "Client answered Maternity" beside a corrected value,
 * which reads as the client having meant it — when in practice the mismatch
 * came from a form that was not asking clearly. Presenting an artefact of a
 * broken question as a statement of intent tells the operator something untrue
 * about their client. The submission is still on the record if it is ever
 * wanted; it is simply not narrated here.
 */
export function BookingClassification({
  bookingId,
  dimensions,
  current,
}: {
  bookingId: string;
  /** Every question this studio asks, with the answers it accepts. */
  dimensions: Dimension[];
  /** What the studio currently understands, by dimension id. */
  current: Record<string, string>;
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
        {/* "if they meant something else" carried the same implication the
            removed line did — that a mismatch is the client's. Change it if it
            is wrong, whatever made it wrong. */}
        <p className="q-meta" style={{ margin: '2px 0 0' }}>
          Set from the booking request. Change it if it is wrong.
        </p>
      </div>

      <div className="q-facts">
        {dimensions.map((d) => {
          const chosen = current[d.id] || '';

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
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
