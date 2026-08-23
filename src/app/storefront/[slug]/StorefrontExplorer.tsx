'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

interface Service {
  id: string;
  name: string;
}

interface Dimension {
  valueId: string;
  valueName: string;
  dimensionId: string;
  dimensionName: string;
}

interface Package {
  id: string;
  name: string;
  description: string | null;
  services: Service[];
  dimensions?: Dimension[];
}

interface Props {
  packages: Package[];
  slug: string;
  currencyCode: string;
}

export default function StorefrontExplorer({ packages, slug, currencyCode }: Props) {
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  // Extract all unique lenses from packages
  const lenses = useMemo(() => {
    const lensMap = new Map<string, { id: string; type: 'dimension' | 'service'; label: string }>();

    for (const pkg of packages) {
      for (const s of pkg.services || []) {
        lensMap.set(`service_${s.id}`, { id: `service_${s.id}`, type: 'service', label: s.name });
      }
      for (const d of pkg.dimensions || []) {
        lensMap.set(`dim_${d.valueId}`, { id: `dim_${d.valueId}`, type: 'dimension', label: d.valueName });
      }
    }

    // Sort: dimensions first, then services, alphabetically
    return Array.from(lensMap.values()).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dimension' ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
  }, [packages]);

  const toggleFilter = (id: string) => {
    const next = new Set(activeFilters);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setActiveFilters(next);
  };

  // Filter packages: A package must match ALL active filters (intersection).
  // If no filters are active, show all.
  const filteredPackages = useMemo(() => {
    if (activeFilters.size === 0) return packages;

    return packages.filter((pkg) => {
      const pkgLensIds = new Set([
        ...(pkg.services || []).map((s) => `service_${s.id}`),
        ...(pkg.dimensions || []).map((d) => `dim_${d.valueId}`)
      ]);

      for (const filterId of activeFilters) {
        if (!pkgLensIds.has(filterId)) return false;
      }
      return true;
    });
  }, [packages, activeFilters]);

  // Construct custom fallback URL with query params
  const customQuoteUrl = useMemo(() => {
    const url = new URLSearchParams();
    for (const filterId of activeFilters) {
      if (filterId.startsWith('dim_')) {
        const id = filterId.replace('dim_', '');
        url.append('dimension_value_id', id);
      }
    }
    const query = url.toString();
    return `/book/${slug}/custom${query ? `?${query}` : ''}`;
  }, [slug, activeFilters]);

  if (packages.length === 0) {
    return (
      <div className="q-card" style={{ textAlign: 'center', padding: '80px 24px' }}>
        <span className="q-meta">Nothing available to book right now — check back soon.</span>
      </div>
    );
  }

  return (
    <>
      {lenses.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h2 className="q-section-title" style={{ marginBottom: '12px' }}>Filter by what you need</h2>
          <div className="q-chip-row">
            {lenses.map((lens) => {
              const isActive = activeFilters.has(lens.id);
              return (
                <button
                  key={lens.id}
                  onClick={() => toggleFilter(lens.id)}
                  className={`q-chip q-button-base ${isActive ? '' : 'q-meta-plain'}`}
                  style={{
                    backgroundColor: isActive ? 'var(--q-color-ink-900)' : 'transparent',
                    color: isActive ? 'var(--q-color-paper)' : 'var(--q-color-ink-600)',
                    border: `1px solid ${isActive ? 'var(--q-color-ink-900)' : 'var(--q-color-ink-200)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s var(--q-ease)'
                  }}
                >
                  {lens.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="q-gallery">
        {filteredPackages.map((pkg) => (
          <Link key={pkg.id} href={`/book/${slug}/${pkg.id}`} className="q-card q-card-interactive q-plain-link q-stack q-stack-sm">
            <div>
              <h3 className="q-section-title">{pkg.name}</h3>
              {pkg.description && (
                <p className="q-meta" style={{ marginTop: '4px' }}>{pkg.description}</p>
              )}
            </div>

            {pkg.services && pkg.services.length > 0 && (
              <div className="q-chip-row" style={{ marginTop: 'auto' }}>
                {pkg.services.map((s) => (
                  <span key={s.id} className="q-chip q-meta-plain">
                    {s.name}
                  </span>
                ))}
              </div>
            )}

            <div className="q-row" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--q-color-ink-100)', justifyContent: 'space-between' }}>
              <div>
                <span className="q-doc-strong" style={{ fontSize: '1.1rem' }}>
                  Custom quote
                </span>
              </div>
              <span className="q-link">Book →</span>
            </div>
          </Link>
        ))}

        {/* Custom Enquiry Card (Always shown if filtered results are sparse, or as a general fallback) */}
        {(filteredPackages.length <= 1 || activeFilters.size > 0) && (
          <Link href={customQuoteUrl} className="q-card q-card-interactive q-plain-link q-stack q-stack-sm" style={{ border: '1px dashed var(--q-color-ink-300)', backgroundColor: 'transparent' }}>
            <div>
              <h3 className="q-section-title">Build Your Own</h3>
              <p className="q-meta" style={{ marginTop: '4px' }}>
                {filteredPackages.length === 0 
                  ? "We don't have a pre-built package for this exact combination, but we can definitely build one for you."
                  : "Don't see exactly what you need? We can create a custom package based on your selections."}
              </p>
            </div>
            <div className="q-row" style={{ marginTop: 'auto', paddingTop: '16px', justifyContent: 'flex-end' }}>
              <span className="q-link" style={{ color: 'var(--q-color-ink-600)' }}>Let&rsquo;s talk &rarr;</span>
            </div>
          </Link>
        )}
      </div>
    </>
  );
}
