'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { settleTransaction } from '@/lib/actions/finances';
import { Check } from 'lucide-react';

export function SettleTransactionClient({ transactionId, orgId, actorId }: { transactionId: string, orgId: string, actorId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSettle = () => {
    startTransition(async () => {
      try {
        await settleTransaction(transactionId, orgId, actorId);
        router.refresh();
      } catch (e) {
        console.error('Failed to settle transaction', e);
        alert('Failed to mark transaction as settled.');
      }
    });
  };

  return (
    <button 
      className="q-btn q-btn-primary" 
      onClick={handleSettle}
      disabled={isPending}
    >
      <Check size={16} style={{ marginRight: '8px' }} />
      {isPending ? 'Settling...' : 'Mark as Settled'}
    </button>
  );
}
