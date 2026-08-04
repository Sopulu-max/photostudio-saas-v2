'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addBookingLine } from '@/modules/bookings/interface';
import { formatMoney } from '@/kernel/currency';

type Extra = { id: string; name: string; price: number; unit: string | null };

export function AddLineForm({
  bookingId,
  services,
  extrasByService = {},
  currencyCode = 'USD',
}: {
  bookingId: string;
  services: { id: string; name: string }[];
  extrasByService?: Record<string, Extra[]>;
  currencyCode?: string;
}) {
  const [serviceId, setServiceId] = useState('');
  const [custom, setCustom] = useState('');
  const [isPending, startTransition] = useTransition();
  const [addingExtra, setAddingExtra] = useState<string | null>(null);
  const router = useRouter();

  const add = () => {
    if (!serviceId && !custom.trim()) return;
    startTransition(async () => {
      try {
        await addBookingLine({
          bookingId,
          serviceId: serviceId || null,
          title: serviceId ? '' : custom.trim(),
        });
        setServiceId('');
        setCustom('');
        router.refresh();
      } catch (e) {
        console.error(e);
        alert('Failed to add line.');
      }
    });
  };

  const addExtra = (extra: Extra) => {
    setAddingExtra(extra.id);
    startTransition(async () => {
      try {
        await addBookingLine({
          bookingId,
          title: extra.name,
          price: { base_price: extra.price, currency: currencyCode, unit: extra.unit },
        });
        router.refresh();
      } catch (e) {
        console.error(e);
        alert('Failed to add extra.');
      } finally {
        setAddingExtra(null);
      }
    });
  };

  const extras = serviceId ? extrasByService[serviceId] || [] : [];

  return (
    <div className="q-stack q-stack-sm" style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <select
          className="q-select"
          value={serviceId}
          onChange={(e) => { setServiceId(e.target.value); if (e.target.value) setCustom(''); }}
          style={{ minWidth: '12rem' }}
        >
          <option value="">Add a service…</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-400)' }}>or</span>
        <input
          className="q-input"
          placeholder="custom line"
          value={custom}
          onChange={(e) => { setCustom(e.target.value); if (e.target.value) setServiceId(''); }}
          style={{ minWidth: '10rem' }}
        />
        <button className="q-btn q-btn-secondary" onClick={add} disabled={isPending}>
          {isPending && !addingExtra ? 'Adding…' : 'Add line'}
        </button>
      </div>

      {extras.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <span className="q-meta-sm">Extras for this service:</span>
          {extras.map((e) => (
            <button
              key={e.id}
              className="q-btn q-btn-secondary q-btn-xs"
              disabled={isPending}
              onClick={() => addExtra(e)}
            >
              {addingExtra === e.id ? 'Adding…' : `+ ${e.name} — ${formatMoney(e.price, currencyCode)}${e.unit ? `/${e.unit}` : ''}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
