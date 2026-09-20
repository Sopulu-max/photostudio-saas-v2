'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addBookingExtra, removeBookingExtra } from '@/modules/bookings/interface';
import { formatMoney } from '@/kernel/currency';
import { amountOf } from '@/kernel/money';
import { toast, readableError } from '@/components/Toast';

/**
 * More of what this line's package promises.
 *
 * An extra is more of something already promised - nothing else - so the
 * only choices here are which promise, how many more, and the figure agreed
 * for each. The figure is suggested from the producing service's rate when
 * the studio set one, and is the operator's either way. Taking one raises the
 * promise on the booking's instance and writes the ledger; the package stays
 * what it was sold as, and the extras read beside it.
 */
export function LineExtras({
  lineId,
  promises,
  taken,
  currencyCode,
}: {
  lineId: string;
  promises: { packageServiceId: string; deliverableId: string; name: string; quantity: number | null; serviceName: string; rate: number | null }[];
  taken: { id: string; label: string; units: number; unit_rate: unknown }[];
  currencyCode: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [which, setWhich] = useState(0);
  const [units, setUnits] = useState('1');
  const [each, setEach] = useState('');

  const chosen = promises[which];
  const suggested = chosen?.rate ?? null;
  const eachNum = each.trim() === '' ? (suggested ?? NaN) : Number(each);
  const total = Number.isFinite(eachNum) ? eachNum * Number(units || 0) : null;

  const add = () => startTransition(async () => {
    try {
      if (!chosen) return;
      await addBookingExtra({
        bookingLineId: lineId,
        packageServiceId: chosen.packageServiceId,
        deliverableId: chosen.deliverableId,
        units: Number(units),
        unitAmount: eachNum,
      });
      setOpen(false); setUnits('1'); setEach('');
      router.refresh();
    } catch (e: any) {
      toast.bad(readableError(e, 'Could not add the extra.'));
    }
  });

  const remove = (id: string) => startTransition(async () => {
    try {
      await removeBookingExtra({ id });
      router.refresh();
    } catch (e: any) {
      toast.bad(readableError(e, 'Could not remove the extra.'));
    }
  });

  return (
    <div className="q-stack q-stack-sm" style={{ marginTop: '10px' }}>
      {taken.length > 0 && (
        <div className="q-meta">
          <strong className="q-strong" style={{ marginRight: '4px' }}>Extras:</strong>
          {taken.map((x, i) => (
            <span key={x.id}>
              {i > 0 && ', '}
              {x.label} · {formatMoney(amountOf(x.unit_rate) * x.units, currencyCode)}
              <button type="button" className="q-btn-ghost q-btn-xs" title={`Remove ${x.label}`} disabled={isPending}
                onClick={() => remove(x.id)} style={{ marginLeft: '2px' }}>×</button>
            </span>
          ))}
        </div>
      )}

      {promises.length > 0 && (open ? (
        <div className="q-tile q-stack q-stack-sm">
          <div className="q-row" style={{ gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="q-meta-sm">More</span>
            <select className="q-select q-input-sm" value={which} disabled={isPending} onChange={(e) => { setWhich(Number(e.target.value)); setEach(''); }} style={{ minWidth: '12rem' }}>
              {promises.map((p, i) => (
                <option key={`${p.packageServiceId}:${p.deliverableId}`} value={i}>
                  {p.name}{p.quantity != null ? ` (${p.quantity} promised)` : ''}
                </option>
              ))}
            </select>
            <input className="q-input q-input-sm" type="number" min={1} step="1" value={units} disabled={isPending}
              onChange={(e) => setUnits(e.target.value)} style={{ width: '5rem' }} aria-label="How many more" />
            <span className="q-meta-sm">at</span>
            <span className="q-meta-sm q-strong">{currencyCode}</span>
            <input className="q-input q-input-sm" type="number" min={0} step="0.01" value={each} disabled={isPending}
              placeholder={suggested != null ? String(suggested) : 'each'}
              onChange={(e) => setEach(e.target.value)} style={{ width: '8rem' }} aria-label="Agreed figure each" />
            <span className="q-meta-sm">each{suggested != null && each.trim() === '' ? ' · the studio’s usual' : ''}</span>
          </div>
          <div className="q-row" style={{ gap: '8px', alignItems: 'center' }}>
            <button type="button" className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending}
              disabled={isPending || !chosen || !(Number(units) > 0) || !Number.isFinite(eachNum)} onClick={add}>
              {isPending ? 'Adding…' : `Add${total != null ? ` · ${formatMoney(total, currencyCode)}` : ''}`}
            </button>
            <button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={isPending} onClick={() => setOpen(false)}>Cancel</button>
            {chosen && <span className="q-meta-sm">Promised by {chosen.serviceName}. The figure is agreed here and frozen.</span>}
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="q-btn q-btn-secondary q-btn-xs" disabled={isPending} onClick={() => setOpen(true)}>+ Extra</button>
        </div>
      ))}
    </div>
  );
}
