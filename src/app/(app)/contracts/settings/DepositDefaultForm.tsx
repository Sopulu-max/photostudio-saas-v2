'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setDepositDefault } from '@/modules/contracts/interface';

/**
 * What the studio asks for up front, as a share of the total.
 *
 * Snapshotted onto a contract when it is drafted, like the terms text beside
 * it — so raising this does not reprice an agreement a client has already read,
 * and a single contract can still be amended away from it.
 */
export function DepositDefaultForm({ initialPercentage }: { initialPercentage: number }) {
  const [value, setValue] = useState(String(initialPercentage));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
  const dirty = valid && parsed !== initialPercentage;

  const save = () =>
    startTransition(async () => {
      try {
        await setDepositDefault(parsed);
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Could not save.');
      }
    });

  return (
    <div className="q-stack q-stack-sm">
      <div className="q-row">
        <input
          className="q-input"
          type="number"
          min={0}
          max={100}
          step={1}
          style={{ maxWidth: '120px' }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Deposit percentage"
        />
        <span className="q-meta">% of the total, due on confirmation</span>
      </div>

      {!valid && value.trim() !== '' && (
        <span className="q-meta-sm">Enter a number between 0 and 100.</span>
      )}

      {dirty && (
        <div className="q-row">
          <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending} onClick={save}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" disabled={isPending} onClick={() => setValue(String(initialPercentage))}>
            Cancel
          </button>
        </div>
      )}

      <span className="q-meta-sm">
        Set to 0 to invoice the full amount on signing. New contracts use this value; existing
        contracts retain the figure they were signed on.
      </span>
    </div>
  );
}
