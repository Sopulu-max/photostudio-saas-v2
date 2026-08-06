'use client';

import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { DimensionTag } from './DimensionTag';
import type { Dimension } from '@/modules/services/interface';

const DIM_PROP: Record<Dimension, string> = {
  subject: 'subject', occasion: 'occasion', context: 'context', purpose: 'purpose', client: 'client_type',
};

/**
 * The ontology layer: what this studio actually knows how to do. Not what
 * it sells — that's Packages. A Service here is a real, persisted,
 * reusable transformation, not throwaway template content.
 */
export function ServicesClient({
  initialServices, enabledDimensions, activeFilter,
}: {
  initialServices: any[];
  enabledDimensions: Dimension[];
  activeFilter: { dim: Dimension; label: string } | null;
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
      {enabledDimensions.some((d) => svc[DIM_PROP[d]]?.id) && (
        <div className="q-row" style={{ flexWrap: 'wrap' }}>
          {enabledDimensions.map((d) => <DimensionTag key={d} dim={d} value={svc[DIM_PROP[d]]} />)}
        </div>
      )}
      <div className="q-tile-sub">
        <Link href={`/services/${svc.id}`} className="q-btn q-btn-secondary q-fill q-center-text">Manage service</Link>
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
          <Link href="/services/settings" className="q-btn q-btn-secondary">Domains, deliverables &amp; blueprints</Link>
          <Link href="/services/new" className="q-btn q-btn-primary">Create service</Link>
        </div>
      </header>

      {activeFilter && (
        <div className="q-row" style={{ marginBottom: '16px', alignItems: 'center' }}>
          <span className="q-meta-sm">Filtered by {activeFilter.dim[0].toUpperCase() + activeFilter.dim.slice(1)}: {activeFilter.label}</span>
          <Link href="/services" className="q-btn q-btn-secondary q-btn-xs">Clear &times;</Link>
        </div>
      )}

      {initialServices.length === 0 ? (
        <div className="q-card q-empty-lg q-stack">
          <div className="q-empty-icon"><Package size={24} /></div>
          {activeFilter ? (
            <>
              <h3 className="q-section-title">Nothing tagged this way</h3>
              <p className="q-meta">No service is currently {activeFilter.dim} &ldquo;{activeFilter.label}&rdquo;.</p>
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
