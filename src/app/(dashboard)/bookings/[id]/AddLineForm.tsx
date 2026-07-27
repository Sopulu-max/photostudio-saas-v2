'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addBookingLine } from '@/modules/bookings/interface';

export function AddLineForm({ bookingId, services }: { bookingId: string; services: { id: string; name: string }[] }) {
  const [serviceId, setServiceId] = useState('');
  const [custom, setCustom] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const add = () => {
    if (!serviceId && !custom.trim()) return;
    startTransition(async () => {
      try {
        await addBookingLine({
          bookingId,
          serviceTemplateId: serviceId || null,
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

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
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
        {isPending ? 'Adding…' : 'Add line'}
      </button>
    </div>
  );
}
