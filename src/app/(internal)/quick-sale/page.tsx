'use client';

import React, { useState } from 'react';
import { executeQuickSale } from '@/app/actions/quick-sale';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { LineageEdge } from '@/components/ontology/LineageEdge';
import { RequestState, AgreementState, InstanceState, CustomerState } from '@/lib/domains/kernel/types';

export default function QuickSalePage() {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [serviceId, setServiceId] = useState('svc-passport');
  const [price, setPrice] = useState('2000');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData();
    formData.append('customerName', customerName);
    formData.append('customerPhone', customerPhone);
    formData.append('serviceId', serviceId);
    formData.append('price', price);

    const response = await executeQuickSale(formData);
    setResult(response);
    setIsSubmitting(false);
  };

  // The Ghost graph elements (before submission) vs Actual graph (after submission)
  const isGhost = !result;

  const ghostCustomer = {
    id: isGhost ? '...' : result.customer.id,
    organizationId: 'org-1111-2222-3333-4444',
    primaryIdentifier: customerPhone || 'Unknown Phone',
    profileData: { name: customerName || 'Unknown Name' },
    status: 'active' as CustomerState,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const ghostRequest = {
    id: isGhost ? '...' : result.request.id,
    organizationId: 'org-1111-2222-3333-4444',
    customerId: ghostCustomer.id,
    requestedServices: { serviceId, name: 'Walk-in Quick Sale' },
    status: 'accepted' as RequestState,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const ghostAgreement = {
    id: isGhost ? '...' : result.agreement.id,
    organizationId: 'org-1111-2222-3333-4444',
    customerId: ghostCustomer.id,
    requestId: ghostRequest.id,
    status: 'active' as AgreementState,
    terms: { price: parseInt(price, 10) || 0, currency: 'NGN' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const ghostInstance = {
    id: isGhost ? '...' : result.instance.id,
    organizationId: 'org-1111-2222-3333-4444',
    agreementId: ghostAgreement.id,
    serviceId: serviceId,
    status: 'created' as InstanceState,
    fulfillmentData: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 600, margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>Walk-in Quick Sale</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '1.1rem' }}>
          Rapid intake operational flow.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: THE INTAKE FORM */}
        <div style={{ 
          background: 'var(--color-surface-elevated)', 
          padding: '32px', 
          borderRadius: '12px',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
        }}>
          <h2 style={{ fontSize: '1.2rem', margin: '0 0 24px 0', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '12px' }}>
            Customer Details
          </h2>
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Phone Number *</label>
              <input 
                type="text" 
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+234..." 
                required
                style={{ width: '100%', padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: '6px', color: 'var(--color-text)', fontSize: '1rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Name (Optional)</label>
              <input 
                type="text" 
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Jane Doe" 
                style={{ width: '100%', padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: '6px', color: 'var(--color-text)', fontSize: '1rem' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Service *</label>
                <select 
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  style={{ width: '100%', padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: '6px', color: 'var(--color-text)', fontSize: '1rem' }}
                >
                  <option value="svc-passport">Passport Photo</option>
                  <option value="svc-print">USB Printing</option>
                  <option value="svc-portrait">Studio Portrait</option>
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Price (₦) *</label>
                <input 
                  type="number" 
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  style={{ width: '100%', padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: '6px', color: 'var(--color-text)', fontSize: '1rem' }}
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isSubmitting || result !== null}
              style={{ 
                marginTop: '12px',
                padding: '16px', 
                background: result ? 'var(--color-success)' : 'var(--color-primary)', 
                color: '#fff', 
                border: 'none', 
                borderRadius: '6px', 
                fontSize: '1rem', 
                fontWeight: 600, 
                cursor: (isSubmitting || result) ? 'default' : 'pointer',
                opacity: isSubmitting ? 0.7 : 1,
                transition: 'background 0.2s'
              }}
            >
              {isSubmitting ? 'Processing...' : result ? '✓ Sale Complete' : 'Complete Sale & Start Session'}
            </button>
            
            {result && (
              <button 
                type="button"
                onClick={() => {
                  setResult(null);
                  setCustomerName('');
                  setCustomerPhone('');
                  setPrice('2000');
                }}
                style={{ background: 'transparent', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Reset for next customer
              </button>
            )}
          </form>
        </div>

        {/* RIGHT COLUMN: GHOST LINEAGE */}
        <div>
          <h2 style={{ fontSize: '1.2rem', margin: '0 0 12px 0', color: isGhost ? 'var(--color-text-secondary)' : 'var(--color-text)' }}>
            {isGhost ? 'Predicted Lineage' : 'Generated Lineage'}
          </h2>
          <p style={{ marginBottom: '32px', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            {isGhost 
              ? 'The system will generate these underlying records to maintain strict ontological integrity (Customer → Request → Agreement → Instance).'
              : 'The transaction is successfully recorded in the database.'}
          </p>
          
          <div style={{ 
            opacity: isGhost ? 0.5 : 1, 
            filter: isGhost ? 'grayscale(80%)' : 'none',
            transition: 'opacity 0.3s, filter 0.3s',
            display: 'flex',
            flexDirection: 'column',
            gap: '0' // Gap handled by lineage edges
          }}>
            <EntitySignature type="customer" data={ghostCustomer} scale="row" />
            <LineageEdge status={isGhost ? 'created' : 'accepted'} length={24} />
            
            <EntitySignature type="request" data={ghostRequest} scale="row" />
            <LineageEdge status={isGhost ? 'created' : 'active'} length={24} />
            
            <EntitySignature type="agreement" data={ghostAgreement} scale="row" />
            <LineageEdge status={isGhost ? 'created' : 'created'} length={24} />
            
            <EntitySignature type="service_instance" data={ghostInstance} scale="row" />
          </div>
        </div>

      </div>
    </div>
  );
}
