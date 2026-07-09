'use client';

import React, { useState } from 'react';
import HeroBlock from './blocks/HeroBlock';
import PricingBlock from './blocks/PricingBlock';

export type BuilderContext = 'service:new' | 'service:edit' | 'identity' | 'storefront';

interface BuilderCanvasProps {
  context: BuilderContext;
  initialData?: any;
  onCommit: (data: any) => Promise<void>;
  isSubmitting?: boolean;
}

/**
 * The BuilderCanvas is the ubiquitous medium for shaping experiences.
 * P3: The medium matches the meaning. This single component instantiates
 * scoped to its context, deriving its palette automatically.
 */
export default function BuilderCanvas({ context, initialData, onCommit, isSubmitting }: BuilderCanvasProps) {
  // State holds the structured data being built/edited.
  // In a full implementation, this would be a complex JSON tree corresponding to the layout.
  // For M8, we simulate the core blocks for a Service composition.
  const [data, setData] = useState<any>(initialData || {});
  
  // Palette derivation: depending on context, we allow different blocks.
  // For 'service:*', we allow Hero (Name/Description) and Pricing.
  const isServiceContext = context.startsWith('service');

  const updateData = (key: string, value: any) => {
    setData((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleCommit = () => {
    onCommit(data);
  };

  return (
    <div className="builder-canvas" style={{
      width: '100%',
      maxWidth: '800px',
      margin: '0 auto',
      background: 'var(--color-background)',
      minHeight: '600px',
      borderRadius: '16px',
      border: '1px solid var(--color-border-subtle)',
      boxShadow: '0 40px 80px rgba(0,0,0,0.1)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Chrome Header */}
      <div style={{
        background: 'var(--color-surface-elevated)',
        padding: '16px 24px',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Composition Scope: {context}
        </div>
        <div>
          <button 
            onClick={handleCommit}
            disabled={isSubmitting || !data.name}
            style={{
              background: data.name ? 'var(--color-text)' : 'var(--color-border-subtle)',
              color: data.name ? 'var(--color-background)' : 'var(--color-text-secondary)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: data.name && !isSubmitting ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease'
            }}
          >
            {isSubmitting ? 'Binding to Kernel...' : 'Commit Composition'}
          </button>
        </div>
      </div>

      {/* The Canvas Dropzone */}
      <div style={{ flex: 1, padding: '40px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {isServiceContext && (
          <>
            <HeroBlock 
              name={data.name || ''} 
              description={data.description || ''} 
              onChange={(name, desc) => {
                updateData('name', name);
                updateData('description', desc);
              }} 
            />
            
            <PricingBlock 
              basePrice={data.basePrice || ''} 
              onChange={(price) => updateData('basePrice', price)} 
            />
          </>
        )}
        
        {!isServiceContext && (
          <div style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', textAlign: 'center', marginTop: '100px' }}>
            Palette derivation for {context} is empty in Stage 3 mockup.
          </div>
        )}
      </div>
    </div>
  );
}
