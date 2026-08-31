'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reviseContractTerms } from '@/modules/contracts/interface';
import { formatMoney } from '@/kernel/currency';
import { toast, readableError } from '@/components/Toast';

/**
 * The actual agreement — terms text, price, and deposit — editable in place.
 * Revising an already-active contract moves it back to 'modified': the
 * client agreed to specific words and numbers, so changing either needs to
 * go through Activate again before it counts as signed.
 */
export function TermsEditor({
  contractId,
  agreementText: initialText,
  basePrice: initialPrice,
  depositPercentage: initialDeposit,
  currency,
  status,
}: {
  contractId: string;
  agreementText: string;
  basePrice: number;
  depositPercentage: number;
  currency: string;
  status: string;
}) {
  const [text, setText] = useState(initialText);
  const [price, setPrice] = useState(String(initialPrice));
  const [deposit, setDeposit] = useState(String(initialDeposit));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = text !== initialText || price !== String(initialPrice) || deposit !== String(initialDeposit);
  const depositAmount = (parseFloat(price) || 0) * (parseFloat(deposit) || 0) / 100;
  const wasActive = status === 'active';

  const save = () =>
    startTransition(async () => {
      try {
        await reviseContractTerms({
          contractId,
          agreementText: text,
          basePrice: price === '' ? 0 : parseFloat(price),
          depositPercentage: deposit === '' ? 0 : parseFloat(deposit),
        });
        router.refresh();
      } catch (e: any) {
        toast.bad(readableError(e, 'Could not save the terms.'));
      }
    });

  const reset = () => {
    setText(initialText);
    setPrice(String(initialPrice));
    setDeposit(String(initialDeposit));
  };

  return (
    <div className="q-stack q-stack-sm">
      <div className="q-field">
        <label className="q-label">Terms &amp; conditions</label>
        <textarea
          className="q-textarea"
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Payment schedule, cancellation policy, usage rights — whatever this agreement actually needs to say. Set a default in Contract settings."
        />
      </div>

      <div className="q-grid-3">
        <div className="q-field">
          <label className="q-label">Total ({currency})</label>
          <input className="q-input" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="q-field">
          <label className="q-label">Deposit (%)</label>
          <input className="q-input" type="number" min="0" max="100" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </div>
        <div className="q-panel">
          <div className="q-stat-label">Due now</div>
          <div className="q-stat-value">{formatMoney(depositAmount, currency)}</div>
        </div>
      </div>

      {dirty && (
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending} onClick={save}>
            {isPending ? 'Saving…' : 'Save terms'}
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" disabled={isPending} onClick={reset}>
            Cancel
          </button>
          {wasActive && (
            <span className="q-meta-sm">This contract is signed — saving moves it back to &ldquo;modified&rdquo; until it&rsquo;s re-activated.</span>
          )}
        </div>
      )}
    </div>
  );
}
