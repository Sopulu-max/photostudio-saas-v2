import React from 'react';
import { loginCustomer } from '@/app/actions/portal';

export default async function PortalLoginPage({ params }: { params: Promise<any> }) {
  const { orgId } = await params;
  
  return (
    <div style={{ maxWidth: '400px', margin: '60px auto', padding: '24px', background: 'var(--color-surface-elevated)', borderRadius: '8px', border: '1px solid var(--color-border-subtle)' }}>
      <h2 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Sign in to your portal</h2>
      <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
        Enter your email or phone number to access your agreements and instances.
      </p>
      
      <form action={async (formData: FormData) => {
        'use server';
        const identifier = formData.get('identifier') as string;
        await loginCustomer(orgId, identifier);
      }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>Email or Phone</label>
          <input 
            type="text" 
            name="identifier" 
            required
            placeholder="e.g. hello@example.com"
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-base)' }}
          />
        </div>
        
        <button type="submit" style={{
          padding: '10px',
          background: 'var(--color-brand-primary)',
          color: 'var(--color-brand-on-primary)',
          border: 'none',
          borderRadius: '4px',
          fontWeight: 600,
          cursor: 'pointer'
        }}>
          Continue
        </button>
      </form>
    </div>
  );
}
