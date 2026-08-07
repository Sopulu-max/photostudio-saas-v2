'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createContractForBooking, addInvoiceToBooking, startWorkForLine, extractPackageFromEnquiry } from '@/modules/bookings/interface';

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

export function ExtractPackageButton({ bookingId, label = 'Extract to package' }: { bookingId: string; label?: string }) {
  const { isPending, run } = useAction();
  return (
    <button className="q-btn q-btn-secondary" style={{ marginTop: '12px' }} disabled={isPending} onClick={() => run(() => extractPackageFromEnquiry(bookingId))}>
      {isPending ? 'Extracting…' : label}
    </button>
  );
}

export function CreateContractButton({ bookingId, label = 'Create a contract' }: { bookingId: string; label?: string }) {
  const { isPending, run } = useAction();
  return (
    <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => run(() => createContractForBooking(bookingId))}>
      {isPending ? 'Creating…' : label}
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

export function AddInvoiceForm({
  bookingId,
  currencyCode,
  suggestedLabel,
  suggestedAmount,
}: {
  bookingId: string;
  currencyCode: string;
  suggestedLabel?: string;
  suggestedAmount?: number;
}) {
  const { isPending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('Deposit');
  const [amount, setAmount] = useState('');

  const submit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    run(() => addInvoiceToBooking({ bookingId, label, amount: amt, currency: currencyCode }).then(() => { setOpen(false); setAmount(''); }));
  };

  const useSuggested = () => {
    if (!suggestedAmount) return;
    setLabel(suggestedLabel || 'Deposit');
    setAmount(String(suggestedAmount));
    setOpen(true);
  };

  if (!open) {
    return (
      <div className="q-row" style={{ marginTop: '16px' }}>
        <button className="q-btn q-btn-secondary" onClick={() => setOpen(true)}>
          + Raise an invoice
        </button>
        {!!suggestedAmount && (
          <span className="q-meta-sm">
            {suggestedLabel} is {currencyCode} {suggestedAmount.toFixed(2)} —{' '}
            <button className="q-btn-ghost q-link" onClick={useSuggested}>use that</button>
          </span>
        )}
      </div>
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
