'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setServiceDefaults } from '@/modules/services/interface';
import type { PaymentPolicy } from '@/modules/services/interface';

export function DefaultsForm({
  paymentPolicy: initialPolicy,
  depositPercentage,
}: {
  paymentPolicy: PaymentPolicy;
  depositPercentage: number;
}) {
  const [policy, setPolicy] = useState<PaymentPolicy>(initialPolicy);
  const [pct, setPct] = useState(String(depositPercentage));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const dirty = policy !== initialPolicy || pct !== String(depositPercentage);

  return (
    <div className="q-row">
      <div className="q-field" style={{ maxWidth: '14rem' }}>
        <label className="q-label">Payment on new services</label>
        <select className="q-select" value={policy} onChange={(e) => setPolicy(e.target.value as PaymentPolicy)}>
          <option value="deposit">Deposit required</option>
          <option value="full">Full payment required</option>
        </select>
      </div>
      {policy === 'deposit' && (
        <div className="q-field" style={{ maxWidth: '12rem' }}>
          <label className="q-label">Deposit (%)</label>
          <input className="q-input" type="number" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} />
        </div>
      )}
      {dirty && (
        <>
          <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending}
            onClick={() => startTransition(async () => {
              try { await setServiceDefaults({ paymentPolicy: policy, depositPercentage: parseFloat(pct) || 0 }); router.refresh(); }
              catch (e: any) { alert(e?.message || 'Could not save.'); }
            })}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => { setPolicy(initialPolicy); setPct(String(depositPercentage)); }}>Cancel</button>
        </>
      )}
    </div>
  );
}
