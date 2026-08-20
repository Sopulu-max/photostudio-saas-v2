'use client';

import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { DimensionTag } from './DimensionTag';
import type { ServiceDimensionTag } from '@/modules/services/interface';

/**
 * The ontology layer: what this studio actually knows how to do. Not what
 * it sells — that's Packages. A Service here is a real, persisted,
 * reusable transformation, not throwaway template content.
 */
export function ServicesClient({
  initialServices, activeFilter,
}: {
  initialServices: any[];
  activeFilter: { label: string } | null;
}) {
  const active = initialServices.filter((s: any) => s.status !== 'retired');
  const retired = initialServices.filter((s: any) => s.status === 'retired');

  const Card = ({ svc }: { svc: any }) => (
    <div className="q-card q-stack">
      <div className="q-row q-row-between">
        <div>
          <h3 className="q-section-title">{svc.name}</h3>
          <div className="q-meta-sm">{svc.domain?.name || 'No domain'}</div>
        </div>
        <span className={`q-badge ${svc.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>{svc.status}</span>
      </div>
      <div className="q-meta">
        {svc.deliverables?.length ? `Produces: ${svc.deliverables.map((d: any) => d.name).join(', ')}` : 'No deliverables set'}
      </div>
      <div className="q-meta-sm">{svc.blueprint?.name ? `Blueprint: ${svc.blueprint.name}` : 'No blueprint attached'}</div>
      {/* However many dimensions this service's domain happens to ask, and
          however many values it carries under each. */}
      {((svc.dimensions || []) as ServiceDimensionTag[]).length > 0 && (
        <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
          {((svc.dimensions || []) as ServiceDimensionTag[]).flatMap((d) =>
            d.values.map((v) => <DimensionTag key={v.id} dimension={d.name} value={v} />)
          )}
        </div>
      )}
      <div className="q-tile-sub">
        <Link href={`/services/${svc.id}`} className="q-btn q-btn-secondary q-fill q-center-text">View service</Link>
      </div>
    </div>
  );

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Services</h1>
          <p className="q-page-subtitle">What this studio actually knows how to do — independent of how it&rsquo;s sold.</p>
        </div>
        <div className="q-row">
          {/* The second reading of this same list. It used to be a top-level
              destination called Lens, which made a way of looking sit among the
              things a studio owns; it is a view of what is on this page. */}
          <Link href="/services/classifications" className="q-btn q-btn-secondary">By classification</Link>
          <Link href="/services/settings" className="q-btn q-btn-secondary">Domains, deliverables &amp; blueprints</Link>
          <Link href="/services/new" className="q-btn q-btn-primary">Create service</Link>
        </div>
      </header>

      {activeFilter && (
        <div className="q-row" style={{ marginBottom: '16px', alignItems: 'center' }}>
          <span className="q-meta-sm">Filtered by {activeFilter.label}</span>
          <Link href="/services" className="q-btn q-btn-secondary q-btn-xs">Clear &times;</Link>
        </div>
      )}

      {initialServices.length === 0 ? (
        <div className="q-card q-empty-lg q-stack">
          <div className="q-empty-icon"><Package size={24} /></div>
          {activeFilter ? (
            <>
              <h3 className="q-section-title">Nothing tagged this way</h3>
              <p className="q-meta">No service is currently tagged &ldquo;{activeFilter.label}&rdquo;.</p>
              <Link href="/services" className="q-btn q-btn-secondary">Clear filter</Link>
            </>
          ) : (
            <>
              <h3 className="q-section-title">Create your first service</h3>
              <p className="q-meta">
                A service is a transformation — Portrait Photography, Album Design. Create one, and it becomes something
                a Package can bundle and sell.
              </p>
              <Link href="/services/new" className="q-btn q-btn-primary">Create service</Link>
            </>
          )}
        </div>
      ) : (
        <div className="q-grid-cards">
          {active.map((svc: any) => <Card key={svc.id} svc={svc} />)}
        </div>
      )}

      {retired.length > 0 && (
        <section style={{ marginTop: '40px' }}>
          <h2 className="q-section-title">Retired</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>Not offered for new Packages. Packages already built from these are untouched.</p>
          <div className="q-grid-cards">
            {retired.map((svc: any) => <Card key={svc.id} svc={svc} />)}
          </div>
        </section>
      )}
    </div>
  );
}
