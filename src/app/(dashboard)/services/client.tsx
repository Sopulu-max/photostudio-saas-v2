'use client';

import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { formatMoney } from '@/kernel/currency';
import { StorefrontLink } from './StorefrontLink';

export function ServiceTemplatesClient({
  initialServices,
  categories = [],
  currencyCode = 'USD',
  storefrontSlug,
}: {
  initialServices: any[];
  categories?: { id: string; name: string; position: number }[];
  currencyCode?: string;
  storefrontSlug?: string | null;
}) {
  const active = initialServices.filter((s: any) => s.status !== 'retired');
  const retired = initialServices.filter((s: any) => s.status === 'retired');

  const Card = ({ svc }: { svc: any }) => (
    <div className="q-card q-stack">
      <div className="q-row q-row-between">
        <div>
          <h3 className="q-section-title">{svc.name}</h3>
          <div className="q-num q-strong">
            {formatMoney(svc.pricing?.base_price, svc.pricing?.currency || currencyCode)}
          </div>
        </div>
        <span className={`q-badge ${svc.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>{svc.status}</span>
      </div>
      <div className="q-meta">
        {svc.blueprint?.name ? `Blueprint: ${svc.blueprint.name}` : 'No blueprint attached'}
      </div>
      <div className="q-tile-sub">
        <Link href={`/services/${svc.id}`} className="q-btn q-btn-secondary q-fill q-center-text">
          Manage service
        </Link>
      </div>
    </div>
  );

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Services</h1>
          <p className="q-page-subtitle">What your studio sells, and the pipelines behind it.</p>
        </div>
        <div className="q-row">
          <Link href="/services/settings" className="q-btn q-btn-secondary">Groups, blueprints &amp; defaults</Link>
          <Link href="/services/new" className="q-btn q-btn-primary">Create service</Link>
        </div>
      </header>

      {storefrontSlug && (
        <div className="q-card" style={{ marginBottom: '24px' }}>
          <div className="q-row q-row-between" style={{ marginBottom: '10px', alignItems: 'baseline' }}>
            <strong className="q-strong">Your storefront</strong>
            <span className="q-meta-sm">Everyone active above, in one link — hand this out instead of a single service&rsquo;s.</span>
          </div>
          <StorefrontLink slug={storefrontSlug} />
        </div>
      )}

      {initialServices.length === 0 ? (
        <div className="q-card q-empty-lg q-stack">
          <div className="q-empty-icon"><Package size={24} /></div>
          <h3 className="q-section-title">Create your first service</h3>
          <p className="q-meta">
            A service is something you sell — a shoot, a package, a session. Create one,
            attach a blueprint, and it&rsquo;s ready to take bookings.
          </p>
          <Link href="/services/new" className="q-btn q-btn-primary">Create service</Link>
        </div>
      ) : (
        <div className="q-stack q-stack-lg">
          {categories.map((cat) => {
            const inCat = active.filter((s: any) => s.category_id === cat.id);
            if (inCat.length === 0) return null;
            return (
              <section key={cat.id}>
                <h2 className="q-section-title">{cat.name}</h2>
                <div className="q-grid-cards">
                  {inCat.map((svc: any) => <Card key={svc.id} svc={svc} />)}
                </div>
              </section>
            );
          })}
          {(() => {
            const ungrouped = active.filter((s: any) => !s.category_id);
            if (ungrouped.length === 0) return null;
            return (
              <section>
                {categories.length > 0 && <h2 className="q-section-title">Everything else</h2>}
                <div className="q-grid-cards">
                  {ungrouped.map((svc: any) => <Card key={svc.id} svc={svc} />)}
                </div>
              </section>
            );
          })()}
        </div>
      )}

      {retired.length > 0 && (
        <section style={{ marginTop: '40px' }}>
          <h2 className="q-section-title">Retired</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>
            Not offered on new bookings. Past bookings keep their line and price.
          </p>
          <div className="q-grid-cards">
            {retired.map((svc: any) => <Card key={svc.id} svc={svc} />)}
          </div>
        </section>
      )}

    </div>
  );
}
