'use client';

import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { formatMoney } from '@/kernel/currency';
import { StorefrontLink } from './StorefrontLink';
import { formatDeliverable } from '@/modules/packages/deliverableSpec';
import { CatalogFilter } from '@/components/CatalogFilter';
import { Counted } from '@/components/Counted';
// Reached at its source rather than through the module door: the interface is
// a server-actions file, and this is a pure formatter a client card can hold.
import { formatVariableValue } from '@/modules/services/variableTypes';


type DimensionTagShape = { id: string; name: string; position?: number; values: { id: string; name: string }[] };

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
  const Card = ({ pkg }: { pkg: any }) => {
    const tags = dimensionTags(pkg);
    const bundle = (pkg.services || []).map((s: any) => s.name).join(' + ');
    const promises = (pkg.deliverables || []).map((d: any) => formatDeliverable(d));
    const fixed = (pkg.services || []).flatMap((s: any) => s.variableValues || []);
    const openVars = (pkg.services || []).flatMap((s: any) => {
      const fixedIds = new Set((s.variableValues || []).map((v: any) => v.serviceVariableId));
      return (s.variables || []).filter((v: any) => !fixedIds.has(v.id));
    });
    const taskCount = (pkg.services || []).reduce((acc: number, s: any) => acc + (s.tasks || []).length, 0);
    const priced = pkg.price?.amount != null;

    return (
      <Link href={`/packages/${pkg.id}`} className="q-card q-card-interactive q-plain-link q-stack">
        {/*
          * Always drawn, cover or no cover. A card in a grid is stretched to the
          * tallest in its row, so one package with a picture and one without
          * would put their titles at different heights and undo the alignment
          * everything else here was built for. Empty, it is a quiet wash
          * carrying the initial — which is also a legible invitation.
          */}
        <div
          className={pkg.cover_url ? 'q-cover' : 'q-cover q-cover-empty'}
          // The focal point is a fact about this picture, so it travels with it
          // rather than living in a stylesheet that knows nothing about either.
          style={pkg.cover_url
            ? { backgroundImage: `url(${pkg.cover_url})`, backgroundPosition: pkg.cover_position || undefined }
            : undefined}
        >
          {!pkg.cover_url && (
            <span className="q-cover-initial">{(pkg.name || '?').trim().charAt(0).toUpperCase()}</span>
          )}
        </div>

        {/*
          * The category above the name, the way a label sits above a title
          * rather than beside it. The price is not here at all any more — it
          * belongs in the band at the foot, which is where the eye goes for a
          * number and where the card gets its second surface.
          */}
        <div>
          {/* Only when it says something the name does not. A package built from
              one service is usually named after it, and "STUDIO PORTRAIT
              PHOTOGRAPHY" set immediately above "Studio Portrait Photography"
              is a line of noise in the position of a label. */}
          {bundle && bundle.toLowerCase() !== pkg.name.trim().toLowerCase() && (
            <span className="q-eyebrow">{bundle}</span>
          )}
          <h3 className="q-card-title">{pkg.name}</h3>
        </div>

        {/* What the client gets: the one line the card is about. Bounded,
            because a package promising six things must not make a taller card
            than one promising two — a row of cards is stretched to its tallest. */}
        <p className={promises.length > 0 ? 'q-lead q-clamp-2' : 'q-lead q-absent'}>
          {promises.length > 0
            ? promises.map((t: string, i: number) => (
                <React.Fragment key={i}>{i > 0 ? ' · ' : ''}<Counted text={t} /></React.Fragment>
              ))
            : 'Nothing promised yet'}
        </p>

        {(tags.length > 0 || fixed.length > 0 || openVars.length > 0) && (
          <div className="q-facts">
            {tags.map((d) => (
              <span key={d.id} className="q-fact-group">
                <span className="q-fact-key">{d.name}</span>
                <span className="q-fact-values">
                  {d.values.map((v) => (
                    <span key={v.id} className="q-fact">{v.name}</span>
                  ))}
                </span>
              </span>
            ))}
            {fixed.map((v: any) => (
              <span key={v.serviceVariableId} className="q-fact-group">
                <span className="q-fact-key">{v.label}</span>
                <span className="q-fact-values">
                  <span className="q-fact">{formatVariableValue(v)}</span>
                </span>
              </span>
            ))}
            {fixed.length === 0 && openVars.length > 0 && (
              <span className="q-fact-group">
                <span className="q-fact-key">Variables</span>
                <span className="q-fact-values">
                  <span className="q-fact q-absent">
                    {openVars.length} asked at booking
                  </span>
                </span>
              </span>
            )}
          </div>
        )}

        {/* What it costs, and what it takes: the commercial band. */}
        <div className="q-card-foot">
          <span className={priced ? 'q-price' : 'q-price q-absent'}>
            {priced
              ? formatMoney(Number(pkg.price.amount), String(pkg.price.currency || currencyCode))
              : 'No price set'}
          </span>
          <span className={taskCount > 0 ? 'q-meta-sm' : 'q-meta-sm q-absent'}>
            {taskCount > 0 ? `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}` : 'No tasks'}
          </span>
        </div>
      </Link>
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
              <h3 className="q-section-title">Build your first package</h3>
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
          items={active}
          noun="package"
          read={(pkg: any) => ({
            name: pkg.name,
            description: pkg.description,
            // A package spanning two domains reads under both, which stays true
            // without anything having to decide which one it really belongs to.
            facet: (pkg.services || [])[0]?.domain?.name ?? null,
            tags: dimensionTags(pkg).flatMap((d) => d.values.map((v) => ({
              dimensionId: d.id, dimensionName: d.name, valueId: v.id, valueName: v.name,
            }))),
          })}
        >
          {(shown) => (
            <div className="q-grid-cards">
              {shown.map((pkg: any) => <Card key={pkg.id} pkg={pkg} />)}
            </div>
          )}
        </CatalogFilter>
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
