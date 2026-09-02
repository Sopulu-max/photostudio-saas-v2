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
  const Card = ({ pkg, withCover }: { pkg: any; withCover: boolean }) => {
    const tags = dimensionTags(pkg);
    const bundle = (pkg.services || []).map((s: any) => s.name).join(' + ');
    const promises = (pkg.deliverables || []).map((d: any) => formatDeliverable(d));
    /*
     * Fixed is what the package SAYS; asked and undecided are what it leaves.
     * This read every package_variable_values row as a fixed value, so one the
     * package had deliberately left to the client — which still has a row,
     * because that is where the decision is recorded — printed its label with
     * nothing beside it. "Location address" and then blank, on the card.
     */
    const { fixed, asked } = splitVariables(
      (pkg.services || []).flatMap((s: any) => s.variableValues || []),
      (pkg.services || []).flatMap((s: any) => s.variables || []),
    );
    const taskCount = (pkg.services || []).reduce((acc: number, s: any) => acc + (s.tasks || []).length, 0);
    const priced = pkg.price?.amount != null;

    return (
      <div className="q-card q-card-interactive q-card-linked q-stack q-rise">
        {/*
          * Drawn whenever ANY package in this grid has one — not always.
          *
          * The reason it was unconditional is sound and still holds: a card in a
          * grid is stretched to the tallest in its row, so one package with a
          * picture beside one without would put their titles at different
          * heights and undo the alignment everything else here was built for.
          * Empty, the wash carries the initial and reads as an invitation.
          *
          * But that argument only needs the band when there is a picture in the
          * grid to align against. A catalogue where NOTHING has a cover yet —
          * which is every studio before it uploads its first one — was spending
          * the most prominent zone of all twelve cards on twelve grey
          * rectangles, each carrying one letter it already says in the title
          * directly underneath. Identical blocks in the position the eye goes
          * first is precisely what makes a catalogue read as a loop.
          *
          * Computed per grid rather than per catalogue, because offered and
          * retired are two grids and rows only stretch within one.
          */}
        {withCover && <div
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
        </div>}

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
          {/*
            * THE LINK IS THE TITLE, AND THE TITLE COVERS THE CARD.
            *
            * The whole card used to be one <a>. That is the easy way to make a
            * card clickable and it leaves nowhere to put a second act — and an
            * <a> inside an <a> is not valid, so a Book button could not simply
            * be added. Now one link names the package and stretches an
            * invisible layer over the face; the card still opens on a click
            * anywhere, and a screen reader hears "Standard Event Coverage,
            * link" instead of every word on the card read out as one name.
            */}
          <h3 className="q-card-title">
            <Link href={`/packages/${pkg.id}`} className="q-card-cover-link q-plain-link">
              {pkg.name}
            </Link>
          </h3>
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

        {(tags.length > 0 || fixed.length > 0) && (
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
          </div>
        )}

        {/*
          * NOT A ROW IN THAT TABLE.
          *
          * This was one — key "ASKED", value "4 at booking" — sitting under
          * CONTEXT, OCCASION and DRONE COVERAGE in the same two columns and the
          * same pill. But that table means one thing: here is a property of this
          * package, and here is what it was set to. "Asked" is not a property
          * and "4 at booking" is not a value of it; it is a count of the
          * properties that have NO value, which is the opposite of what every
          * other row in the grid is saying.
          *
          * It was drawn in q-absent grey as well, and on this card that grey is
          * how absence reads — "No price set", "Produces nothing yet". So four
          * questions the studio deliberately chose to ask the client came out
          * looking like four things it had failed to fill in.
          *
          * Said as a sentence instead, below the settled facts rather than
          * inside them, and in ordinary secondary text because deferring a
          * decision to the client is a normal thing for a package to do.
          */}
        {asked.length > 0 && (
          <p className="q-meta-sm">
            {asked.length} {asked.length === 1 ? 'question' : 'questions'} asked at booking
          </p>
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
          {/*
            * WHAT THE CATALOGUE IS FOR.
            *
            * A studio looking at its packages is usually looking because
            * somebody wants one. Until now the only thing a card could do was
            * open itself, so taking the booking meant leaving here, opening the
            * new booking form and finding the package again in its rail — the
            * catalogue was a reference work rather than somewhere work starts.
            *
            * It carries the package to the form rather than doing anything
            * itself: booking is the booking form's job, and this is one more
            * way in.
            */}
          <Link
            href={`/bookings/new?package=${pkg.id}`}
            className="q-btn q-btn-secondary q-btn-xs q-card-act"
            title={`Take a booking for ${pkg.name}`}
          >
            Book
          </Link>
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
          items={initialPackages}
          noun="package"
          kind="catalogue"
          sorts={HOW_TO_ORDER}
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
          {(shown, { dense }) => {
            const offered = shown.filter((pkg: any) => pkg.status !== 'retired');
            const retired = shown.filter((pkg: any) => pkg.status === 'retired');
            const grid = dense ? 'q-grid-rows' : 'q-grid-cards';
            // Per grid: a row is only stretched by its own siblings.
            const offeredCovers = offered.some((pkg: any) => pkg.cover_url);
            const retiredCovers = retired.some((pkg: any) => pkg.cover_url);
            return (
              <>
                <div className={grid}>
                  {offered.map((pkg: any) => <Card key={pkg.id} pkg={pkg} withCover={offeredCovers} />)}
                </div>
                {retired.length > 0 && (
                  <section className={offered.length > 0 ? 'q-section-gap' : undefined}>
                    <h2 className="q-section-title">Retired</h2>
                    <p className="q-meta" style={{ marginBottom: '16px' }}>
                      Not offered on new bookings. Past bookings keep their line and price.
                    </p>
                    <div className={grid}>
                      {retired.map((pkg: any) => <Card key={pkg.id} pkg={pkg} withCover={retiredCovers} />)}
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
