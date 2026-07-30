'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setStudioCurrency } from '@/kernel/organizations';
import { CURRENCIES } from '@/kernel/currency';

/**
 * Currency is genuinely studio-wide — it shapes services, contracts and
 * invoices alike — so it lives in global Settings rather than inside a module.
 */
export function CurrencyForm({ current }: { current: string }) {
  const [code, setCode] = useState(current);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = code !== current;

  return (
    <div className="q-stack q-stack-sm">
      <div className="q-row">
        <select className="q-select" value={code} onChange={(e) => setCode(e.target.value)} style={{ minWidth: '16rem' }}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.label}</option>
          ))}
        </select>
        {dirty && (
          <>
            <button
              className="q-btn q-btn-primary"
              disabled={isPending}
              onClick={() => startTransition(async () => {
                try { await setStudioCurrency(code); router.refresh(); }
                catch (e: any) { alert(e?.message || 'Could not change the currency.'); }
              })}
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button className="q-btn q-btn-secondary" onClick={() => setCode(current)}>Cancel</button>
          </>
        )}
      </div>
      <span className="q-meta-sm">
        New prices and invoices use this. Amounts already recorded keep the currency they were entered in.
      </span>
    </div>
  );
}
