'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setTaxRate } from '@/modules/finances/interface';
import { toast, readableError } from '@/components/Toast';

/**
 * The tax the studio charges.
 *
 * Snapshotted onto each invoice as it is raised, like the deposit on a contract
 * — so changing it here affects what you send next, never what a client is
 * already holding.
 */
export function TaxRateForm({ initialRate }: { initialRate: number }) {
  const [value, setValue] = useState(String(initialRate));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
  const dirty = valid && parsed !== initialRate;

  const save = () =>
    startTransition(async () => {
      try {
        await setTaxRate(parsed);
        toast.ok('The tax rate is saved.');
        router.refresh();
      } catch (e: any) {
        toast.bad(readableError(e, 'Could not save.'));
      }
    });

  return (
    <div className="q-stack q-stack-sm">
      <div className="q-row" style={{ alignItems: 'center' }}>
        <input
          className="q-input"
          type="number"
          min={0}
          max={100}
          step={0.5}
          style={{ maxWidth: '120px' }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Tax rate"
        />
        <span className="q-meta">% added to each invoice</span>
      </div>

      {!valid && value.trim() !== '' && (
        <span className="q-meta-sm">Enter a number between 0 and 100.</span>
      )}

      {dirty && (
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending} onClick={save}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            className="q-btn q-btn-secondary q-btn-sm"
            disabled={isPending}
            onClick={() => setValue(String(initialRate))}
          >
            Cancel
          </button>
        </div>
      )}

      <span className="q-meta-sm">
        Set to 0 if you do not charge tax. The rate is recorded on each invoice when it is raised,
        so changing it here does not alter invoices already issued.
      </span>
    </div>
  );
}
