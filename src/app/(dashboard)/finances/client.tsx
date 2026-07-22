'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTransaction } from '@/lib/actions/finances';
import { Plus } from 'lucide-react';

export function CreateTransactionClient({ orgId, actorId }: { orgId: string, actorId: string }) {
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    direction: 'inbound' as 'inbound' | 'outbound',
    type: 'invoice',
    amount: '',
  });
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createTransaction({
          organizationId: orgId,
          direction: formData.direction,
          type: formData.type,
          amount: parseFloat(formData.amount),
          actorId: actorId
        });
        
        setIsModalOpen(false);
        setFormData({ direction: 'inbound', type: 'invoice', amount: '' });
        router.refresh();
      } catch (e) {
        console.error('Failed to create transaction', e);
        alert('Failed to log transaction.');
      }
    });
  };

  return (
    <>
      <button 
        className="q-btn q-btn-primary" 
        onClick={() => setIsModalOpen(true)}
      >
        <Plus size={16} style={{ marginRight: '8px' }} />
        Log Transaction
      </button>

      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="q-card" style={{ width: '400px', padding: '24px' }}>
            <h2 style={{ margin: '0 0 16px 0' }}>Log Financial Transaction</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="q-label">Direction</label>
                <select 
                  className="q-input" 
                  value={formData.direction}
                  onChange={(e) => setFormData({...formData, direction: e.target.value as any})}
                >
                  <option value="inbound">Inbound (Revenue/Deposit)</option>
                  <option value="outbound">Outbound (Expense/Refund)</option>
                </select>
              </div>
              <div>
                <label className="q-label">Type</label>
                <input 
                  type="text" 
                  className="q-input" 
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value})}
                  placeholder="e.g., invoice, deposit, refund, equipment"
                  required
                />
              </div>
              <div>
                <label className="q-label">Amount (USD)</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="q-input" 
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="q-btn q-btn-outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="q-btn q-btn-primary" disabled={isPending}>
                  {isPending ? 'Logging...' : 'Log Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
