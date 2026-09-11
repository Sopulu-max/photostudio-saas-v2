'use client';


import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { formatMoney } from '@/kernel/currency';
import { StorefrontLink } from './StorefrontLink';
import { formatDeliverable } from '@/modules/packages/deliverableSpec';
import { CatalogFilter } from '@/components/CatalogFilter';
import { CoverSlides } from '@/components/CoverSlides';
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

/* How many values of one question a poster shows before it starts
   counting. Three: enough to say what kind of thing it is. */
const PILLS_PER_QUESTION = 3;

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

  /*
   * THE SAME PACKAGE AS A CARD. Cards view: the poster - the client's own
   * card, one picture as the card, the words laid over it. Restored beside
   * the row rather than instead of it: the sheet scans, the poster browses,
   * and the toggle is which the operator is doing.
   */
  const Poster = ({ pkg, index }: { pkg: any; index: number }) => {
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
      /*
       * THE SAME CARD THE CLIENT SEES.
       *
       * This was a stack of six blocks — cover, eyebrow, title, promise, a
       * two-column facts grid, a footer band — each sized independently, and
       * every one of them a thing that could end up somewhere unintended as the
       * width changed. It was rebuilt three times and broke somewhere new each
       * time, because six boxes that must agree on a width is six chances to
       * disagree.
       *
       * The public catalogue solved this by not having the problem. A poster is
       * ONE box: the studio's own picture is the card, a scrim sits over it, and
       * the words are laid on top from the bottom up. There is no internal
       * layout to come apart, so there is nothing to make responsive — it is
       * the same card at 1200px and at 360px.
       *
       * WHAT THE STUDIO NEEDS AND A CLIENT DOES NOT is carried in the two
       * corners the poster already reserves: the price where the client sees
       * it, and Book where the picker puts its Details link. Retired packages
       * get the corner and not the button, for the reason they always did — a
       * studio that withdrew something should not be invited to sell it.
       */
      <div
        className={[
          'q-poster', 'q-poster-tall',
          pkg.cover_url ? '' : 'q-poster-blank',
          pkg.status === 'retired' ? 'q-poster-dim' : '',
        ].filter(Boolean).join(' ')}
        style={{
          ...(pkg.cover_url
            ? {
              ['--q-cover' as any]: `url(${pkg.cover_url})`,
              ['--q-cover-pos' as any]: pkg.cover_position || undefined,
            }
            : null),
          ['--i' as any]: index,
        } as React.CSSProperties}
      >
        {/* More than one picture takes over the photograph layer; one picture
            stays exactly the card it was, painted by --q-cover. */}
        {(pkg.images || []).length > 1 && (
          <CoverSlides slides={pkg.images} className="q-poster-photo" offset={(index % 7) * 650} />
        )}

        {/* The whole face opens the package. A link rather than a wrapper,
            because the two corners below are links of their own and an <a>
            inside an <a> is not valid markup. */}
        <Link href={`/packages/${pkg.id}`} className="q-poster-face" aria-label={pkg.name} />

        {priced && (
          <span className="q-poster-price">
            {formatMoney(Number(pkg.price.amount), String(pkg.price.currency || currencyCode))}
          </span>
        )}

        {pkg.status !== 'retired' && (
          <Link
            href={`/bookings/new?package=${pkg.id}`}
            className="q-poster-link"
            title={`Take a booking for ${pkg.name}`}
          >
            Book
          </Link>
        )}

        <span className="q-poster-title">{pkg.name}</span>

        {/*
          * WHAT THE CLIENT ACTUALLY RECEIVES, AT THE WEIGHT THAT DESERVES.
          *
          * This sat in the poster's quiet note line — the slot the public card
          * uses for a sentence of prose — at 0.78rem and 72% white, quieter
          * than everything except the footnotes. But the deliverables ARE the
          * product. A studio scanning its catalogue is telling four packages
          * apart, and three of these are called Studio Portrait Photography:
          * what separates them is 2 photographs against 3 against 4.
          *
          * Counted does the work and already existed for it — the number takes
          * the size and the weight, the words step back — which is why the same
          * list reads the same way here, on the package page, and in the
          * editor. Its own note says it: on a card this list IS what the reader
          * came for.
          */}
        {promises.length > 0 && (
          <span className="q-poster-promise">
            {promises.map((t: string, i: number) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="q-poster-promise-sep"> · </span>}
                <Counted text={t} />
              </React.Fragment>
            ))}
          </span>
        )}

        {/*
          * GROUPED BY THE QUESTION EACH ANSWERS.
          *
          * These ran together as one strip — Studio, Birthday, Anniversary,
          * Convocation, Maternity, 1 outfit — and a strip says "one list". It
          * is three different claims:
          *
          *   Studio answers Context. The four after it answer Occasion. Run
          *   together, nothing tells a reader that the first is not a fifth
          *   occasion, and the classification graph's whole point is that a
          *   value belongs to the question it answers.
          *
          *   "1 outfit" is not a classification at all. The others say this
          *   package CAN BE for any of these — a range. That one says you get
          *   exactly this — a fact. Drawn identically, a range reads as a fact.
          *
          * So values of one question sit tight together and questions sit
          * apart, and what the package has SETTLED is filled in rather than
          * outlined. Nothing is labelled: the grouping is the label, which is
          * the same move the fact rows make on every other screen.
          */}
        {/*
          * CAPPED, BECAUSE THE CARD IS FOR TELLING TWO PACKAGES APART.
          *
          * The promise line above has been capped at three since it was
          * written, for a reason stated there: a package promising six things
          * must not stand taller than one promising two, because they sit in a
          * grid. The pills were exempt from their own card's rule, and they
          * are the longest thing on it — six occasions and a context and a
          * fixed value is eleven pills, and a package narrowed to two occasions
          * gets four.
          *
          * Worse, it distinguishes nothing. The two packages in this catalogue
          * both called Studio Portrait Photography carry the SAME pills in the
          * same order; what separates them is the promise count and the price,
          * and both were pushed down the card by the list that doesn't differ.
          *
          * Three per question, then a count. The full list is on the package's
          * own page, which the whole face of this card opens.
          */}
        <span className="q-poster-tags">
          {tags.map((d) => {
            const shown = d.values.slice(0, PILLS_PER_QUESTION);
            const rest = d.values.length - shown.length;
            return (
              <span key={d.id} className="q-poster-group" title={d.name}>
                {shown.map((v: any) => (
                  <span key={v.id} className="q-poster-tag">{v.name}</span>
                ))}
                {rest > 0 && (
                  <span className="q-poster-tag-more" title={d.values.map((v: any) => v.name).join(', ')}>
                    +{rest}
                  </span>
                )}
              </span>
            );
          })}
          {fixed.length > 0 && (
            <span className="q-poster-group">
              {fixed.slice(0, PILLS_PER_QUESTION).map((v: any) => (
                <span key={v.serviceVariableId} className="q-poster-tag q-poster-tag-set">
                  {formatVariableValue(v)}
                </span>
              ))}
              {fixed.length > PILLS_PER_QUESTION && (
                <span className="q-poster-tag-more">+{fixed.length - PILLS_PER_QUESTION}</span>
              )}
            </span>
          )}
        </span>

        {/*
          * AND WHAT IS TRUE OF THE RECORD, NOT OF THE OFFER.
          *
          * How many questions a package defers and how much work it carries
          * are facts about the package as an object in this system — a client
          * is never told either. They were pills in the same row as what the
          * package is FOR, which put bookkeeping at the weight of the offer.
          * Below a hairline, in plain text, they read as the footnote they are.
          */}
        {(asked.length > 0 || taskCount > 0 || !priced) && (
          <span className="q-poster-notes">
            {[
              asked.length > 0 ? `${asked.length} asked at booking` : null,
              taskCount > 0 ? `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}` : null,
              !priced ? 'No price set' : null,
            ].filter(Boolean).join(' · ')}
          </span>
        )}
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
          /* Two views of one catalogue: Cards, the poster wall, for browsing;
             List, the sheet, for finding one. */
          views
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
            const Wall = ({ items }: { items: any[] }) => dense
              ? <div className="q-sheet">{items.map((pkg: any) => <Row key={pkg.id} pkg={pkg} />)}</div>
              : <div className="q-poster-grid q-poster-grid-lg">{items.map((pkg: any, i: number) => <Poster key={pkg.id} pkg={pkg} index={i} />)}</div>;
            return (
              <>
                <Wall items={offered} />
                {retired.length > 0 && (
                  <section className={offered.length > 0 ? 'q-section-gap' : undefined}>
                    <h2 className="q-section-title">Retired</h2>
                    <p className="q-meta" style={{ marginBottom: '16px' }}>
                      Not offered on new bookings. Past bookings keep their line and price.
                    </p>
                    <Wall items={retired} />
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
