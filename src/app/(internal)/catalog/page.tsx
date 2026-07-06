import React from 'react';
import Link from 'next/link';
import { getOrgId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { KernelRepository } from '@/lib/domains/kernel/repository';

export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  const orgId = await getOrgId();
  if (!orgId) return null;

  const supabase = await createClient();
  const repo = new KernelRepository(supabase);
  const services = await repo.getServicesByOrganization(orgId);

  return (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '20px' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-family-serif)', fontSize: '2.5rem', margin: '0 0 8px 0' }}>Service Catalog</h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '1.1rem' }}>The architectural blueprint for the experiences you offer.</p>
        </div>
        <Link 
          href="/catalog/new"
          style={{
            background: 'var(--color-primary)',
            color: 'var(--color-background)',
            padding: '10px 20px',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '0.9rem',
            letterSpacing: '0.02em',
            transition: 'opacity var(--transition-fast)'
          }}
        >
          Compose Service
        </Link>
      </header>

      {services.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', border: '1px dashed var(--color-border-subtle)', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '1.2rem', margin: '0 0 12px 0' }}>No services composed yet.</h3>
          <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 24px 0' }}>Create your first service to define what clients can request.</p>
          <Link href="/catalog/new" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}>
            Compose Service →
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
          {services.map(service => (
            <div key={service.id} style={{
              background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '12px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              transition: 'transform var(--transition-fast), box-shadow var(--transition-fast)',
              cursor: 'pointer'
            }}
            className="hover-card">
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', background: 'var(--color-background)', padding: '4px 8px', borderRadius: '4px' }}>
                  {service.status}
                </span>
              </div>
              <h3 style={{ fontSize: '1.3rem', margin: '0 0 8px 0', fontFamily: 'var(--font-family-serif)' }}>{service.name}</h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 24px 0', flex: 1 }}>
                {service.description || 'No description provided.'}
              </p>
              
              <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  Price Structure
                </div>
                <div style={{ fontWeight: 500, fontFamily: 'var(--font-family-mono, monospace)' }}>
                  {service.pricingRules && service.pricingRules.basePrice ? `₦${Number(service.pricingRules.basePrice).toLocaleString()}` : 'Custom'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        .hover-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.1);
        }
      `}} />
    </div>
  );
}
