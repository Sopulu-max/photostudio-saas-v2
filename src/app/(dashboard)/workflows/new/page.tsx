'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { autoBookService } from '@/lib/actions/intents';
import { createClient } from '@/lib/supabase/client';

export default function NewProductionPage() {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [serviceTemplateId, setServiceTemplateId] = useState('');
  const [basePrice, setBasePrice] = useState('0');
  const [deposit, setDeposit] = useState('0');

  useEffect(() => {
    const fetchContext = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.organization_id) {
        const id = user.user_metadata.organization_id;
        setOrgId(id);
        
        // Fetch Service Templates to populate the dropdown.
        // Pricing is stored as a JSONB `pricing` object ({ base_price, deposit_percentage, currency }),
        // not as top-level columns.
        const { data: svcs } = await supabase
          .from('service_templates')
          .select('id, name, pricing')
          .eq('organization_id', id);

        if (svcs) setTemplates(svcs);
      }
    };
    fetchContext();
  }, []);

  const handleTemplateSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tId = e.target.value;
    setServiceTemplateId(tId);
    
    if (tId) {
      const tmpl = templates.find(t => t.id === tId);
      if (tmpl) {
        // pricing.base_price is stored in whole currency units (dollars), not cents.
        setBasePrice(String(tmpl.pricing?.base_price ?? 0));
        setDeposit(String(tmpl.pricing?.deposit_percentage ?? 0));
      }
    } else {
      setBasePrice('0');
      setDeposit('0');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (!orgId) throw new Error('No organization context.');

      const result = await autoBookService({
        organizationId: orgId,
        serviceTemplateId: serviceTemplateId || undefined,
        clientInfo: {
          name: clientName,
          email: clientEmail,
          phone: clientPhone,
        },
        formData: { notes: 'Manually entered via Studio Desk' },
        basePrice: parseFloat(basePrice) * 100, // convert to cents
        depositPercentage: parseFloat(deposit),
        currency: 'USD',
      });

      if (result.workflowId) {
        router.push(`/workflows/${result.workflowId}`);
      } else {
        router.push('/workflows');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create booking.');
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <header className="q-page-header">
        <h1 className="q-page-title">New Workflow (Booking)</h1>
        <p className="q-page-subtitle">Manually enter a booking to spawn a workspace and invoice.</p>
      </header>

      <form onSubmit={handleSubmit} className="q-card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        <section>
          <h2 style={{ fontSize: '1rem', marginBottom: '16px' }}>Client Details</h2>
          <div style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label className="q-label">Full Name</label>
              <input type="text" className="q-input" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
            </div>
            <div>
              <label className="q-label">Email Address</label>
              <input type="email" className="q-input" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} required />
            </div>
            <div>
              <label className="q-label">Phone Number (Optional)</label>
              <input type="tel" className="q-input" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
            </div>
          </div>
        </section>

        <section style={{ borderTop: '1px solid var(--q-color-ink-200)', paddingTop: '24px' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '16px' }}>Booking Details</h2>
          <div style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label className="q-label">Service / Package</label>
              <select className="q-select" value={serviceTemplateId} onChange={handleTemplateSelect}>
                <option value="">Custom Service (No Template)</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--q-color-ink-500)' }}>
                Selecting a template will attach its workflow blueprint and default pricing.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="q-label">Base Price ($)</label>
                <input type="number" step="0.01" min="0" className="q-input" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
              </div>
              <div>
                <label className="q-label">Deposit Required (%)</label>
                <input type="number" step="1" min="0" max="100" className="q-input" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        {error && <div style={{ color: 'red', fontSize: '0.875rem' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--q-color-ink-200)', paddingTop: '24px' }}>
          <button type="button" onClick={() => router.push('/workflows')} className="q-btn q-btn-secondary" disabled={isLoading}>
            Cancel
          </button>
          <button type="submit" className="q-btn q-btn-primary" disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create Workflow'}
          </button>
        </div>
      </form>
    </div>
  );
}
