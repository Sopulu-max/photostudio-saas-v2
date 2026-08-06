'use client';

import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { formatMoney } from '@/kernel/currency';
import { StorefrontLink } from './StorefrontLink';
import { DimensionTag } from './DimensionTag';
import type { PackageDimension } from '@/modules/packages/interface';

const DIM_PROP: Record<PackageDimension, string> = {
  subject: 'subject', occasion: 'occasion', context: 'context', purpose: 'purpose', client: 'client_type',
};

export function PackagesClient({
  initialPackages,
  currencyCode = 'USD',
  storefrontSlug,
  enabledDimensions = [],
  activeFilter,
}: {
  initialPackages: any[];
  currencyCode?: string;
  storefrontSlug?: string | null;
  enabledDimensions?: PackageDimension[];
  activeFilter?: { dim: PackageDimension; label: string } | null;
}) {
  const active = initialPackages.filter((p: any) => p.status !== 'retired');
  const retired = initialPackages.filter((p: any) => p.status === 'retired');

  const getDimValues = (pkg: any, dim: PackageDimension) => {
    const values = new Map<string, any>();
    (pkg.services || []).forEach((s: any) => {
      const val = s[DIM_PROP[dim]];
      if (val?.id) values.set(val.id, val);
    });
    return Array.from(values.values());
  };

  const Card = ({ pkg }: { pkg: any }) => {
    const hasDimensions = enabledDimensions.some((d) => getDimValues(pkg, d).length > 0);
    return (
      <div className="q-card q-stack">
        <div className="q-row q-row-between">
          <div>
            <h3 className="q-section-title">{pkg.name}</h3>
            <div className="q-num q-strong">{formatMoney(pkg.pricing?.base_price, pkg.pricing?.currency || currencyCode)}</div>
          </div>
          <span className={`q-badge ${pkg.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>{pkg.status}</span>
        </div>
        <div className="q-meta">{(pkg.services || []).map((s: any) => s.name).join(' + ') || 'No services bundled'}</div>
        {hasDimensions && (
          <div className="q-row" style={{ flexWrap: 'wrap' }}>
            {enabledDimensions.map((d) => 
              getDimValues(pkg, d).map((val: any) => (
                <DimensionTag key={`${d}-${val.id}`} dim={d} value={val} />
              ))
            )}
          </div>
        )}
        <div className="q-tile-sub">
          <Link href={`/packages/${pkg.id}`} className="q-btn q-btn-secondary q-fill q-center-text">Manage package</Link>
        </div>
      </div>
    );
  };

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Packages</h1>
          <p className="q-page-subtitle">What your studio sells — built from the services it actually runs.</p>
        </div>
        <div className="q-row">
          <Link href="/packages/settings" className="q-btn q-btn-secondary">Settings</Link>
          <Link href="/packages/new" className="q-btn q-btn-primary">Build package</Link>
        </div>
      </header>

      {storefrontSlug && (
        <div className="q-card" style={{ marginBottom: '24px' }}>
          <div className="q-row q-row-between" style={{ marginBottom: '10px', alignItems: 'baseline' }}>
            <strong className="q-strong">Your storefront</strong>
            <span className="q-meta-sm">Everyone active above, in one link — hand this out instead of a single package&rsquo;s.</span>
          </div>
          <StorefrontLink slug={storefrontSlug} />
        </div>
      )}

      {activeFilter && (
        <div className="q-row" style={{ marginBottom: '16px', alignItems: 'center' }}>
          <span className="q-meta-sm">Filtered by {activeFilter.dim[0].toUpperCase() + activeFilter.dim.slice(1)}: {activeFilter.label}</span>
          <Link href="/packages" className="q-btn q-btn-secondary q-btn-xs">Clear &times;</Link>
        </div>
      )}

      {initialPackages.length === 0 ? (
        <div className="q-card q-empty-lg q-stack">
          <div className="q-empty-icon"><Package size={24} /></div>
          {activeFilter ? (
            <>
              <h3 className="q-section-title">Nothing tagged this way</h3>
              <p className="q-meta">No package is currently {activeFilter.dim} &ldquo;{activeFilter.label}&rdquo;.</p>
              <Link href="/packages" className="q-btn q-btn-secondary">Clear filter</Link>
            </>
          ) : (
            <>
              <h3 className="q-section-title">Build your first package</h3>
              <p className="q-meta">A package bundles one or more services into something a client can buy. Create your services first, then bundle them here.</p>
              <Link href="/packages/new" className="q-btn q-btn-primary">Build package</Link>
            </>
          )}
        </div>
      ) : (
        <div className="q-grid-cards">
          {active.map((pkg: any) => <Card key={pkg.id} pkg={pkg} />)}
        </div>
      )}

      {retired.length > 0 && (
        <section style={{ marginTop: '40px' }}>
          <h2 className="q-section-title">Retired</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>Not offered on new bookings. Past bookings keep their line and price.</p>
          <div className="q-grid-cards">{retired.map((pkg: any) => <Card key={pkg.id} pkg={pkg} />)}</div>
        </section>
      )}
    </div>
  );
}
