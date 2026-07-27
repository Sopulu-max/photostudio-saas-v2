'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { activateContract } from '@/lib/actions/contracts';
import { Zap } from 'lucide-react';

/**
 * Activating a proposed contract marks it active and signed. It does not spawn
 * work or invoices — the studio adds those from the booking when they choose.
 */
export function ActivateContractButton({
  contractId,
  orgId,
  actorId,
}: {
  contractId: string;
  orgId: string;
  actorId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleActivate = () => {
    startTransition(async () => {
      try {
        await activateContract({ contractId, organizationId: orgId, actorId });
        router.refresh();
      } catch (e) {
        console.error('Failed to activate contract', e);
        alert('Failed to activate contract.');
      }
    });
  };

  return (
    <button className="q-btn q-btn-primary" onClick={handleActivate} disabled={isPending}>
      <Zap size={16} style={{ marginRight: '8px' }} />
      {isPending ? 'Activating…' : 'Activate contract'}
    </button>
  );
}
