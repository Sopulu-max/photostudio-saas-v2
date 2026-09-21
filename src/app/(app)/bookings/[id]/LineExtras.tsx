'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addBookingExtra, updateBookingExtra, removeBookingExtra } from '@/modules/bookings/interface';
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
 *
 * READ AS PARTS, AND SAID WHERE IT WENT. An extra showed as a label and a
 * total with an x - no way to tell whether it had reached the invoice, and
 * no way to change three at 5,000 into four short of removing it and adding
 * it again. Each now reads as units x figure = total, says which invoice
 * carries it (or that none does yet), and can be changed in place.
 */
export function LineExtras({
  lineId,
  promises,
  taken,
  currencyCode,
}: {
  lineId: string;
  promises: { packageServiceId: string; deliverableId: string; name: string; quantity: number | null; serviceName: string; rate: number | null }[];
  taken: {
    id: string; label: string; units: number; unit_rate: unknown;
    /** The live invoices carrying it - a draft, or a numbered document. */
    billedOn?: { id: string; number: string | null; status: string }[];
  }[];
  currencyCode: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [which, setWhich] = useState(0);
  const [units, setUnits] = useState('1');
  const [each, setEach] = useState('');
  // The one being changed, and what it is being changed to.
  const [editing, setEditing] = useState<string | null>(null);
  const [eUnits, setEUnits] = useState('');
  const [eEach, setEEach] = useState('');

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

  const change = (id: string) => startTransition(async () => {
    try {
      await updateBookingExtra({ id, units: Number(eUnits), unitAmount: Number(eEach) });
      setEditing(null);
      router.refresh();
    } catch (e: any) {
      toast.bad(readableError(e, 'Could not change the extra.'));
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
        <div className="q-stack q-stack-xs">
          <span className="q-meta"><strong className="q-strong">Extras</strong></span>
          {taken.map((x) => {
            const rate = amountOf(x.unit_rate);
            const where = (x.billedOn || []);
            const said = where.length === 0
              ? 'not invoiced yet'
              : where.map((i) => i.status === 'draft' ? 'on the draft invoice' : `on ${i.number ?? 'an invoice'}`).join(', ');
            return editing === x.id ? (
              <div key={x.id} className="q-tile q-row" style={{ gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="q-meta-sm">{x.label.replace(/^\+\d+\s*/, '')}</span>
                <input className="q-input q-input-sm" type="number" min={1} step="1" value={eUnits} disabled={isPending}
                  onChange={(e) => setEUnits(e.target.value)} style={{ width: '5rem' }} aria-label="How many more" />
                <span className="q-meta-sm">at</span>
                <span className="q-meta-sm q-strong">{currencyCode}</span>
                <input className="q-input q-input-sm" type="number" min={0} step="0.01" value={eEach} disabled={isPending}
                  onChange={(e) => setEEach(e.target.value)} style={{ width: '8rem' }} aria-label="Agreed figure each" />
                <span className="q-meta-sm">each</span>
                <button type="button" className="q-btn q-btn-primary q-btn-xs" aria-busy={isPending}
                  disabled={isPending || !(Number(eUnits) > 0) || !Number.isFinite(Number(eEach)) || eEach.trim() === ''}
                  onClick={() => change(x.id)}>
                  {isPending ? 'Saving…' : `Save · ${formatMoney(Number(eUnits || 0) * Number(eEach || 0), currencyCode)}`}
                </button>
                <button type="button" className="q-btn q-btn-secondary q-btn-xs" disabled={isPending} onClick={() => setEditing(null)}>Cancel</button>
              </div>
            ) : (
              <div key={x.id} className="q-row q-row-between" style={{ gap: '8px', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span className="q-meta">
                  <span className="q-strong">{x.label}</span>
                  <span className="q-meta-sm"> · {x.units} × {formatMoney(rate, currencyCode)} · </span>
                  <span className="q-strong">{formatMoney(rate * x.units, currencyCode)}</span>
                  <span className="q-meta-sm"> · {said}</span>
                </span>
                <span className="q-row q-row-sm">
                  <button type="button" className="q-btn-ghost q-btn-xs" disabled={isPending}
                    onClick={() => { setEditing(x.id); setEUnits(String(x.units)); setEEach(String(rate)); }}>
                    Change
                  </button>
                  <button type="button" className="q-btn-ghost q-btn-xs" title={`Remove ${x.label}`} disabled={isPending}
                    onClick={() => remove(x.id)}>×</button>
                </span>
              </div>
            );
          })}
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
