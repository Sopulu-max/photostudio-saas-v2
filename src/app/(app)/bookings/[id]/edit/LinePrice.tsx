'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateBookingLine } from '@/modules/bookings/interface';
import { formatMoney } from '@/kernel/currency';
import { toast, readableError } from '@/components/Toast';

/**
 * THE ONE PRICE ON THIS LINE, WHERE IT WAS AT CREATION.
 *
 * The booking form asks "Price for this booking" under the package's
 * questions; the edit page hid the same figure behind a button called Edit,
 * beside Remove, on a page that is already an editor. It is the figure
 * quoted to this client - the reason a booking keeps its own instance of a
 * package - and it sits here, under what the package left open, as the
 * last thing settled about the line.
 */
export function LinePrice({
  bookingId,
  lineId,
  basePrice,
  catalogPrice,
  currency,
}: {
  bookingId: string;
  lineId: string;
  basePrice: number | null;
  /** What the catalogue says, for reading a departure against. */
  catalogPrice: number | null;
  currency: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [p, setP] = useState(basePrice == null ? '' : String(basePrice));
  const dirty = (p.trim() === '' ? null : Number(p)) !== basePrice;

  const save = () => startTransition(async () => {
    try {
      await updateBookingLine({ lineId, bookingId, basePrice: p.trim() === '' ? null : parseFloat(p), currency });
      router.refresh();
    } catch (e: any) {
      toast.bad(readableError(e, 'Could not change the price.'));
    }
  });

  return (
    <div className="q-field" style={{ marginTop: '12px' }}>
      <label className="q-label">Price for this booking</label>
      <div className="q-row" style={{ gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="q-meta-sm q-strong">{currency}</span>
        <input className="q-input" type="number" min="0" step="0.01" value={p} disabled={isPending}
          onChange={(e) => setP(e.target.value)} style={{ width: '10rem' }} aria-label="Price for this booking" />
        {dirty && (
          <>
            <button type="button" className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending} onClick={save}>
              {isPending ? 'Saving…' : 'Save price'}
            </button>
            <button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={isPending}
              onClick={() => setP(basePrice == null ? '' : String(basePrice))}>Discard</button>
          </>
        )}
      </div>
      <span className="q-meta-sm">
        {catalogPrice != null && basePrice != null && catalogPrice !== basePrice
          ? `The catalogue says ${formatMoney(catalogPrice, currency)}; this client was quoted differently.`
          : 'From the package. Change it to quote this client differently.'}
      </span>
    </div>
  );
}
