'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { convertIntentToAgreement } from '@/lib/actions/intents';

export function IntentActionsClient({ intent, orgId, actorId }: { intent: any, orgId: string, actorId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleApprove = () => {
    startTransition(async () => {
      try {
        const { agreementId } = await convertIntentToAgreement({
          intentId: intent.id,
          organizationId: orgId,
          actorId,
        });

        // Land on the new agreement so the operator can activate it next.
        router.push(`/agreements/${agreementId}`);
        router.refresh();
      } catch (e) {
        console.error('Failed to approve intent', e);
        alert('Failed to convert intent to agreement.');
      }
    });
  };

  if (intent.status === 'accepted') {
    return (
      <div style={{ padding: '16px', background: 'color-mix(in srgb, var(--q-color-success) 15%, transparent)', color: 'var(--q-color-success)', borderRadius: '8px', border: '1px solid color-mix(in srgb, var(--q-color-success) 35%, transparent)', textAlign: 'center' }}>
        This intent has already been converted into an Agreement.
      </div>
    );
  }

  return (
    <div className="q-card" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.125rem' }}>Convert to Agreement</h3>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>
          Approving this intent will generate a formal proposal and agreement for {intent.person?.display_name}.
        </p>
      </div>
      <button 
        className="q-btn q-btn-primary" 
        onClick={handleApprove}
        disabled={isPending}
      >
        {isPending ? 'Converting...' : 'Approve & Create Agreement'}
      </button>
    </div>
  );
}
