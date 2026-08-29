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
import { formatVariableValue } from '@/modules/services/variableTypes';


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

  /**
   * One package, as a card.
   *
   * THE SAME THREE FAULTS THE SERVICE CARDS HAD, one module along.
   *
   * It ended in a full-width "View package" button — a second thing to aim at,
   * on a card that was already the subject. The whole card is the link now, and
   * nothing inside it links any more: the classification values were anchors
   * nested inside that button's card, which is why they had to be built out of
   * spans with hand-written commas and colours forced back to inherit.
   *
   * The status badge went. Retired packages sit under their own heading below,
   * so a badge reading "active" on every card in the active list is noise
   * standing exactly where information should be.
   *
   * AND IT LED WITH THE WRONG THING. A package IS its price and what that price
   * buys; the card gave the price a blank string when unset, listed services
   * behind a bolded "Services:" label, and put "3 internal tasks required" on
   * the same footing as what the client receives. Now the name and the price
   * share the top line, the services it is built from sit under the name the
   * way a service's domain does, and the rest reads as three answers to three
   * questions rather than a paragraph of labels.
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

    return (
      <Link href={`/packages/${pkg.id}`} className="q-card q-stack q-plain-link q-card-interactive">
        <div className="q-row q-row-between">
          <div>
            <h3 className="q-card-title">{pkg.name}</h3>
            <span className="q-eyebrow">{bundle || 'No services bundled'}</span>
          </div>
          {/* Unpriced is a real state — a package can be built before it is
              priced — and it has to say so. A blank space where the price goes
              is indistinguishable from a price of nothing, which is the shape
              of the bug that emptied these in the first place. */}
          <span className="q-strong q-num">
            {pkg.price?.amount != null
              ? formatMoney(Number(pkg.price.amount), String(pkg.price.currency || currencyCode))
              : <span className="q-meta">No price set</span>}
          </span>
        </div>

        {pkg.description && <p className="q-meta">{pkg.description}</p>}

        <div className="q-stack q-stack-sm">
          <div className="q-row q-row-sm">
            <span className="q-eyebrow">Deliverables</span>
            <span className="q-meta">{promises.length > 0 ? promises.join(', ') : 'Nothing promised'}</span>
          </div>
          <div className="q-row q-row-sm">
            <span className="q-eyebrow">Variables</span>
            {/* What this package fixes is most of what makes it a different
                offer from the next package of the same service, so it is the
                value that belongs here — not the names of the ones it leaves
                open, which are a question the client answers rather than
                anything this package says. */}
            <span className="q-meta">
              {fixed.length > 0
                ? fixed.map((v: any) => `${v.label} ${formatVariableValue(v)}`).join(', ')
                : openVars.length > 0
                  ? `None fixed — ${openVars.length === 1 ? 'one is' : `${openVars.length} are`} asked at booking`
                  : 'None'}
            </span>
          </div>
          <div className="q-row q-row-sm">
            <span className="q-eyebrow">Tasks</span>
            <span className="q-meta">
              {taskCount > 0 ? `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}` : 'None, so a booking of it produces no work'}
            </span>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="q-row q-row-sm">
            {tags.flatMap((d) => d.values.map((v) => (
              <span key={v.id} className="q-value q-value-sm" title={d.name}>{v.name}</span>
            )))}
          </div>
        )}
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
            domainName: (pkg.services || [])[0]?.domain?.name ?? null,
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
