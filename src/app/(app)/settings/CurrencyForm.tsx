'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setStudioCurrency } from '@/kernel/organizations';
import { CURRENCIES } from '@/kernel/currency';
import { toast, readableError } from '@/components/Toast';

/**
 * Currency is genuinely studio-wide — it shapes services, contracts and
 * invoices alike — so it lives in global Settings rather than inside a module.
 */
/*
 * SAID BECAUSE IT CANNOT BE SEEN.
 *
 * The rule this follows: confirm what you cannot see, flash what you can. A row
 * appearing in a list is its own confirmation and needs no sentence. A setting
 * that saves and leaves the page looking identical has nothing to show for
 * itself, and silence there reads exactly like a click that did not register.
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
              aria-busy={isPending}
              disabled={isPending}
              onClick={() => startTransition(async () => {
                try {
                  await setStudioCurrency(code);
                  toast.ok(`The studio currency is now ${code}.`);
                  router.refresh();
                }
                catch (e: any) { toast.bad(readableError(e, 'Could not change the currency.')); }
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
