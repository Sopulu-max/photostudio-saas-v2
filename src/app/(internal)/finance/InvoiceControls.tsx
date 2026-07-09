'use client';

import React, { useState } from 'react';
import { recordPaymentAction } from '@/app/actions/finance';
import { CheckCircle, DollarSign, Loader2 } from 'lucide-react';

export function InvoiceControls({ invoiceId, amountDue, isPaid }: { invoiceId: string, amountDue: number, isPaid: boolean }) {
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState(amountDue);
  const [method, setMethod] = useState('Transfer');
  
  if (isPaid) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-state-success)', fontSize: '0.9rem', fontWeight: 500 }}>
        <CheckCircle size={18} /> Settled
      </div>
    );
  }

  const handlePay = async () => {
    if (!amount || amount <= 0) return;
    try {
      setLoading(true);
      await recordPaymentAction(invoiceId, amount, method);
    } catch (e) {
      console.error(e);
      alert('Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <input 
        type="number" 
        value={amount} 
        onChange={e => setAmount(Number(e.target.value))}
        style={{ width: '100px', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-base)' }}
      />
      <select 
        value={method} 
        onChange={e => setMethod(e.target.value)}
        style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-base)' }}
      >
        <option value="Transfer">Transfer</option>
        <option value="Card">Card</option>
        <option value="Cash">Cash</option>
      </select>
      <button 
        onClick={handlePay} 
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 12px',
          background: 'var(--color-brand-primary)',
          color: 'var(--color-brand-on-primary)',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'wait' : 'pointer',
          fontWeight: 500
        }}
      >
        {loading ? <Loader2 size={16} className="spin" /> : <DollarSign size={16} />}
        Record Payment
      </button>
    </div>
  );
}
