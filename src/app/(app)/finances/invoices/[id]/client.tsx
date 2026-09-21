'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast, readableError } from '@/components/Toast';
import {
  issueInvoice, voidInvoice, createTransaction, settleTransaction,
} from '@/modules/finances/interface';

function useRun() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e: any) { toast.bad(readableError(e, 'The action could not be completed.')); }
    });
  return { isPending, run, router };
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
          <button className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending}
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
        <button className="q-btn q-btn-primary" aria-busy={isPending} disabled={isPending || !hasLines}
          title={hasLines ? undefined : 'Nothing on the booking to invoice yet'}
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
    if (!amt || amt <= 0) { toast.bad('Enter an amount.'); return; }
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
      <button className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending} onClick={submit}>
        {isPending ? 'Saving…' : 'Record it'}
      </button>
      <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}
