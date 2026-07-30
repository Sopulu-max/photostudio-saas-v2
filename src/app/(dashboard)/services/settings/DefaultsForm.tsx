'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setServiceDefaults } from '@/modules/services/interface';

export function DefaultsForm({ depositPercentage }: { depositPercentage: number }) {
  const [pct, setPct] = useState(String(depositPercentage));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const dirty = pct !== String(depositPercentage);

  return (
    <div className="q-row">
      <div className="q-field" style={{ maxWidth: '12rem' }}>
        <label className="q-label">Deposit on new services (%)</label>
        <input className="q-input" type="number" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} />
      </div>
      {dirty && (
        <>
          <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending}
            onClick={() => startTransition(async () => {
              try { await setServiceDefaults({ depositPercentage: parseFloat(pct) || 0 }); router.refresh(); }
              catch (e: any) { alert(e?.message || 'Could not save.'); }
            })}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setPct(String(depositPercentage))}>Cancel</button>
        </>
      )}
    </div>
  );
}
