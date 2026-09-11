'use client';


import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { formatMoney } from '@/kernel/currency';
import { StorefrontLink } from './StorefrontLink';
import { formatDeliverable } from '@/modules/packages/deliverableSpec';
import { CatalogFilter } from '@/components/CatalogFilter';
// Reached at its source rather than through the module door: the interface is
// a server-actions file, and this is a pure formatter a client card can hold.
import { formatVariableValue, splitVariables } from '@/modules/services/variableTypes';


type DimensionTagShape = { id: string; name: string; position?: number; values: { id: string; name: string }[] };

function byPrice(a: any, b: any, dir: 1 | -1) {
  const av = a.price?.amount, bv = b.price?.amount;
  if (av == null && bv == null) return a.name.localeCompare(b.name);
  if (av == null) return 1;
  if (bv == null) return -1;
  return (Number(av) - Number(bv)) * dir || a.name.localeCompare(b.name);
}

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
  /*
   * One list, grouped on the way out. Retired packages used to be filtered off
   * before the catalogue and rendered underneath it, where the search box could
   * not reach them — see the same note on the services page.
   */
  const HOW_TO_ORDER = [
    { key: 'recent', label: 'Newest first',
      compare: (a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')) },
    { key: 'name', label: 'Name A–Z',
      compare: (a: any, b: any) => a.name.localeCompare(b.name) },
    /*
     * A package with no price is not the cheapest one; it is the one nobody has
     * priced. It sorts last whichever way the list is pointed, because putting
     * it at the top of "low to high" would answer a question about price with a
     * package that has none.
     */
    { key: 'dear', label: 'Price: high to low',
      compare: (a: any, b: any) => byPrice(a, b, -1) },
    { key: 'cheap', label: 'Price: low to high',
      compare: (a: any, b: any) => byPrice(a, b, 1) },
  ];

  /*
   * What a package is classified as: what it says about itself, plus what its
   * bundled services already say. Deduped by value id, because a package tagged
   * Wedding that bundles a service tagged Wedding is one fact, not two.
   */
  const dimensionTags = (pkg: any) => {
    const byDimension = new Map<string, DimensionTagShape>();
    const absorb = (dims: DimensionTagShape[] | undefined) => {
      for (const d of (dims || [])) {
        if (!byDimension.has(d.id)) byDimension.set(d.id, { id: d.id, name: d.name, position: d.position ?? 0, values: [] });
        const target = byDimension.get(d.id)!;
        for (const v of d.values) if (!target.values.some((x) => x.id === v.id)) target.values.push(v);
      }
    };
    absorb(pkg.dimensions);
    (pkg.services || []).forEach((s: any) => absorb(s.dimensions));
    /*
     * In the studio's order, like everywhere else.
     *
     * This returned whatever order the merge happened to produce — each source
     * arrives sorted, but a service introducing an earlier question later in
     * the loop landed it at the end. So one card could read Context, Occasion
     * and the next Occasion, Context, and neither matched the order the studio
     * had arranged.
     */
    return [...byDimension.values()].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name),
    );
  };

  /**
   * One package, as a card in a grid of them.
   *
   * FEWER FACTS, AND NOT ALL AT ONE RANK. This carried seven — name, services,
   * price, description, deliverables, variables, classifications, tasks — and
   * the last attempt lined them all up in a labelled column, which straightened
   * the list without organising it: six rows of small mono capitals beside six
   * rows of small grey text. Regular sameness is still sameness.
   *
   * Four zones now, each in a different voice. The name and the price, because
   * those are what a package IS and what it costs. What the client receives, in
   * body ink and with no label — a line directly under a title does not need to
   * be told what it is, and the labels were half the clutter. Then everything
   * that distinguishes this package from the next one, as a single quiet strip
   * across the card rather than a stack down it. Then how much work it involves,
   * on the pinned last line.
   *
   * THE DESCRIPTION IS GONE. It is prose written for a client, shown on the
   * storefront and on the package's own page where it does its job; on an
   * operator's grid it repeated what the deliverables already say and was the
   * only element with no natural length, which is what made one long package
   * stretch every card beside it.
   *
   * Fixed variables sit with the classifications because they are the same kind
   * of fact: what makes this package a different offer from the next package of
   * the same service. The ones it leaves open are the client's answer, not the
   * package's, so they are counted rather than named.
   */
  /*
   * ONE ROW OF THE SHEET.                                          (D1, D4, D7)
   *
   * This was the poster - the client's card, reused here so the studio and
   * the client saw the same object. That was right for one package and wrong
   * for the list: a poster is a print, and a print wall is not how a studio
   * finds the one it wants. Three of Glamour's four packages carry the same
   * name; on a wall of prints the eye reads name, name, name and gives up.
   *
   * A row is a frame, a name, a caption and a figure. The frame is slide one
   * of the package's pictures, at the print's own 4:5, so a row is the
   * thumbnail of the thing and not a different picture of it. The caption
   * is what the client receives and then what the package is for - the two
   * facts that actually tell one Studio Portrait Photography from the next.
   *
   * The poster still exists: on the public catalogue, where a client browses,
   * and on the package's own page, where it is the print.
   */
  const Row = ({ pkg }: { pkg: any }) => {
    const promises = (pkg.deliverables || []).map((d: any) => formatDeliverable(d));
    const { fixed } = splitVariables(
      (pkg.services || []).flatMap((s: any) => s.variableValues || []),
      (pkg.services || []).flatMap((s: any) => s.variables || []),
    );
    const firstTag = dimensionTags(pkg).flatMap((d) => d.values)[0]?.name ?? null;
    const priced = pkg.price?.amount != null;
    const retired = pkg.status === 'retired';

    /*
     * Three things at most, in the order they distinguish: what you get, then
     * where or what for, then one settled value. Everything else is on the
     * package. A caption that says all of it says nothing louder than the
     * rest (D5).
     */
    const caption = [
      ...promises.slice(0, 2),
      firstTag,
      fixed[0] ? formatVariableValue(fixed[0]) : null,
    ].filter(Boolean).slice(0, 3);

    return (
      <div className={retired ? 'q-sheet-row q-sheet-row-dim' : 'q-sheet-row'}>
        {/* The whole row opens the package; Book sits above it. Same reason
            the poster has a face: an <a> inside an <a> is not markup. */}
        <Link href={`/packages/${pkg.id}`} className="q-sheet-face" aria-label={pkg.name} />

        <span className="q-sheet-frame" aria-hidden="true">
          {pkg.cover_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={pkg.cover_url} alt="" />
            : <Package size={16} strokeWidth={1.75} />}
        </span>

        <span className="q-sheet-body">
          <span className="q-sheet-name">{pkg.name}</span>
          <span className="q-sheet-cap">
            {caption.length > 0
              ? caption.join(' · ')
              : <span className="q-absent">Nothing promised yet</span>}
          </span>
        </span>

        <span className="q-sheet-side">
          {/* A price is a fact, in ink (D3). No price is said quietly. */}
          {priced
            ? <span className="q-sheet-fig">{formatMoney(Number(pkg.price.amount), String(pkg.price.currency || currencyCode))}</span>
            : <span className="q-sheet-fig q-sheet-fig-none">No price</span>}
          {retired
            ? <span className="q-badge q-badge-neutral">Retired</span>
            : <Link href={`/bookings/new?package=${pkg.id}`} className="q-btn q-btn-secondary q-btn-xs q-sheet-act">Book</Link>}
        </span>
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
          {/* Straight to where the vocabulary actually lives. The button used
              to say "Settings" and lead to a page whose only content was a
              sentence saying these are managed in Services — a hop that told
              nobody anything, under a heading naming five fixed dimensions that
              stopped existing when domains took ownership of their own. */}
          <Link href="/services/classifications" className="q-btn q-btn-secondary">By classification</Link>
          <Link href="/services/settings" className="q-btn q-btn-secondary">Domains, deliverables &amp; workflows</Link>
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
              <h3 className="q-section-title">No packages yet</h3>
              <p className="q-meta">A package bundles one or more services into something a client can buy. Create your services first, then bundle them here.</p>
              <Link href="/packages/new" className="q-btn q-btn-primary">Build package</Link>
            </>
          )}
        </div>
      ) : (
        /*
         * Narrowed by the same vocabulary a client narrows the storefront with.
         *
         * The catalogue was an unbounded grid: fifty packages were fifty cards
         * and the only way through was the scroll bar. It is not searched by
         * name in practice either — a studio looking at its own catalogue is
         * looking for the studio maternity ones, which is precisely what its
         * dimensions already say. So the classification is the navigation, and
         * nothing had to be invented to make the list long-proof.
         */
        <CatalogFilter
          items={initialPackages}
          noun="package"
          kind="catalogue"
          sorts={HOW_TO_ORDER}
          /* A sheet has one form; the poster wall lives on the public
             catalogue, where a client browses rather than scans. */
          views={false}
          read={(pkg: any) => ({
            name: pkg.name,
            description: pkg.description,
            // A package spanning two domains reads under both — which is what
            // this comment always claimed and the line beneath it never did. It
            // passed services[0], so a package of Event Photography and Event
            // Videography filed under whichever service happened to be first
            // and vanished when the catalogue was filtered by the other.
            facet: [...new Set(((pkg.services || []) as any[])
              .map((s) => s.domain?.name).filter(Boolean))] as string[],
            tags: dimensionTags(pkg).flatMap((d) => d.values.map((v) => ({
              dimensionId: d.id, dimensionName: d.name, valueId: v.id, valueName: v.name,
            }))),
          })}
        >
          {(shown) => {
            const offered = shown.filter((pkg: any) => pkg.status !== 'retired');
            const retired = shown.filter((pkg: any) => pkg.status === 'retired');
            return (
              <>
                <div className="q-sheet">
                  {offered.map((pkg: any) => <Row key={pkg.id} pkg={pkg} />)}
                </div>
                {retired.length > 0 && (
                  <section className={offered.length > 0 ? 'q-section-gap' : undefined}>
                    <h2 className="q-section-title">Retired</h2>
                    <p className="q-meta" style={{ marginBottom: '16px' }}>
                      Not offered on new bookings. Past bookings keep their line and price.
                    </p>
                    <div className="q-sheet">
                      {retired.map((pkg: any) => <Row key={pkg.id} pkg={pkg} />)}
                    </div>
                  </section>
                )}
              </>
            );
          }}
        </CatalogFilter>
      )}

    </div>
  );
}
