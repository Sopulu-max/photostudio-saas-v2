'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createDeliverable } from '@/lib/actions/assets';
import { Package } from 'lucide-react';

export function CreateDeliverableClient({ assetId, orgId, actorId, agreements }: { assetId: string, orgId: string, actorId: string, agreements: any[] }) {
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState(agreements[0]?.id || '');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgreement) return;

    const agreement = agreements.find(a => a.id === selectedAgreement);
    if (!agreement) return;

    startTransition(async () => {
      try {
        await createDeliverable({
          organizationId: orgId,
          assetId,
          agreementId: agreement.id,
          personId: agreement.person_id,
          actorId
        });
        
        setIsModalOpen(false);
        router.refresh();
      } catch (e) {
        console.error('Failed to create deliverable', e);
        alert('Failed to package asset as deliverable.');
      }
    });
  };

  return (
    <>
      <button 
        className="q-btn q-btn-primary" 
        onClick={() => setIsModalOpen(true)}
      >
        <Package size={16} style={{ marginRight: '8px' }} />
        Generate Deliverable
      </button>

      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="q-card" style={{ width: '400px', padding: '24px' }}>
            <h2 style={{ margin: '0 0 16px 0' }}>Generate Deliverable</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>
                Package this asset for delivery to a client under an active agreement.
              </p>
              <div>
                <label className="q-label">Select Target Agreement</label>
                {agreements.length === 0 ? (
                  <div style={{ padding: '8px', background: '#FEE2E2', color: '#991B1B', borderRadius: '4px', fontSize: '0.875rem' }}>
                    No active agreements found.
                  </div>
                ) : (
                  <select 
                    className="q-input" 
                    value={selectedAgreement}
                    onChange={(e) => setSelectedAgreement(e.target.value)}
                    required
                  >
                    {agreements.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.person?.display_name} - {new Date(a.created_at).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="q-btn q-btn-outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="q-btn q-btn-primary" disabled={isPending || agreements.length === 0}>
                  {isPending ? 'Generating...' : 'Confirm Delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
