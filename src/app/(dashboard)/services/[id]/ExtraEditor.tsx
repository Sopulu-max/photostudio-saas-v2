'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateServiceExtras } from '@/modules/services/interface';
import { currencySymbol } from '@/kernel/currency';

type Extra = { id?: string; name: string; price: number; unit: string | null };

/**
 * Optional add-ons this service carries — an extra hour, a printed album,
 * rush delivery. Edited locally and saved in one go, like intake questions.
 * Not a new sellable concept: picking one on a booking just adds a line.
 */
export function ExtraEditor({
  serviceId,
  extras: initial,
  currencyCode,
}: {
  serviceId: string;
  extras: Extra[];
  currencyCode: string;
}) {
  const [extras, setExtras] = useState<Extra[]>(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = JSON.stringify(extras) !== JSON.stringify(initial);
  const symbol = currencySymbol(currencyCode);

  const patch = (i: number, updates: Partial<Extra>) =>
    setExtras((es) => es.map((e, idx) => (idx === i ? { ...e, ...updates } : e)));

  const add = () => setExtras((es) => [...es, { name: '', price: 0, unit: null }]);

  const remove = (i: number) => setExtras((es) => es.filter((_, idx) => idx !== i));

  const save = () =>
    startTransition(async () => {
      try {
        await updateServiceExtras({ serviceId, extras: extras.map((e) => ({ name: e.name, price: e.price, unit: e.unit })) });
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Could not save extras.');
      }
    });

  return (
    <div className="q-stack q-stack-md">
      {extras.length === 0 && (
        <p className="q-empty">
          No extras yet. Add one for anything a client might want on top of this service — an extra hour, a print, rush delivery.
        </p>
      )}

      {extras.map((e, i) => (
        <div key={i} className="q-row">
          <input
            className="q-input q-fill"
            placeholder="e.g. Extra hour"
            value={e.name}
            onChange={(ev) => patch(i, { name: ev.target.value })}
          />
          <span className="q-meta-sm">{symbol}</span>
          <input
            className="q-input"
            type="number"
            min="0"
            step="0.01"
            value={e.price}
            onChange={(ev) => patch(i, { price: parseFloat(ev.target.value) || 0 })}
            style={{ width: '7rem' }}
          />
          <input
            className="q-input"
            placeholder="per… (optional)"
            value={e.unit || ''}
            onChange={(ev) => patch(i, { unit: ev.target.value || null })}
            style={{ width: '9rem' }}
          />
          <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => remove(i)}>Remove</button>
        </div>
      ))}

      <div className="q-row">
        <button className="q-btn q-btn-secondary" onClick={add}>+ Add extra</button>
        <span className="q-spacer" />
        {dirty && (
          <>
            <button className="q-btn q-btn-primary" onClick={save} disabled={isPending}>
              {isPending ? 'Saving…' : 'Save extras'}
            </button>
            <button className="q-btn q-btn-secondary" onClick={() => setExtras(initial)} disabled={isPending}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
