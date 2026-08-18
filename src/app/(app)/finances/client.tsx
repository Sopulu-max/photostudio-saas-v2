'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTransaction } from '@/modules/finances/interface';
import { TRANSACTION_KINDS, KINDS } from '@/modules/finances/money';
import type { TransactionKind } from '@/modules/finances/money';

/** Suggestions per kind — the studio's own words, not a fixed list. */
const SUGGESTIONS: Record<TransactionKind, string[]> = {
  charge: ['Deposit', 'Balance', 'Extra hours', 'Print order'],
  refund: ['Refund', 'Deposit returned', 'Goodwill'],
  expense: ['Equipment', 'Travel', 'Studio hire', 'Second shooter', 'Software', 'Rent'],
};

/**
 * A one-off transaction with no booking behind it — a cost, a refund, anything
 * the studio needs on the ledger that Bookings didn't raise.
 *
 * The studio and the person recording it are no longer props. They used to be,
 * and the server took them on trust, which meant this form could write into
 * another studio's books. They now come from the session, server-side.
 */
export function CreateTransactionForm({ currencyCode }: { currencyCode: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [type, setType] = useState('');
  const [amount, setAmount] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const reset = () => { setType(''); setAmount(''); setKind('expense'); };

  const submit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { alert('Enter an amount.'); return; }
    if (!type.trim()) { alert('Give it a label, so the books read like sentences later.'); return; }
    startTransition(async () => {
      try {
        await createTransaction({ kind, type: type.trim(), amount: amt, currency: currencyCode });
        setOpen(false);
        reset();
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Failed to log that.');
      }
    });
  };

  if (!open) {
    return (
      <button className="q-btn q-btn-primary" onClick={() => setOpen(true)}>
        + Log money
      </button>
    );
  }

  return (
    <div className="q-stack q-stack-sm">
      <div className="q-row">
        <select
          className="q-select"
          value={kind}
          onChange={(e) => { setKind(e.target.value as TransactionKind); setType(''); }}
        >
          {TRANSACTION_KINDS.map((k) => (
            <option key={k} value={k}>{KINDS[k].label}</option>
          ))}
        </select>
        <input
          className="q-input"
          placeholder="What for?"
          value={type}
          onChange={(e) => setType(e.target.value)}
          list={`money-suggestions-${kind}`}
          style={{ width: '12rem' }}
        />
        <datalist id={`money-suggestions-${kind}`}>
          {SUGGESTIONS[kind].map((s) => <option key={s} value={s} />)}
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
        <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => { setOpen(false); reset(); }}>
          Cancel
        </button>
      </div>
      <span className="q-meta-sm">{KINDS[kind].hint} It starts unsettled — mark it received once the money actually moves.</span>
    </div>
  );
}
