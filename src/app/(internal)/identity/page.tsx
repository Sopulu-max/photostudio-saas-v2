'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { enrichIdentityAction } from '@/app/actions/kernel';

export default function IdentityTendingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // In a real app we'd fetch the current identity on load, but for simplicity we'll just allow setting it.
  
  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    
    const res = await enrichIdentityAction({ name });
    
    if (res.success) {
      router.refresh();
      setIsSubmitting(false);
      alert('Identity enriched successfully.');
    } else {
      alert(res.error);
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', minHeight: '100vh' }}>
      <header style={{ marginBottom: '60px', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '20px' }}>
        <h1 style={{ fontFamily: 'var(--font-family-serif)', fontSize: '2.5rem', margin: '0 0 8px 0' }}>Identity Tending</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '1.1rem' }}>
          Shape the face your studio presents to the world.
        </p>
      </header>

      <div style={{
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '12px',
        padding: '32px',
        marginBottom: '24px'
      }}>
        <h2 style={{ fontSize: '1.2rem', margin: '0 0 16px 0', fontFamily: 'var(--font-family-serif)' }}>Studio Moniker</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
          This is the primary name that binds all public interfaces and operational documents.
        </p>

        <input
          type="text"
          placeholder="Enter studio name..."
          value={name}
          onChange={e => setName(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--color-background)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: '6px',
            fontSize: '1.5rem',
            fontFamily: 'var(--font-family-serif)',
            color: 'var(--color-text)',
            padding: '12px 16px',
            outline: 'none',
            transition: 'border-color var(--transition-fast)'
          }}
          className="focus-ring"
        />

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSave}
            disabled={isSubmitting || !name.trim()}
            style={{
              background: name.trim() ? 'var(--color-text)' : 'var(--color-border-subtle)',
              color: name.trim() ? 'var(--color-background)' : 'var(--color-text-secondary)',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: name.trim() && !isSubmitting ? 'pointer' : 'not-allowed',
              transition: 'all var(--transition-fast)'
            }}
          >
            {isSubmitting ? 'Enriching...' : 'Save Identity'}
          </button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .focus-ring:focus {
          border-color: var(--color-primary) !important;
          box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.2);
        }
      `}} />
    </div>
  );
}
