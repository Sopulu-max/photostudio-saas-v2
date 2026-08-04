'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTransaction } from '@/modules/finances/interface';

/**
 * A one-off transaction with no booking behind it — an expense, a refund,
 * anything the studio needs on the ledger that Bookings didn't raise. Held
 * locally and committed in one call, the same inline-expand shape as adding a
 * line or an invoice elsewhere in the app — no modal.
 */
export function CreateTransactionForm({ orgId, actorId, currencyCode }: { orgId: string; actorId: string; currencyCode: string }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [type, setType] = useState('');
  const [amount, setAmount] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || !type.trim()) return;
    startTransition(async () => {
      try {
        await createTransaction({
          organizationId: orgId,
          direction,
          type: type.trim(),
          amount: amt,
          currency: currencyCode,
          actorId,
        });
        setOpen(false);
        setType('');
        setAmount('');
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Failed to log transaction.');
      }
    });
  };

  if (!open) {
    return (
      <button className="q-btn q-btn-primary" onClick={() => setOpen(true)}>
        + Log transaction
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
      <select className="q-select" value={direction} onChange={(e) => setDirection(e.target.value as any)}>
        <option value="inbound">Inbound — revenue</option>
        <option value="outbound">Outbound — expense</option>
      </select>
      <input
        className="q-input"
        placeholder="e.g. Equipment"
        value={type}
        onChange={(e) => setType(e.target.value)}
        list="transaction-type-suggestions"
        style={{ width: '10rem' }}
      />
      <datalist id="transaction-type-suggestions">
        <option value="invoice" /><option value="deposit" /><option value="refund" /><option value="expense" />
      </datalist>
      <input
        className="q-input"
        type="number"
        min="0"
        step="0.01"
        placeholder={`amount (${currencyCode})`}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ width: '10rem' }}
      />
      <button className="q-btn q-btn-primary" disabled={isPending} onClick={submit}>
        {isPending ? 'Logging…' : 'Log it'}
      </button>
      <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}
