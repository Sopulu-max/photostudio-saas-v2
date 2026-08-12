'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { settleTransaction, voidTransaction } from '@/modules/finances/interface';
import { Check } from 'lucide-react';

/**
 * The two things you can do to money that hasn't moved yet: say it arrived, or
 * withdraw it. The studio and the person doing it come from the session — they
 * used to be props, which meant the browser named the actor in the audit log.
 */
export function TransactionActions({
  transactionId,
  kindLabel,
}: {
  transactionId: string;
  kindLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try { await fn(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'That didn’t work.'); }
    });

  if (confirming) {
    return (
      <div className="q-note q-note-bad q-stack q-stack-sm">
        <span className="q-meta-plain">
          Withdraw this {kindLabel.toLowerCase()}? It stays in the books marked void, so the
          record shows it was raised and taken back.
        </span>
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending}
            onClick={() => run(() => voidTransaction({ transactionId }))}>
            Void it
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setConfirming(false)}>Keep it</button>
        </div>
      </div>
    );
  }

  return (
    <div className="q-row">
      <button className="q-btn q-btn-primary" disabled={isPending}
        onClick={() => run(() => settleTransaction({ transactionId }))}>
        <Check size={16} style={{ marginRight: '8px' }} />
        {isPending ? 'Saving…' : 'Mark as received'}
      </button>
      <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => setConfirming(true)}>
        Void
      </button>
    </div>
  );
}
