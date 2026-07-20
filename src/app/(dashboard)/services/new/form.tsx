'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createServiceTemplate } from '@/lib/actions/services';

export function NewServiceForm({ workflowTemplates }: { workflowTemplates: any[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [basePrice, setBasePrice] = useState(0);
  const [currency, setCurrency] = useState('USD');
  const [depositPercentage, setDepositPercentage] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setIsSubmitting(true);
    try {
      const pricing = {
        base_price: basePrice,
        currency,
        deposit_percentage: depositPercentage,
      };
      await createServiceTemplate(name, workflowId || null, pricing);
      router.push('/services');
    } catch (error) {
      console.error(error);
      alert('Failed to create service template.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '64px' }}>
      <header className="q-page-header">
        <h1 className="q-page-title">New Service Template</h1>
        <p className="q-page-subtitle">Define what you sell and link it to your production pipeline.</p>
      </header>

      <form onSubmit={handleSubmit} className="q-card" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Service Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Premium Wedding Package"
            style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--q-color-ink-200)', fontSize: '1rem' }}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '8px' }}>Workflow Pipeline (Optional)</label>
          <p style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', margin: '0 0 12px 0' }}>
            When a client books this service, which workflow should the system automatically spawn?
          </p>
          <select
            value={workflowId}
            onChange={(e) => setWorkflowId(e.target.value)}
            style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--q-color-ink-200)', fontSize: '1rem', background: 'white' }}
          >
            <option value="">No standard workflow</option>
            {workflowTemplates.map((wf) => (
              <option key={wf.id} value={wf.id}>{wf.name}</option>
            ))}
          </select>
        </div>

        <div>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>Pricing & Deposit</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>Base Price</label>
              <input
                type="number"
                value={basePrice}
                onChange={(e) => setBasePrice(parseFloat(e.target.value) || 0)}
                min="0"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)', background: 'white' }}
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--q-color-ink-700)' }}>Deposit Required (%)</label>
              <input
                type="number"
                value={depositPercentage}
                onChange={(e) => setDepositPercentage(parseInt(e.target.value) || 0)}
                min="0"
                max="100"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--q-color-ink-200)' }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '24px' }}>
          <button type="submit" disabled={isSubmitting} className="q-btn q-btn-primary" style={{ minWidth: '150px' }}>
            {isSubmitting ? 'Creating...' : 'Create Service'}
          </button>
        </div>
      </form>
    </div>
  );
}
