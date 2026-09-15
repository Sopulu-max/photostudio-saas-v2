'use client';

import React, { useState, useTransition } from 'react';
import { addBookingLine } from '@/modules/bookings/interface';
import { formatMoney } from '@/kernel/currency';
import { toast, readableError } from '@/components/Toast';
import type { PackageExtra } from '@/lib/types/engine';

export function AddExtraForm({
  bookingId,
  availableExtras,
  currencyCode,
}: {
  bookingId: string;
  availableExtras: PackageExtra[];
  currencyCode: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [selectedExtraId, setSelectedExtraId] = useState<string>('');

  if (availableExtras.length === 0) return null;

  const handleSave = () => {
    if (!selectedExtraId) return;
    const extra = availableExtras.find(e => e.id === selectedExtraId);
    if (!extra) return;

    startTransition(async () => {
      try {
        await addBookingLine({
          bookingId,
          title: extra.name,
          packageExtraId: extra.id,
          packageId: extra.package_id,
          price: extra.price as Record<string, unknown>,
          quantity: 1,
        });
        setAdding(false);
        setSelectedExtraId('');
        toast.ok('Extra added to booking');
      } catch (err) {
        toast.bad(readableError(err, 'Something went wrong.'));
      }
    });
  };

  if (!adding) {
    return (
      <button 
        className="q-btn q-btn-secondary q-btn-sm" 
        onClick={() => setAdding(true)}
        style={{ marginTop: '12px' }}
      >
        + Add Extra
      </button>
    );
  }

  return (
    <div className="q-card q-stack" style={{ padding: '16px', marginTop: '12px', border: '1px dashed var(--q-color-ink-200)' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <select 
          className="q-select"
          value={selectedExtraId}
          onChange={e => setSelectedExtraId(e.target.value)}
          style={{ flex: 1 }}
        >
          <option value="">Select an extra to add...</option>
          {availableExtras.map(ex => (
            <option key={ex.id} value={ex.id}>
              {ex.name} (+{formatMoney(Number((ex.price as any)?.amount || 0), (ex.price as any)?.currency || currencyCode)})
            </option>
          ))}
        </select>
        
        <button 
          className="q-btn q-btn-primary" 
          onClick={handleSave} 
          disabled={isPending || !selectedExtraId}
        >
          Add
        </button>
        <button 
          className="q-btn q-btn-secondary" 
          onClick={() => setAdding(false)} 
          disabled={isPending}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

