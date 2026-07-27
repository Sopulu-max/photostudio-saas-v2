'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createDeliverable } from '@/lib/actions/assets';
import { Package } from 'lucide-react';

export function CreateDeliverableClient({ assetId, orgId, actorId, contracts }: { assetId: string, orgId: string, actorId: string, contracts: any[] }) {
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState(contracts[0]?.id || '');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract) return;

    const contract = contracts.find(a => a.id === selectedContract);
    if (!contract) return;

    startTransition(async () => {
      try {
        await createDeliverable({
          organizationId: orgId,
          assetId,
          contractId: contract.id,
          personId: contract.person_id,
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
                Package this asset for delivery to a client under an active contract.
              </p>
              <div>
                <label className="q-label">Select Target Contract</label>
                {contracts.length === 0 ? (
                  <div style={{ padding: '8px', background: 'color-mix(in srgb, var(--q-color-danger) 13%, transparent)', color: 'var(--q-color-danger)', borderRadius: '4px', fontSize: '0.875rem' }}>
                    No active contracts found.
                  </div>
                ) : (
                  <select 
                    className="q-input" 
                    value={selectedContract}
                    onChange={(e) => setSelectedContract(e.target.value)}
                    required
                  >
                    {contracts.map((a) => (
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
                <button type="submit" className="q-btn q-btn-primary" disabled={isPending || contracts.length === 0}>
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
