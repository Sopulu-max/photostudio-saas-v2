'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { activateAgreement } from '@/lib/actions/agreements';
import { Zap } from 'lucide-react';

/**
 * The ignition. Activating a proposed agreement fires the kernel cascade:
 * it spawns the production workflow (with its tasks) and raises the deposit
 * invoice. Until this existed in the UI, only public storefront bookings
 * could trigger it — a deal handled by hand dead-ended here.
 */
export function ActivateAgreementButton({
  agreementId,
  orgId,
  actorId,
}: {
  agreementId: string;
  orgId: string;
  actorId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleActivate = () => {
    startTransition(async () => {
      try {
        await activateAgreement({ agreementId, organizationId: orgId, actorId });
        router.refresh();
      } catch (e) {
        console.error('Failed to activate agreement', e);
        alert('Failed to activate agreement.');
      }
    });
  };

  return (
    <button className="q-btn q-btn-primary" onClick={handleActivate} disabled={isPending}>
      <Zap size={16} style={{ marginRight: '8px' }} />
      {isPending ? 'Activating…' : 'Activate & start production'}
    </button>
  );
}
