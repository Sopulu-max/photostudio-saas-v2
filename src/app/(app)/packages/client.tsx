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
   * One package, as a card in a grid of them.
   *
   * A GRID IS FOR COMPARING, and none of this was comparable. Every fact was
   * drawn as a wrapping row of label-then-value, so the values began at a
   * different x on every line and a different x again on the next card; the
   * price and a missing price were the same grey at the same weight; and the
   * description had no bound, so one package with a paragraph stretched every
   * card beside it and left the short ones half empty. Cards in a row are
   * stretched to the tallest of them — that is the whole reason a long
   * description made a long card.
   *
   * So: a fixed label column that every value starts at, a description clamped
   * to two lines because it is the only part with no natural length, a footer
   * pinned to the bottom so every card in a row ends on the same line, and
   * absent facts drawn as absences rather than as values.
   *
   * CLASSIFICATIONS ARE NOT TAGS, and were being drawn as a row of them with
   * the dimension hidden in a title attribute — so "Studio, Maternity" floated
   * with nothing to say which question either answered. The dimension IS the
   * label: Context / Studio, Occasion / Maternity. They read as answers now,
   * and the same dimension lands on the same line of every card, which is what
   * lets you read down a column.
   *
   * They are plain text here rather than the value chips the detail page uses.
   * A chip lifts under the pointer because it is a link to everything
   * classified that way, and inside a card that is itself one link it would be
   * promising a click it cannot honour.
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
        <div className="q-row q-row-between">
          <div className="q-fill">
            <h3 className="q-card-title">{pkg.name}</h3>
            <span className="q-eyebrow">{bundle || 'No services bundled'}</span>
          </div>
          <span className={priced ? 'q-price' : 'q-price q-absent'}>
            {priced
              ? formatMoney(Number(pkg.price.amount), String(pkg.price.currency || currencyCode))
              : 'No price set'}
          </span>
        </div>

        {pkg.description && <p className="q-meta q-clamp-2">{pkg.description}</p>}

        <dl className="q-defs">
          <dt>Deliverables</dt>
          <dd className={promises.length > 0 ? undefined : 'q-absent'}>
            {promises.length > 0 ? promises.join(', ') : 'Nothing promised'}
          </dd>

          <dt>Variables</dt>
          {/* What this package FIXES is most of what makes it a different offer
              from the next package of the same service. The ones it leaves open
              are a question the client answers, not something this package says
              — so they are counted, not named. */}
          <dd className={fixed.length > 0 ? undefined : 'q-absent'}>
            {fixed.length > 0
              ? fixed.map((v: any) => `${v.label} ${formatVariableValue(v)}`).join(', ')
              : openVars.length > 0
                ? `${openVars.length} asked at booking`
                : 'None'}
          </dd>

          {tags.map((d) => (
            <React.Fragment key={d.id}>
              <dt>{d.name}</dt>
              <dd>{d.values.map((v) => v.name).join(', ')}</dd>
            </React.Fragment>
          ))}
        </dl>

        <div className="q-card-foot">
          <span className={taskCount > 0 ? 'q-meta-sm' : 'q-meta-sm q-absent'}>
            {taskCount > 0
              ? `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`
              : 'No tasks — a booking of it produces no work'}
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
