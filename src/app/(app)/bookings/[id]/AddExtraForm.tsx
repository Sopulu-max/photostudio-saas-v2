'use client';

import React, { useState, useTransition, useMemo } from 'react';
import { addBookingLine } from '@/modules/bookings/interface';
import { toast, readableError } from '@/components/Toast';

export function AddExtraForm({
  bookingId,
  packages,
  services,
  deliverables,
  currencyCode,
}: {
  bookingId: string;
  packages: any[];
  services: any[];
  deliverables: any[];
  currencyCode: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [targetType, setTargetType] = useState<'deliverable' | 'service' | 'package'>('deliverable');
  
  const [selectedId, setSelectedId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState<string>('');

  const handleTypeChange = (t: any) => {
    setTargetType(t);
    setSelectedId('');
    setTitle('');
  };

  const handleTargetChange = (id: string) => {
    setSelectedId(id);
    if (!id) return;
    
    if (targetType === 'deliverable') {
      const d = deliverables.find(x => x.id === id);
      if (d) setTitle(d.name);
    } else if (targetType === 'service') {
      const s = services.find(x => x.id === id);
      if (s) setTitle(s.name);
    } else if (targetType === 'package') {
      const p = packages.find(x => x.id === id);
      if (p) setTitle(p.name);
    }
  };

  const handleSave = () => {
    startTransition(async () => {
      try {
        await addBookingLine({
          bookingId,
          title: title.trim() || 'Extra',
          targetType,
          targetDeliverableId: targetType === 'deliverable' ? selectedId : null,
          targetDeliverableQuantity: targetType === 'deliverable' ? quantity : null,
          targetServiceId: targetType === 'service' ? selectedId : null,
          packageId: targetType === 'package' ? selectedId : null,
          price: { amount: price ? parseFloat(price) : 0, currency: currencyCode },
          quantity: 1, // The line quantity itself is 1. Deliverable quantity is nested if applicable.
        });
        setAdding(false);
        setSelectedId('');
        setTitle('');
        setPrice('');
        setQuantity(1);
        toast.ok('Extra added to booking');
      } catch (err) {
        toast.bad(readableError(err, 'Something went wrong.'));
      }
    });
  };

  if (!adding) {
    return (
      <button 
        type="button"
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
      <div className="q-row q-row-between">
        <strong>Add Extra</strong>
        <button type="button" className="q-btn-icon" onClick={() => setAdding(false)} disabled={isPending}>✕</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
        <div>
          <label className="q-label">What kind of extra?</label>
          <select className="q-select" value={targetType} onChange={e => handleTypeChange(e.target.value)} disabled={isPending}>
            <option value="deliverable">Deliverable (e.g. Photos)</option>
            <option value="service">Service (e.g. Hair styling)</option>
            <option value="package">Whole Package</option>
          </select>
        </div>

        <div>
          <label className="q-label">Select {targetType}</label>
          <select className="q-select" value={selectedId} onChange={e => handleTargetChange(e.target.value)} disabled={isPending}>
            <option value="">-- Select --</option>
            {targetType === 'deliverable' && deliverables.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            {targetType === 'service' && services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            {targetType === 'package' && packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: targetType === 'deliverable' ? '1fr 1fr' : '1fr', gap: '16px' }}>
        
        {targetType === 'deliverable' && (
          <div>
            <label className="q-label">Quantity</label>
            <input className="q-input" type="number" min="1" value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} disabled={isPending} />
          </div>
        )}

        <div>
          <label className="q-label">Price ({currencyCode})</label>
          <input className="q-input" type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} disabled={isPending} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
        <button 
          type="button"
          className="q-btn q-btn-primary" 
          onClick={handleSave} 
          disabled={isPending || !selectedId}
        >
          {isPending ? 'Adding...' : 'Save Extra'}
        </button>
      </div>
    </div>
  );
}

