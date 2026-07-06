'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { defineServiceAction } from '@/app/actions/kernel';

export default function ComposeServicePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCompose = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    
    const pricingRules = basePrice ? { basePrice: Number(basePrice) } : undefined;
    
    const res = await defineServiceAction({
      name,
      description,
      pricingRules
    });
    
    if (res.success) {
      router.push('/catalog');
    } else {
      alert(res.error);
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ marginBottom: '60px' }}>
        <button onClick={() => router.back()} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: 0, fontSize: '0.9rem' }}>
          ← Back to Catalog
        </button>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        
        <div style={{
          width: '100%',
          maxWidth: '500px',
          background: 'var(--color-surface-elevated)',
          borderRadius: '16px',
          padding: '40px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          border: '1px solid var(--color-border-subtle)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Decorative element */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, var(--color-primary), #a855f7)' }} />
          
          <p style={{ margin: '0 0 8px 0', color: 'var(--color-text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Service Composition
          </p>

          <input
            type="text"
            placeholder="Service Name (e.g. Luxury Portrait)"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid transparent',
              fontSize: '2rem',
              fontFamily: 'var(--font-family-serif)',
              color: 'var(--color-text)',
              padding: '8px 0',
              margin: '0 0 16px 0',
              outline: 'none',
              transition: 'border-color var(--transition-fast)'
            }}
            autoFocus
            className="composition-input"
          />

          <textarea
            placeholder="Describe the experience to the client..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid transparent',
              fontSize: '1rem',
              color: 'var(--color-text-secondary)',
              padding: '8px 0',
              margin: '0 0 32px 0',
              outline: 'none',
              minHeight: '80px',
              resize: 'none',
              lineHeight: 1.6,
              transition: 'border-color var(--transition-fast)'
            }}
            className="composition-input"
          />

          <div style={{ background: 'var(--color-background)', padding: '24px', borderRadius: '12px', border: '1px solid var(--color-border-subtle)' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>Base Price (₦)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.5rem', color: 'var(--color-text-secondary)' }}>₦</span>
              <input
                type="number"
                placeholder="0.00"
                value={basePrice}
                onChange={e => setBasePrice(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.5rem',
                  fontFamily: 'var(--font-family-mono, monospace)',
                  color: 'var(--color-text)',
                  outline: 'none',
                  borderBottom: '1px solid transparent'
                }}
                className="composition-input"
              />
            </div>
          </div>

          <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleCompose}
              disabled={isSubmitting || !name.trim()}
              style={{
                background: name.trim() ? 'var(--color-text)' : 'var(--color-border-subtle)',
                color: name.trim() ? 'var(--color-background)' : 'var(--color-text-secondary)',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 500,
                cursor: name.trim() && !isSubmitting ? 'pointer' : 'not-allowed',
                transition: 'all var(--transition-fast)'
              }}
            >
              {isSubmitting ? 'Binding...' : 'Establish Service'}
            </button>
          </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .composition-input:focus {
          border-bottom-color: var(--color-border-subtle) !important;
        }
      `}} />
    </div>
  );
}
