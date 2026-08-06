'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addBookingLine } from '@/modules/bookings/interface';
import { formatMoney } from '@/kernel/currency';

type Variant = { axis_label: string; tiers: { label: string; price: number }[] };

export function AddLineForm({
  bookingId,
  packages,
  variantsByPackage = {},
  currencyCode = 'USD',
}: {
  bookingId: string;
  /** What a client can book — Packages, never raw Services. */
  packages: { id: string; name: string }[];
  variantsByPackage?: Record<string, Variant | null>;
  currencyCode?: string;
}) {
  const [packageId, setPackageId] = useState('');
  const [custom, setCustom] = useState('');
  const [isPending, startTransition] = useTransition();
  const [addingTier, setAddingTier] = useState<number | null>(null);
  const router = useRouter();

  const variant = packageId ? variantsByPackage[packageId] : null;

  const add = () => {
    if (!packageId && !custom.trim()) return;
    startTransition(async () => {
      try {
        await addBookingLine({
          bookingId,
          packageId: packageId || null,
          title: packageId ? '' : custom.trim(),
        });
        setPackageId('');
        setCustom('');
        router.refresh();
      } catch (e) {
        console.error(e);
        alert('Failed to add line.');
      }
    });
  };

  const addTier = (i: number) => {
    if (!variant) return;
    const tier = variant.tiers[i];
    setAddingTier(i);
    startTransition(async () => {
      try {
        await addBookingLine({
          bookingId,
          packageId,
          title: '',
          price: { base_price: tier.price, currency: currencyCode, unit: null },
        });
        setPackageId('');
        router.refresh();
      } catch (e) {
        console.error(e);
        alert('Failed to add line.');
      } finally {
        setAddingTier(null);
      }
    });
  };

  return (
    <div className="q-stack q-stack-sm" style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <select
          className="q-select"
          value={packageId}
          onChange={(e) => { setPackageId(e.target.value); if (e.target.value) setCustom(''); }}
          style={{ minWidth: '12rem' }}
        >
          <option value="">Add a package…</option>
          {packages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-400)' }}>or</span>
        <input
          className="q-input"
          placeholder="custom line"
          value={custom}
          onChange={(e) => { setCustom(e.target.value); if (e.target.value) setPackageId(''); }}
          style={{ minWidth: '10rem' }}
        />
        {!variant && (
          <button className="q-btn q-btn-secondary" onClick={add} disabled={isPending}>
            {isPending ? 'Adding…' : 'Add line'}
          </button>
        )}
      </div>

      {variant && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <span className="q-meta-sm">{variant.axis_label}:</span>
          {variant.tiers.map((t, i) => (
            <button
              key={i}
              className="q-btn q-btn-secondary q-btn-xs"
              disabled={isPending}
              onClick={() => addTier(i)}
            >
              {addingTier === i ? 'Adding…' : `${t.label} — ${formatMoney(t.price, currencyCode)}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
