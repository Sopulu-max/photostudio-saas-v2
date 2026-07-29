'use client';

import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { NewBlueprintForm } from './NewBlueprintForm';

export function ServiceTemplatesClient({ initialServices, blueprints = [] }: { initialServices: any[]; blueprints?: any[] }) {

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="q-page-title">Services</h1>
          <p className="q-page-subtitle">Define what your studio sells — the offerings clients can book.</p>
        </div>
        <Link href="/services/new" className="q-btn q-btn-primary">Create service</Link>
      </header>

      {initialServices.length === 0 ? (
        <div className="q-card" style={{ textAlign: 'center', padding: 'clamp(44px, 7vw, 76px) 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '54px', height: '54px', borderRadius: '15px', background: 'var(--q-color-accent-soft)', color: 'var(--q-color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
            <Package size={24} />
          </div>
          <h3 className="q-section-title">Create your first service</h3>
          <p style={{ margin: '0 0 24px', color: 'var(--q-color-ink-500)', maxWidth: '44ch', lineHeight: 1.55 }}>
            A service is something you sell — a shoot, a package, a session. Create one,
            attach a workflow, and it's ready to take bookings.
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
                  <h3 className="q-section-title">{svc.name}</h3>
                  <div style={{ fontFamily: 'var(--q-font-mono)', fontWeight: 600, color: 'var(--q-color-ink-700)', fontVariantNumeric: 'tabular-nums' }}>
                    ${svc.pricing?.base_price || 0} {svc.pricing?.currency || 'USD'}
                  </div>
                </div>
                <span className={`q-badge ${svc.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>{svc.status}</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--q-color-ink-500)', marginBottom: '16px' }}>
                {svc.blueprint?.name ? `Blueprint: ${svc.blueprint.name}` : 'No blueprint attached'}
              </div>
              <div style={{ marginTop: 'auto', display: 'flex', gap: '8px', borderTop: '1px solid var(--q-color-ink-100)', paddingTop: '16px' }}>
                <Link href={`/services/${svc.id}`} className="q-btn q-btn-secondary" style={{ flex: 1, textAlign: 'center', fontSize: '0.875rem' }}>
                  Manage service
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <section style={{ marginTop: '40px' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 6px' }}>Blueprints</h2>
        <p style={{ margin: '0 0 16px', fontSize: '0.875rem', color: 'var(--q-color-ink-500)' }}>
          Reusable stage sets. Attach one to a service and its work starts from those stages.
        </p>
        <div className="q-card" style={{ padding: '20px 22px' }}>
          {blueprints.length === 0 ? (
            <div style={{ color: 'var(--q-color-ink-500)', fontSize: '0.875rem', marginBottom: '16px' }}>
              No blueprints yet.
            </div>
          ) : (
            <div className="q-stack">
              {blueprints.map((bp: any) => (
                <div key={bp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px 14px', border: '1px solid var(--q-color-ink-100)', borderRadius: '8px' }}>
                  <strong style={{ fontSize: '0.92rem' }}>{bp.name}</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                    {((bp.stages as any[]) || []).map((s: any, i: number) => (
                      <span key={i} className="q-badge q-badge-neutral">{s.name}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <NewBlueprintForm />
        </div>
      </section>
    </div>
  );
}
