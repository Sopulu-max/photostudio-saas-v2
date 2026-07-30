'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateBookingLine, removeBookingLine } from '@/modules/bookings/interface';

function useAction() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });
  return { isPending, run };
}

export function LineActions({
  bookingId,
  lineId,
  title,
  basePrice,
  quantity,
  unit,
  currency,
  hasWork,
}: {
  bookingId: string;
  lineId: string;
  title: string;
  basePrice: number | null;
  quantity: number;
  unit: string | null;
  currency: string;
  hasWork: boolean;
}) {
  const { isPending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [t, setT] = useState(title);
  const [p, setP] = useState(basePrice == null ? '' : String(basePrice));
  const [qty, setQty] = useState(String(quantity ?? 1));

  if (editing) {
    return (
      <div className="q-row" style={{ marginTop: '10px' }}>
        <input className="q-input" value={t} onChange={(e) => setT(e.target.value)} placeholder="Line name" style={{ minWidth: '12rem' }} />
        <input className="q-input" type="number" min="0" step="0.01" value={p} onChange={(e) => setP(e.target.value)} placeholder="price" style={{ width: '8rem' }} />
        <input className="q-input" type="number" min="0" step="0.5" value={qty} onChange={(e) => setQty(e.target.value)}
          placeholder="qty" title={unit ? `How many ${unit}s` : 'How many'} style={{ width: '6rem' }} />
        {unit && <span className="q-meta-sm">{unit}s</span>}
        <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending}
          onClick={() => t.trim() && run(
            () => updateBookingLine({ lineId, bookingId, title: t, basePrice: p === '' ? null : parseFloat(p), currency, quantity: parseFloat(qty) || 1 }),
            () => setEditing(false))}>
          Save
        </button>
        <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => { setEditing(false); setT(title); setP(basePrice == null ? '' : String(basePrice)); setQty(String(quantity ?? 1)); }}>
          Cancel
        </button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="q-note q-note-bad q-stack q-stack-sm" style={{ marginTop: '10px' }}>
        <span className="q-meta-plain">
          Remove “{title}”?{hasWork ? ' The work started on it goes too.' : ''}
        </span>
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending}
            onClick={() => run(() => removeBookingLine({ lineId, bookingId }))}>
            Remove
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setConfirming(false)}>Keep</button>
        </div>
      </div>
    );
  }

  return (
    <div className="q-row">
      <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => setEditing(true)}>Edit</button>
      <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => setConfirming(true)}>Remove</button>
    </div>
  );
}
