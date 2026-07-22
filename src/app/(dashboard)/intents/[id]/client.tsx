'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createAgreement } from '@/lib/actions/agreements';

export function IntentActionsClient({ intent, orgId, actorId }: { intent: any, orgId: string, actorId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleApprove = () => {
    startTransition(async () => {
      try {
        await createAgreement({
          organizationId: orgId,
          intentId: intent.id,
          personId: intent.person_id,
          terms: { serviceTemplate: intent.service_template_id },
          actorId: actorId
        });
        
        // Refresh the page or navigate to agreements
        router.push('/agreements');
        router.refresh();
      } catch (e) {
        console.error('Failed to approve intent', e);
        alert('Failed to convert intent to agreement.');
      }
    });
  };

  if (intent.status === 'approved') {
    return (
      <div style={{ padding: '16px', background: '#D1FAE5', color: '#065F46', borderRadius: '8px', border: '1px solid #34D399', textAlign: 'center' }}>
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
