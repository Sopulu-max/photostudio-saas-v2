'use client';

import React, { useState } from 'react';
import { executeQuickSale } from '@/app/actions/quick-sale';
import { EntitySignature } from '@/components/ontology/EntitySignature';
import { ServiceInstanceDTO, ServiceDTO } from '@/lib/domains/kernel/types';
import { ArrowRight, Phone, Briefcase, Camera } from 'lucide-react';

interface QuickSaleTerminalProps {
  services: ServiceDTO[];
}

export function QuickSaleTerminal({ services }: QuickSaleTerminalProps) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  
  // Hold the spawned instance for the receipt view
  const [spawnedInstance, setSpawnedInstance] = useState<ServiceInstanceDTO | null>(null);

  async function handleSubmit(formData: FormData) {
    setStatus('submitting');
    setError(null);
    
    // Auto-fill price based on selected service
    const serviceId = formData.get('serviceId') as string;
    const service = services.find(s => s.id === serviceId);
    if (service && service.pricingRules?.base_price) {
      formData.set('price', service.pricingRules.base_price.toString());
    } else {
      formData.set('price', '0');
    }
    
    // Default name if none provided
    if (!formData.get('customerName')) {
      formData.set('customerName', 'Walk-in Customer');
    }

    const { success, error, instance } = await executeQuickSale(formData);

    if (!success) {
      setError(error || 'Quick sale failed.');
      setStatus('idle');
    } else {
      setSpawnedInstance(instance as ServiceInstanceDTO);
      setStatus('success');
    }
  }

  const containerStyle: React.CSSProperties = {
    background: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border-subtle)',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
    width: '100%',
    maxWidth: '360px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px 12px 40px',
    background: 'var(--color-surface-base)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '8px',
    outline: 'none',
    fontSize: '1rem',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family-sans)',
    transition: 'border-color var(--transition-fast)',
    WebkitAppearance: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '6px',
    display: 'block',
  };

  const buttonStyle: React.CSSProperties = {
    marginTop: '12px',
    width: '100%',
    padding: '14px 16px',
    background: 'var(--color-text-primary)',
    color: 'var(--color-surface-elevated)',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
    opacity: status === 'submitting' ? 0.7 : 1,
    transition: 'transform var(--transition-fast), background var(--transition-fast)',
  };

  if (status === 'success' && spawnedInstance) {
    return (
      <div style={containerStyle}>
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-family-serif)', marginBottom: '4px', margin: 0 }}>Sale Recorded</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', margin: 0 }}>
            Instance added to the pipeline.
          </p>
        </div>
        
        {/* Render the actual Kernel entity signature */}
        <div style={{ marginBottom: '24px' }}>
          <EntitySignature type="service_instance" data={spawnedInstance} scale="card" />
        </div>

        <button 
          onClick={() => {
            setStatus('idle');
            setSpawnedInstance(null);
          }}
          style={{
            width: '100%', padding: '12px', background: 'var(--color-surface-base)', color: 'var(--color-text-primary)',
            border: `1px solid var(--color-border-subtle)`, borderRadius: '8px', fontWeight: 600, cursor: 'pointer', transition: 'background var(--transition-fast)'
          }}
        >
          New Quick Sale
        </button>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div style={{ width: '32px', height: '32px', background: 'var(--color-text-primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Camera size={16} color="var(--color-surface-elevated)" />
        </div>
        <div>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-family-serif)', fontWeight: 600, fontSize: '1.2rem', color: 'var(--color-text-primary)' }}>Quick Sale</h3>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Record a walk-in</p>
        </div>
      </div>

      <form action={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && (
          <div style={{ padding: '12px', background: 'rgba(217, 4, 41, 0.05)', color: 'var(--color-state-halted)', fontSize: '0.75rem', borderRadius: '8px', border: '1px solid rgba(217, 4, 41, 0.2)' }}>
            {error}
          </div>
        )}
        
        <div>
          <label style={labelStyle}>Phone Number</label>
          <div style={{ position: 'relative' }}>
            <Phone size={16} color="var(--color-text-tertiary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="tel" 
              name="customerPhone" 
              required
              placeholder="080..." 
              style={inputStyle}
              onFocus={(e) => e.target.style.borderColor = 'var(--color-border-focus)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--color-border-subtle)'}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Service</label>
          <div style={{ position: 'relative' }}>
            <Briefcase size={16} color="var(--color-text-tertiary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <select 
              name="serviceId" 
              required
              defaultValue=""
              style={inputStyle}
              onFocus={(e) => e.target.style.borderColor = 'var(--color-border-focus)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--color-border-subtle)'}
            >
              <option value="" disabled>Select a service</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.pricingRules?.base_price ? `— ₦${s.pricingRules.base_price.toLocaleString()}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button type="submit" disabled={status === 'submitting'} style={buttonStyle}>
          {status === 'submitting' ? (
            <span style={{ opacity: 0.8 }}>Recording...</span>
          ) : (
            <>
              Confirm Sale
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
