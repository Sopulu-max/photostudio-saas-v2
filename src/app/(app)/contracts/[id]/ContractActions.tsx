'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { activateContract, cancelContract } from '@/modules/contracts/interface';
import { Zap } from 'lucide-react';
import { toast, readableError } from '@/components/Toast';

/**
 * Activating a proposed contract marks it active and signed. It does not spawn
 * work or invoices — the studio adds those from the booking when they choose.
 */
export function ActivateContractButton({ contractId }: { contractId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleActivate = () => {
    startTransition(async () => {
      try {
        await activateContract({ contractId });
        router.refresh();
      } catch (e) {
        console.error('Failed to activate contract', e);
        toast.bad('Failed to activate contract.');
      }
    });
  };

  return (
    <button className="q-btn q-btn-primary" onClick={handleActivate} aria-busy={isPending} disabled={isPending}>
      <Zap size={16} style={{ marginRight: '8px' }} />
      {isPending ? 'Activating…' : 'Activate contract'}
    </button>
  );
}

/** Void a contract. Never deletes — the booking and any money already raised are untouched. */
export function CancelContractButton({ contractId }: { contractId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleCancel = () => {
    startTransition(async () => {
      try {
        await cancelContract({ contractId });
        router.refresh();
      } catch (e: any) {
        toast.bad(readableError(e, 'Failed to cancel the contract.'));
      }
    });
  };

  if (confirming) {
    return (
      <div className="q-note q-note-bad q-row" style={{ gap: '8px' }}>
        <span className="q-meta-plain">Cancel this contract? The booking and any invoices already raised are untouched.</span>
        <button className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending} onClick={handleCancel}>
          {isPending ? 'Cancelling…' : 'Yes, cancel'}
        </button>
        <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setConfirming(false)}>Keep it</button>
      </div>
    );
  }

  return (
    <button className="q-btn q-btn-secondary" onClick={() => setConfirming(true)}>
      Cancel contract
    </button>
  );
}
