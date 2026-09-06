'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '@/kernel/currency';

type Money = { amount: number; currency: string | null };

type CataloguePackage = {
  id: string;
  name: string;
  description: string | null;
  short_description: string | null;
  cover_url: string | null;
  cover_position: string | null;
  price: Money | null;
  price_unit: string | null;
  services: { id: string; name: string }[];
  deliverables?: { id: string; name: string; quantity: number | null }[];
  dimensions?: { valueId: string; valueName: string; dimensionId: string; dimensionName: string }[];
};

/**
 * THE STUDIO'S PUBLIC CATALOGUE, NARROWED BY THE STUDIO'S OWN VOCABULARY.
 *
 * There were two public catalogues. /storefront/[slug] could filter but showed
 * no covers, no prices, and hardcoded "Custom quote"; /book/[slug] — the link a
 * studio actually copies and hands out — showed everything but could not
 * filter. A client got one half or the other depending on which URL they were
 * given, and only one of the two was ever given.
 *
 * So the filter comes here and the other page goes. One catalogue.
 *
 * GROUPED BY DIMENSION, NOT A FLAT LIST OF LENSES. The storefront put every
 * value and every service in one undifferentiated row, so "Wedding",
 * "Outdoor" and "Event Photography" sat side by side as though they answered
 * the same question. They do not: the first two are answers to two different
 * questions the studio itself named, and the third is a thing the studio does.
 * Each dimension keeps its own row and its own name, which is the same shape
 * the package and service screens use — this app's one way of showing a
 * classification.
 */
export function Catalogue({
  packages, slug, currencyCode,
}: {
  packages: CataloguePackage[];
  slug: string;
  currencyCode: string | null;
}) {
  /** Chosen dimension values, by value id. */
  const [activeValues, setActiveValues] = useState<Set<string>>(new Set());
  /** Chosen services, by service id — kept apart because they are not answers. */
  const [activeServices, setActiveServices] = useState<Set<string>>(new Set());

  /*
   * The questions worth asking, taken from what is actually on offer.
   *
   * Built from the packages rather than from the studio's whole vocabulary on
   * purpose: a dimension no listed package is classified by is a filter that
   * can only ever empty the page.
   */
  const dimensionRows = useMemo(() => {
    const byDimension = new Map<string, { name: string; values: Map<string, string> }>();
    for (const pkg of packages) {
      for (const d of pkg.dimensions || []) {
        if (!d.dimensionId || !d.valueId) continue;
        const row = byDimension.get(d.dimensionId) || { name: d.dimensionName, values: new Map() };
        row.values.set(d.valueId, d.valueName);
        byDimension.set(d.dimensionId, row);
      }
    }
    return [...byDimension.entries()]
      .map(([id, row]) => ({
        id,
        name: row.name,
        values: [...row.values.entries()]
          .map(([valueId, valueName]) => ({ id: valueId, name: valueName }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      /* A dimension every package shares narrows nothing — offering it as a
         filter promises a choice that cannot change the page. */
      .filter((d) => d.values.length > 1)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [packages]);

  const serviceRow = useMemo(() => {
    const seen = new Map<string, string>();
    for (const pkg of packages) for (const s of pkg.services || []) seen.set(s.id, s.name);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [packages]);

  const toggle = (set: Set<string>, apply: (next: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    apply(next);
  };

  /*
   * Every chosen thing must be true of the package, not any of them.
   *
   * A client picking Wedding and Outdoor is describing one job with two facts
   * about it, not asking for anything that is either.
   */
  const shown = useMemo(() => {
    if (activeValues.size === 0 && activeServices.size === 0) return packages;
    return packages.filter((pkg) => {
      const values = new Set((pkg.dimensions || []).map((d) => d.valueId));
      const services = new Set((pkg.services || []).map((s) => s.id));
      for (const id of activeValues) if (!values.has(id)) return false;
      for (const id of activeServices) if (!services.has(id)) return false;
      return true;
    });
  }, [packages, activeValues, activeServices]);

  /*
   * WHAT THEY NARROWED BY TRAVELS WITH THEM.
   *
   * The values a client picks here are answers to the same questions the
   * enquiry asks on its first step. Sending them through means somebody who
   * filtered to Wedding, found nothing that fits, and asked for a quote arrives
   * at a form that already knows what they said — instead of being asked the
   * same question a second time and having the first answer thrown away.
   *
   * (The old storefront built this exact query string and /book/[slug]/custom
   * never read it, so the answers were appended to a URL and dropped.)
   */
  const customHref = useMemo(() => {
    const query = new URLSearchParams();
    for (const id of activeValues) query.append('dimension_value_id', id);
    const q = query.toString();
    return `/book/${slug}/custom${q ? `?${q}` : ''}`;
  }, [slug, activeValues]);

  const hasFilters = dimensionRows.length > 0 || serviceRow.length > 1;
  const narrowed = activeValues.size > 0 || activeServices.size > 0;

  return (
    <>
      {hasFilters && (
        <div style={{ marginBottom: '28px' }}>
          <div className="q-facts">
            {dimensionRows.map((dim) => (
              <div key={dim.id} className="q-fact-group">
                <span className="q-eyebrow">{dim.name}</span>
                <span className="q-fact-values">
                  {dim.values.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={activeValues.has(v.id)}
                      className={activeValues.has(v.id) ? 'q-fact q-fact-pick q-fact-on' : 'q-fact q-fact-pick'}
                      onClick={() => toggle(activeValues, setActiveValues, v.id)}
                    >
                      {v.name}
                    </button>
                  ))}
                </span>
              </div>
            ))}

            {serviceRow.length > 1 && (
              <div className="q-fact-group">
                <span className="q-eyebrow">Service</span>
                <span className="q-fact-values">
                  {serviceRow.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={activeServices.has(s.id)}
                      className={activeServices.has(s.id) ? 'q-fact q-fact-pick q-fact-on' : 'q-fact q-fact-pick'}
                      onClick={() => toggle(activeServices, setActiveServices, s.id)}
                    >
                      {s.name}
                    </button>
                  ))}
                </span>
              </div>
            )}
          </div>

          {narrowed && (
            <button
              type="button"
              className="q-btn q-btn-ghost q-btn-sm"
              style={{ marginTop: '12px' }}
              onClick={() => { setActiveValues(new Set()); setActiveServices(new Set()); }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Said plainly, and only when it is true. A narrowing that matches
          nothing is a normal outcome, not an error — the door below is the
          answer to it. */}
      {narrowed && shown.length === 0 && (
        <p className="q-meta" style={{ marginBottom: '16px' }}>
          No package matches all of that.
        </p>
      )}

      <div className="q-poster-grid q-poster-grid-lg">
        {shown.map((pkg) => {
          const cover = pkg.cover_url;
          const note = pkg.short_description
            || (pkg.description
              ? pkg.description.slice(0, 120).trimEnd() + (pkg.description.length > 120 ? '…' : '')
              : null);
          const deliverables = (pkg.deliverables || []).map((d) => d.name).filter(Boolean);

          return (
            <Link
              key={pkg.id}
              href={`/book/${slug}/${pkg.id}`}
              className={cover ? 'q-poster q-poster-tall' : 'q-poster q-poster-tall q-poster-blank'}
              style={cover
                ? { backgroundImage: `url(${cover})`, backgroundPosition: pkg.cover_position || undefined }
                : undefined}
            >
              {/* Absent when nobody has priced it — null and zero are
                  different, so an unpriced package says nothing at all
                  rather than "0". */}
              {pkg.price && (
                <span className="q-poster-price">
                  {formatMoney(pkg.price.amount, pkg.price.currency || currencyCode)}
                  {pkg.price_unit && <span className="q-poster-price-unit">/{pkg.price_unit}</span>}
                </span>
              )}

              <span className="q-poster-title">{pkg.name}</span>
              {note && <span className="q-poster-note">{note}</span>}

              {deliverables.length > 0 && (
                <span className="q-poster-tags">
                  {deliverables.slice(0, 3).map((d) => (
                    <span key={d} className="q-poster-tag">{d}</span>
                  ))}
                </span>
              )}
            </Link>
          );
        })}

        {/*
          * The way in for work the studio has not packaged.
          *
          * Not a poster, deliberately: nothing is being sold here, so it
          * carries no picture and no price.
          */}
        <Link href={customHref} className="q-poster-else">
          <span className="q-poster-else-title">Something else</span>
          <span className="q-poster-else-note">
            Describe what you need and the studio will respond with a quote.
          </span>
        </Link>
      </div>
    </>
  );
}
