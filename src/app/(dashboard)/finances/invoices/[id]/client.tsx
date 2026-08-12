'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  issueInvoice, voidInvoice, updateDraftInvoice, createTransaction, settleTransaction,
} from '@/modules/finances/interface';

function useRun() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'That didn’t work.'); }
    });
  return { isPending, run, router };
}

type Line = { description: string; quantity: number; unitPrice: number };

/**
 * The lines, while the invoice is still a draft.
 *
 * Generated from the booking, then editable — a studio adds a travel charge or
 * strikes a line it decided to absorb. Once issued this is gone: the client is
 * holding the document by then.
 */
export function InvoiceLineEditor({
  invoiceId,
  lines: initial,
  currencyCode,
}: {
  invoiceId: string;
  lines: Line[];
  currencyCode: string;
}) {
  const { isPending, run } = useRun();
  const [lines, setLines] = useState<Line[]>(initial);
  const dirty = JSON.stringify(lines) !== JSON.stringify(initial);

  const set = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, x) => (x === i ? { ...l, ...patch } : l)));

  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

  return (
    <div className="q-stack q-stack-sm">
      {lines.map((l, i) => (
        <div key={i} className="q-row">
          <input
            className="q-input"
            value={l.description}
            onChange={(e) => set(i, { description: e.target.value })}
            placeholder="What this line is for"
            style={{ flex: 1, minWidth: '12rem' }}
          />
          <input
            className="q-input" type="number" min="0" step="0.5"
            value={l.quantity}
            onChange={(e) => set(i, { quantity: Number(e.target.value) })}
            style={{ width: '5.5rem' }}
          />
          <input
            className="q-input" type="number" min="0" step="0.01"
            value={l.unitPrice}
            onChange={(e) => set(i, { unitPrice: Number(e.target.value) })}
            style={{ width: '9rem' }}
          />
          <button
            className="q-btn q-btn-secondary q-btn-sm"
            onClick={() => setLines((ls) => ls.filter((_, x) => x !== i))}
          >
            Remove
          </button>
        </div>
      ))}

      <div className="q-row q-row-between">
        <button
          className="q-btn q-btn-secondary q-btn-sm"
          onClick={() => setLines((ls) => [...ls, { description: '', quantity: 1, unitPrice: 0 }])}
        >
          + Add a line
        </button>
        <span className="q-meta q-num">
          {total.toLocaleString(undefined, { style: 'currency', currency: currencyCode })}
        </span>
      </div>

      {dirty && (
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending}
            onClick={() => run(() => updateDraftInvoice({ invoiceId, lines }))}>
            Save lines
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setLines(initial)}>Undo</button>
        </div>
      )}
    </div>
  );
}

/** Send it, or withdraw it. Issuing is what spends the studio's next number. */
export function InvoiceActions({
  invoiceId,
  status,
  hasLines,
  sharePath,
}: {
  invoiceId: string;
  status: string;
  hasLines: boolean;
  sharePath: string | null;
}) {
  const { isPending, run } = useRun();
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  if (confirming) {
    return (
      <div className="q-note q-note-bad q-stack q-stack-sm">
        <span className="q-meta-plain">
          Withdraw this invoice? It keeps its number and stays in the books marked void — a
          cancelled document is part of the record, and a missing number is harder to explain.
        </span>
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending}
            onClick={() => run(() => voidInvoice({ invoiceId }), () => setConfirming(false))}>
            Withdraw it
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setConfirming(false)}>Keep it</button>
        </div>
      </div>
    );
  }

  return (
    <div className="q-row">
      {status === 'draft' && (
        <button className="q-btn q-btn-primary" disabled={isPending || !hasLines}
          title={hasLines ? undefined : 'Add a line first'}
          onClick={() => run(() => issueInvoice({ invoiceId }))}>
          {isPending ? 'Sending…' : 'Issue invoice'}
        </button>
      )}
      {sharePath && (
        <button className="q-btn q-btn-secondary"
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}${sharePath}`);
            setCopied(true); setTimeout(() => setCopied(false), 1600);
          }}>
          {copied ? 'Copied' : 'Copy client link'}
        </button>
      )}
      {status !== 'void' && (
        <button className="q-btn q-btn-secondary" onClick={() => setConfirming(true)}>Withdraw</button>
      )}
    </div>
  );
}

/**
 * Money against this invoice. Recording it settles immediately, because an
 * operator typing this in is reporting something that already happened — the
 * bank transfer landed. Money that hasn't arrived is what the invoice itself
 * represents; it doesn't need a second pending row beside it.
 */
export function RecordPaymentForm({
  invoiceId,
  contactId,
  bookingId,
  currencyCode,
  outstanding,
}: {
  invoiceId: string;
  contactId: string | null;
  bookingId: string | null;
  currencyCode: string;
  outstanding: number;
}) {
  const { isPending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'charge' | 'refund'>('charge');
  const [label, setLabel] = useState('Payment');
  const [amount, setAmount] = useState(String(outstanding || ''));

  if (!open) {
    return (
      <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setOpen(true)}>
        + Record a payment
      </button>
    );
  }

  const submit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { alert('Enter an amount.'); return; }
    run(async () => {
      const tx: any = await createTransaction({
        kind, type: label.trim() || (kind === 'refund' ? 'Refund' : 'Payment'),
        amount: amt, currency: currencyCode,
        invoiceId, contactId: contactId || undefined, bookingId: bookingId || undefined,
      });
      await settleTransaction({ transactionId: tx.id });
    }, () => { setOpen(false); setAmount(''); });
  };

  return (
    <div className="q-row">
      <select className="q-select" value={kind} onChange={(e) => setKind(e.target.value as any)}>
        <option value="charge">Payment received</option>
        <option value="refund">Refund given</option>
      </select>
      <input className="q-input" value={label} onChange={(e) => setLabel(e.target.value)}
        placeholder="Deposit, balance…" style={{ width: '10rem' }} />
      <input className="q-input" type="number" min="0" step="0.01" value={amount}
        onChange={(e) => setAmount(e.target.value)} style={{ width: '9rem' }} />
      <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending} onClick={submit}>
        {isPending ? 'Saving…' : 'Record it'}
      </button>
      <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}
