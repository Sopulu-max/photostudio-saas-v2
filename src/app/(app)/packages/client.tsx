'use client';

import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { formatMoney } from '@/kernel/currency';
import { StorefrontLink } from './StorefrontLink';
import { formatDeliverable } from '@/modules/packages/deliverableSpec';


type DimensionTagShape = { id: string; name: string; values: { id: string; name: string }[] };

export function PackagesClient({
  initialPackages,
  currencyCode = 'USD',
  storefrontSlug,
  activeFilter,
}: {
  initialPackages: any[];
  currencyCode?: string;
  storefrontSlug?: string | null;
  activeFilter?: { label: string } | null;
}) {
  const active = initialPackages.filter((p: any) => p.status !== 'retired');
  const retired = initialPackages.filter((p: any) => p.status === 'retired');

  /*
   * What a package is classified as: what it says about itself, plus what its
   * bundled services already say. Deduped by value id, because a package tagged
   * Wedding that bundles a service tagged Wedding is one fact, not two.
   */
  const dimensionTags = (pkg: any) => {
    const byDimension = new Map<string, DimensionTagShape>();
    const absorb = (dims: DimensionTagShape[] | undefined) => {
      for (const d of (dims || [])) {
        if (!byDimension.has(d.id)) byDimension.set(d.id, { id: d.id, name: d.name, values: [] });
        const target = byDimension.get(d.id)!;
        for (const v of d.values) if (!target.values.some((x) => x.id === v.id)) target.values.push(v);
      }
    };
    absorb(pkg.dimensions);
    (pkg.services || []).forEach((s: any) => absorb(s.dimensions));
    return [...byDimension.values()];
  };

  const Card = ({ pkg }: { pkg: any }) => {
    const tags = dimensionTags(pkg);
    const openVars = (pkg.services || []).flatMap((s: any) => {
      const fixedIds = new Set((s.variableValues || []).map((v: any) => v.serviceVariableId));
      return (s.variables || []).filter((v: any) => !fixedIds.has(v.id));
    });
    const taskCount = (pkg.services || []).reduce((acc: number, s: any) => acc + (s.tasks || []).length, 0);

    return (
      <div className="q-card q-stack">
        <div className="q-row q-row-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3 className="q-section-title">{pkg.name}</h3>
            {pkg.description && <p className="q-meta" style={{ marginTop: '4px' }}>{pkg.description}</p>}
          </div>
          <div className="q-stack q-stack-xs" style={{ alignItems: 'flex-end' }}>
            <span className={`q-badge ${pkg.status === 'active' ? 'q-badge-success' : 'q-badge-neutral'}`}>{pkg.status}</span>
            <div className="q-strong q-num" style={{ fontSize: '1.1rem' }}>
              {pkg.price?.amount != null 
                ? formatMoney(Number(pkg.price.amount), String(pkg.price.currency || currencyCode))
                : ''}
            </div>
          </div>
        </div>
        
        <div className="q-meta" style={{ marginTop: '12px' }}>
          <strong className="q-strong" style={{ marginRight: '6px' }}>Services:</strong>
          {(pkg.services || []).map((s: any) => s.name).join(' + ') || 'None'}
        </div>

        {tags.length > 0 && (
          <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
            {tags.map((d) => (
              <div key={d.id} className="q-badge q-badge-neutral" style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px', paddingRight: '6px' }}>
                <span className="q-meta-plain" style={{ opacity: 0.7 }}>{d.name}:</span>
                <span className="q-row" style={{ gap: '4px' }}>
                  {d.values.map((v, i) => (
                    <span key={v.id}>
                      <Link href={`/services/classifications/${encodeURIComponent(v.id)}`} className="q-plain-link" style={{ color: 'inherit', textDecoration: 'none' }}>
                        {v.name}
                      </Link>
                      {i < d.values.length - 1 ? <span style={{ opacity: 0.5 }}>, </span> : null}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}

        {((pkg.deliverables || []).length > 0 || openVars.length > 0 || taskCount > 0) && (
          <div className="q-stack q-stack-sm" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--q-color-ink-100)' }}>
            {(pkg.deliverables || []).length > 0 && (
              <div className="q-meta-sm">
                <strong className="q-strong" style={{ marginRight: '4px' }}>Deliverables:</strong>
                {/* @ts-ignore */}
                {(pkg.deliverables || []).map((d: any) => formatDeliverable(d)).join(', ')}
              </div>
            )}

            {openVars.length > 0 && (
              <div className="q-meta-sm">
                <strong className="q-strong" style={{ marginRight: '4px' }}>Variables:</strong>
                {openVars.map((v: any) => v.label).join(', ')}
              </div>
            )}

            {taskCount > 0 && (
              <div className="q-meta-sm">
                <strong className="q-strong" style={{ marginRight: '4px' }}>Tasks:</strong>
                {taskCount} internal {taskCount === 1 ? 'task' : 'tasks'} required
              </div>
            )}
          </div>
        )}
        
        <div className="q-tile-sub" style={{ marginTop: '16px' }}>
          <Link href={`/packages/${pkg.id}`} className="q-btn q-btn-secondary q-fill q-center-text">View package</Link>
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
          <span className="q-meta-sm">Filtered by {activeFilter.label}</span>
          <Link href="/packages" className="q-btn q-btn-secondary q-btn-xs">Clear &times;</Link>
        </div>
      )}

      {initialPackages.length === 0 ? (
        <div className="q-card q-empty-lg q-stack">
          <div className="q-empty-icon"><Package size={24} /></div>
          {activeFilter ? (
            <>
              <h3 className="q-section-title">Nothing tagged this way</h3>
              <p className="q-meta">No package is currently tagged &ldquo;{activeFilter.label}&rdquo;.</p>
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
