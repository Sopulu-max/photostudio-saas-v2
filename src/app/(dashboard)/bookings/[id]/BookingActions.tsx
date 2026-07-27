'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createContractForBooking, addInvoiceToBooking, startWorkForLine } from '@/modules/bookings/interface';

function useAction() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try { await fn(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });
  return { isPending, run };
}

export function CreateContractButton({ bookingId }: { bookingId: string }) {
  const { isPending, run } = useAction();
  return (
    <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => run(() => createContractForBooking(bookingId))}>
      {isPending ? 'Creating…' : 'Create a contract'}
    </button>
  );
}

export function StartWorkButton({ bookingId, lineId }: { bookingId: string; lineId: string }) {
  const { isPending, run } = useAction();
  return (
    <button className="q-btn q-btn-secondary" style={{ fontSize: '0.85rem' }} disabled={isPending} onClick={() => run(() => startWorkForLine({ bookingId, lineId }))}>
      {isPending ? 'Starting…' : 'Start work'}
    </button>
  );
}

export function AddInvoiceForm({ bookingId }: { bookingId: string }) {
  const { isPending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('Deposit');
  const [amount, setAmount] = useState('');

  const submit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    run(() => addInvoiceToBooking({ bookingId, label, amount: amt }).then(() => { setOpen(false); setAmount(''); }));
  };

  if (!open) {
    return (
      <button className="q-btn q-btn-secondary" style={{ marginTop: '16px' }} onClick={() => setOpen(true)}>
        + Raise an invoice
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
      <input className="q-input" placeholder="e.g. Deposit" value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: '10rem' }} />
      <input className="q-input" type="number" min="0" step="0.01" placeholder="amount" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: '8rem' }} />
      <button className="q-btn q-btn-primary" disabled={isPending} onClick={submit}>{isPending ? 'Raising…' : 'Raise'}</button>
      <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}
