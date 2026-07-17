'use client';

import React, { useState, useEffect } from 'react';

// A lightweight mock of a global state for the overlay
// In a real app, this would be a Zustand store or React Context
let openOverlayFn: (context: string) => void = () => {};
let closeOverlayFn: () => void = () => {};

export function useVisualEngine() {
  return {
    openEngine: (context: string) => openOverlayFn(context),
    closeEngine: () => closeOverlayFn(),
  };
}

export function VisualEngineOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<string | null>(null);
  
  // Selected block for styling
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);

  useEffect(() => {
    openOverlayFn = (ctx: string) => {
      setContext(ctx);
      setIsOpen(true);
    };
    closeOverlayFn = () => {
      setIsOpen(false);
      setContext(null);
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--q-color-paper)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top Toolbar */}
      <div style={{ height: '56px', borderBottom: '1px solid var(--q-color-ink-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}>✕</button>
          <div style={{ fontWeight: 600 }}>Visual Engine <span style={{ color: 'var(--q-color-ink-500)', fontWeight: 400 }}>/ {context}</span></div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={{ padding: '6px 12px', background: 'var(--q-color-paper-subtle)', border: '1px solid var(--q-color-ink-100)', borderRadius: '6px' }}>Desktop</button>
          <button style={{ padding: '6px 12px', background: 'transparent', border: 'none', color: 'var(--q-color-ink-500)' }}>Tablet</button>
          <button style={{ padding: '6px 12px', background: 'transparent', border: 'none', color: 'var(--q-color-ink-500)' }}>Mobile</button>
        </div>
        <div>
          <button className="q-btn q-btn-primary">Publish to {context}</button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar: Block Library */}
        <div style={{ width: '280px', borderRight: '1px solid var(--q-color-ink-100)', background: 'var(--q-color-paper-elevated)', padding: '24px', overflowY: 'auto' }}>
          <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--q-color-ink-500)', letterSpacing: '0.05em', marginBottom: '16px' }}>Add Elements</h3>
          
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '0.875rem', marginBottom: '8px' }}>Layout</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ padding: '12px', background: 'var(--q-color-paper-subtle)', border: '1px solid var(--q-color-ink-100)', borderRadius: '6px', fontSize: '0.75rem', textAlign: 'center', cursor: 'grab' }}>Section</div>
              <div style={{ padding: '12px', background: 'var(--q-color-paper-subtle)', border: '1px solid var(--q-color-ink-100)', borderRadius: '6px', fontSize: '0.75rem', textAlign: 'center', cursor: 'grab' }}>Grid</div>
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '0.875rem', marginBottom: '8px' }}>Typography</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ padding: '12px', background: 'var(--q-color-paper-subtle)', border: '1px solid var(--q-color-ink-100)', borderRadius: '6px', fontSize: '0.75rem', textAlign: 'center', cursor: 'grab' }}>Heading</div>
              <div style={{ padding: '12px', background: 'var(--q-color-paper-subtle)', border: '1px solid var(--q-color-ink-100)', borderRadius: '6px', fontSize: '0.75rem', textAlign: 'center', cursor: 'grab' }}>Paragraph</div>
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '0.875rem', marginBottom: '8px' }}>Data Bound ({context})</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              <div style={{ padding: '12px', background: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: '6px', fontSize: '0.75rem', cursor: 'grab' }}>
                {context === 'storefront' ? 'Service Catalog Grid' : 'Invoice Total'}
              </div>
              <div style={{ padding: '12px', background: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFDBFE', borderRadius: '6px', fontSize: '0.75rem', cursor: 'grab' }}>
                {context === 'storefront' ? 'Booking Intake Form' : 'Payment Gateway'}
              </div>
            </div>
          </div>
        </div>

        {/* Center: Canvas Workspace */}
        <div style={{ flex: 1, background: '#f3f4f6', position: 'relative', overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '48px' }}>
          {/* Mock Canvas Area */}
          <div style={{ width: '100%', maxWidth: '1000px', background: '#fff', minHeight: '800px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #e5e7eb', position: 'relative' }}>
            <div 
              onClick={() => setSelectedBlock('hero-section')}
              style={{ 
                padding: '64px', 
                border: selectedBlock === 'hero-section' ? '2px solid #3b82f6' : '1px dashed #d1d5db', 
                margin: '16px',
                background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)'
              }}
            >
              <h1 style={{ fontSize: '3rem', margin: 0, fontFamily: 'serif' }}>&#123;&#123;Organization.Name&#125;&#125;</h1>
              <p style={{ fontSize: '1.25rem', color: '#6b7280' }}>Book your session directly with us.</p>
            </div>
            
            <div 
              onClick={() => setSelectedBlock('intake-form')}
              style={{ 
                padding: '32px', 
                border: selectedBlock === 'intake-form' ? '2px solid #3b82f6' : '1px dashed #d1d5db', 
                margin: '16px' 
              }}
            >
              <div style={{ background: '#f9fafb', padding: '24px', borderRadius: '8px' }}>
                [ Data Bound: Booking Intake Form ]
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Properties Panel */}
        <div style={{ width: '320px', borderLeft: '1px solid var(--q-color-ink-100)', background: 'var(--q-color-paper-elevated)', padding: '24px', overflowY: 'auto' }}>
          <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--q-color-ink-500)', letterSpacing: '0.05em', marginBottom: '24px' }}>Properties</h3>
          
          {selectedBlock ? (
            <div style={{ display: 'grid', gap: '24px' }}>
              {/* Spacing Panel */}
              <div>
                <h4 style={{ fontSize: '0.875rem', marginBottom: '12px' }}>Spacing</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-500)' }}>Padding</label>
                    <input type="text" defaultValue="64px" style={{ width: '100%', padding: '6px', fontSize: '0.875rem', border: '1px solid var(--q-color-ink-300)', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--q-color-ink-500)' }}>Margin</label>
                    <input type="text" defaultValue="16px" style={{ width: '100%', padding: '6px', fontSize: '0.875rem', border: '1px solid var(--q-color-ink-300)', borderRadius: '4px' }} />
                  </div>
                </div>
              </div>

              {/* Background Panel */}
              <div>
                <h4 style={{ fontSize: '0.875rem', marginBottom: '12px' }}>Background</h4>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ flex: 1, padding: '4px', background: 'var(--q-color-paper-subtle)', border: '1px solid var(--q-color-ink-100)', borderRadius: '4px', textAlign: 'center', fontSize: '0.75rem' }}>Solid</div>
                  <div style={{ flex: 1, padding: '4px', background: 'var(--q-color-ink-100)', border: '1px solid var(--q-color-ink-300)', borderRadius: '4px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 500 }}>Gradient</div>
                </div>
                <div style={{ height: '24px', background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)', borderRadius: '4px', border: '1px solid var(--q-color-ink-100)' }}></div>
              </div>

              {/* Data Binding Panel */}
              <div style={{ padding: '16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <h4 style={{ fontSize: '0.875rem', color: '#1e40af', margin: '0 0 12px 0' }}>Data Binding</h4>
                <select style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #bfdbfe', fontSize: '0.875rem' }}>
                  <option>Organization.Name</option>
                  <option>Organization.Slug</option>
                  <option>ServiceTemplate.Pricing</option>
                  <option>Static Text</option>
                </select>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', textAlign: 'center', padding: '32px 0' }}>
              Select an element on the canvas to edit properties.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
