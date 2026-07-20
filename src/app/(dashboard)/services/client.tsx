'use client';

import React from 'react';
import { useVisualEngine } from '@/components/visual-engine/VisualEngineOverlay';

export function ServiceTemplatesClient({ initialServices }: { initialServices: any[] }) {
  const { openEngine } = useVisualEngine();

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="q-page-title">Service Templates</h1>
          <p className="q-page-subtitle">Configure your offerings, workflows, and pricing.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="q-btn" style={{ background: 'var(--q-color-paper-elevated)', border: '1px solid var(--q-color-ink-100)' }} onClick={() => openEngine('storefront')}>
            Design Storefront
          </button>
          <a href="/services/new" className="q-btn q-btn-primary">Create Service</a>
        </div>
      </header>

      <div style={{ display: 'grid', gap: '24px' }}>
        {initialServices.length === 0 ? (
          <div className="q-card" style={{ textAlign: 'center', padding: '48px', color: 'var(--q-color-ink-500)' }}>
            No service templates configured.
          </div>
        ) : (
          initialServices.map((svc: any) => (
            <div key={svc.id} className="q-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.25rem' }}>{svc.name}</h3>
                  <div style={{ fontWeight: 600, color: 'var(--q-color-ink-700)' }}>
                    ${svc.pricing?.base_price || 0} {svc.pricing?.currency || 'USD'}
                  </div>
                </div>
                <span style={{ 
                  padding: '4px 8px', 
                  borderRadius: '4px', 
                  fontSize: '0.75rem', 
                  fontWeight: 500,
                  background: svc.status === 'active' ? '#D1FAE5' : '#F3F4F6',
                  color: svc.status === 'active' ? '#065F46' : '#374151'
                }}>
                  {svc.status.toUpperCase()}
                </span>
              </div>

              <div>
                <h4 style={{ fontSize: '0.875rem', color: 'var(--q-color-ink-500)', marginBottom: '8px' }}>Workflow Pipeline</h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {svc.default_workflow_template_id ? (
                    <div style={{ padding: '4px 12px', background: 'var(--q-color-paper-subtle)', border: '1px solid var(--q-color-ink-100)', borderRadius: '16px', fontSize: '0.875rem' }}>
                      Standard Workflow Attached
                    </div>
                  ) : (
                    <div style={{ padding: '4px 12px', background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '16px', fontSize: '0.875rem' }}>
                      No Workflow Attached
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
