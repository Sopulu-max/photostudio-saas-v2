'use client';

import React from 'react';

interface PricingBlockProps {
  basePrice: string | number;
  onChange: (price: string) => void;
}

export default function PricingBlock({ basePrice, onChange }: PricingBlockProps) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute',
        top: '-10px',
        left: '-16px',
        background: 'var(--color-surface-elevated)',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.7rem',
        color: 'var(--color-primary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        border: '1px solid var(--color-border-subtle)',
        opacity: 0.8
      }}>
        Pricing Renderer (Binds to Service.Pricing)
      </div>

      <div style={{ 
        background: 'var(--color-surface-elevated)', 
        padding: '32px', 
        borderRadius: '12px', 
        border: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px'
      }}>
        <label style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Starting Investment
        </label>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '2rem', color: 'var(--color-text-secondary)' }}>₦</span>
          <input
            type="number"
            placeholder="0.00"
            value={basePrice}
            onChange={e => onChange(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '2px solid transparent',
              fontSize: '3rem',
              fontFamily: 'var(--font-family-mono, monospace)',
              color: 'var(--color-text)',
              outline: 'none',
              width: '200px',
              textAlign: 'center',
              transition: 'border-color 0.2s'
            }}
            className="builder-input-price"
          />
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .builder-input-price:hover {
          border-bottom-color: var(--color-border-subtle) !important;
        }
        .builder-input-price:focus {
          border-bottom-color: var(--color-primary) !important;
        }
      `}} />
    </div>
  );
}
