'use client';

import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { openStorefrontDesigner, openServiceDesigner } from './actions';

export function ServiceTemplatesClient({ initialServices }: { initialServices: any[] }) {

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="q-page-title">Services</h1>
          <p className="q-page-subtitle">Your offerings — design each one as a page clients can book.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
          <form action={openStorefrontDesigner}>
            <button type="submit" className="q-btn q-btn-secondary">Design storefront</button>
          </form>
          <Link href="/services/new" className="q-btn q-btn-primary">Create service</Link>
        </div>
      </header>

      {initialServices.length === 0 ? (
        <div className="q-card" style={{ textAlign: 'center', padding: 'clamp(44px, 7vw, 76px) 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '54px', height: '54px', borderRadius: '15px', background: 'var(--q-color-accent-soft)', color: 'var(--q-color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
            <Package size={24} />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 620, letterSpacing: '-0.01em', color: 'var(--q-color-ink-900)' }}>Create your first service</h3>
          <p style={{ margin: '0 0 24px', color: 'var(--q-color-ink-500)', maxWidth: '44ch', lineHeight: 1.55 }}>
            A service is something you sell — a shoot, a package, a session. Create one, then
            design its page and share a link clients can book from.
          </p>
          <Link href="/services/new" className="q-btn q-btn-primary">Create service</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {initialServices.map((svc: any) => (
            <div
              key={svc.id}
              className="q-card"
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 620, letterSpacing: '-0.01em', color: 'var(--q-color-ink-900)' }}>{svc.name}</h3>
                  <div style={{ fontFamily: 'var(--q-font-mono)', fontWeight: 600, color: 'var(--q-color-ink-700)', fontVariantNumeric: 'tabular-nums' }}>
                    ${svc.pricing?.base_price || 0} {svc.pricing?.currency || 'USD'}
                  </div>
                </div>
                <span className={`q-badge ${svc.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>{svc.status}</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--q-color-ink-500)', marginBottom: '16px' }}>
                {svc.default_workflow_template_id ? 'Workflow attached' : 'No workflow attached'}
              </div>
              <div style={{ marginTop: 'auto', display: 'flex', gap: '8px', borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '16px' }}>
                <Link href={`/services/${svc.id}`} className="q-btn q-btn-secondary" style={{ flex: 1, textAlign: 'center', fontSize: '0.875rem' }}>
                  Edit Details
                </Link>
                <form action={openServiceDesigner.bind(null, svc.id)} style={{ flex: 1 }}>
                  <button type="submit" className="q-btn q-btn-secondary" style={{ width: '100%', fontSize: '0.875rem' }}>
                    Design Page
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
