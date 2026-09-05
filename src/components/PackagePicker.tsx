'use client';

import React from 'react';
import { CatalogFilter } from '@/components/CatalogFilter';
import { formatMoney } from '@/kernel/currency';
import { hasPrice } from '@/kernel/money';
import { admits, narrowingFrom } from '@/kernel/classification';

/**
 * THE STUDIO'S CATALOGUE, WHEREVER A PACKAGE IS BEING CHOSEN.
 *
 * This lived inside the new-booking form, so it was the only screen that had
 * it. Adding a package to an EXISTING booking — the ordinary way to correct
 * one, and the only way the edit page offered — was a bare dropdown of names:
 * no picture, no price, no services, no way to narrow by what the job actually
 * is. The same catalogue, two screens, two completely different experiences of
 * choosing from it.
 *
 * The narrowing goes through the kernel rather than being written out again.
 * There were three hand-rolled versions of that rule across this app and they
 * did not agree: one ranked without excluding, one excluded, one carried a
 * shape check for two package shapes that had drifted apart.
 */

/**
 * A package's narrowing as flat rows.
 *
 * Two shapes reach here — nested `{ id, values: [] }` from the catalogue and
 * flat `{ dimensionId, valueId }` from the public listing. Normalised once so
 * the rule never has to know.
 */
export function narrowingRowsOf(pkg: any): { dimensionId: string; valueId: string }[] {
  return ((pkg.dimensions || []) as any[]).flatMap((d: any) =>
    d.values
      ? (d.values as any[]).map((v: any) => ({ dimensionId: d.id, valueId: v.id }))
      : [{ dimensionId: d.dimensionId, valueId: d.valueId }],
  ).filter((r: any) => r.dimensionId && r.valueId);
}

/** The catalogue, narrowed by whatever is being filtered for. */
export function narrowCatalogue<T extends { dimensions?: any[] }>(
  packages: T[],
  values: Record<string, string>,
): T[] {
  const answers = Object.entries(values)
    .filter(([, valueId]) => Boolean(valueId))
    .map(([dimensionId, valueId]) => ({ dimensionId, valueId }));
  if (answers.length === 0) return packages;
  return packages.filter((pkg) => admits(narrowingFrom(narrowingRowsOf(pkg)), answers));
}

export function PackagePicker({
  packages,
  dimensions,
  values,
  onValuesChange,
  onChoose,
  onCreateBespoke,
  alreadyOn = () => 0,
  currencyCode,
}: {
  /** The catalogue, already excluding anything retired. */
  packages: any[];
  /** Every classification the studio uses, for narrowing the list. */
  dimensions: { id: string; name: string; values: { id: string; name: string }[] }[];
  values: Record<string, string>;
  onValuesChange: (next: Record<string, string>) => void;
  onChoose: (packageId: string) => void;
  /**
   * Build something bespoke from what was typed. Omitted where that is not on
   * offer, and the button then does not appear.
   */
  onCreateBespoke?: (name: string) => void;
  /** How many of this package are already on the booking. */
  alreadyOn?: (packageId: string) => number;
  currencyCode: string;
}) {
  const shownPackages = React.useMemo(
    () => narrowCatalogue(packages, values),
    [packages, values],
  );

  return (
                <div className="q-stack q-stack-sm">

                  {/*
                    * Narrowing, offered rather than demanded.
                    *
                    * This was a grid headed "Requirements", every classification
                    * the domain has, shown before the operator had seen a single
                    * package. It read as a form to complete on the way to
                    * booking — but none of it is required, and with a handful of
                    * packages none of it is needed. It is a filter, so it is
                    * folded away with a count of what is active, and the packages
                    * themselves lead.
                    */}
                  {/* Matching Packages Stack */}
                  <div className="q-stack q-stack-md">

                    {/*
                      * THE SEARCH IS CatalogFilter'S; THE DIMENSIONS ABOVE ARE NOT.
                      *
                      * Narrowing a list by typing, saying how many of how many
                      * are left, and offering a clear is one act, written here
                      * and in two catalogues and in the service picker. This one
                      * now goes through the same component as the rest.
                      *
                      * The dimension selects above deliberately stay outside it,
                      * and not for want of effort. They do two things a filter
                      * does not. They carry into the package that gets created,
                      * so a search that found nothing becomes a package already
                      * classified the way it was looked for. And they match by
                      * the open-narrowing rule — a package that never narrowed a
                      * dimension accepts any value of it — which is a statement
                      * about the ontology, not a set membership test. Folding
                      * either into a general filter would have meant teaching it
                      * this module's rules.
                      */}
                    <CatalogFilter
                      items={shownPackages}
                      noun="package"
                      /*
                        * A CATALOGUE, NOW THAT IT IS ONE.
                        *
                        * It was a picker because it used to sit inside a booking
                        * line, where a recessed panel around one control would
                        * have read as a fieldset nobody asked for. It no longer
                        * sits inside anything: it is the studio catalogue, under
                        * the section heading, browsed. So it takes the panel the
                        * other catalogues take — which is what separates the
                        * instrument from the results, and what puts the filter in
                        * its own block with the rail as a block below it.
                        *
                        * Without the view switch: the results are a rail, which
                        * spends the same width on every card whatever Cards or
                        * List says, so the control would do nothing.
                        */
                      kind="catalogue"
                      views={false}
                      // Under a heading already reading "2. Packages", a line
                      // reading "3 packages" is two numbers about one subject,
                      // and they read as a sequence. It returns the moment
                      // something is narrowing, when the count is news and Clear
                      // needs somewhere to live.
                      count={false}
                      // Always drawn: this is the step, not an aid to it.
                      threshold={0}
                      // Every domain this package's services come from, so one
                      // spanning two is kept by either — the same shape the
                      // Packages catalogue reads.
                      facetLabel="domain"
                      /*
                        * Narrowing that belongs to this module, drawn inside
                        * the filter's panel rather than as a second fold
                        * stacked above it. See the note on CatalogFilter's
                        * extra prop for why it cannot simply become tags.
                        */
                      extra={dimensions.length > 0 && (() => {
        const active = Object.values(values).filter(Boolean).length;
        /*
         * No margin of its own. It carried marginBottom: 24px from when it was a
         * standalone block floating above the search bar, and inside the filter's
         * stack that doubled with the 24px the stack already puts between the
         * controls and the results — 48 measured pixels of nothing between the
         * last control and the first card.
         *
         * Spacing between blocks belongs to the stack that holds them, which is
         * also why it should never have been an inline style: a value hard-coded
         * onto an element cannot know what container it will end up in.
         */
        return (
        <details className="q-stack q-stack-md" open={active > 0}>
          <summary className="q-strong" style={{ cursor: 'pointer' }}>
            Filter by classification{active > 0 ? ` · ${active} applied` : ''}
          </summary>
          <div className="q-grid-2" style={{ marginTop: '12px' }}>
            {dimensions.map((d: any) => (
              <div key={d.id} className="q-field">
                <label className="q-label">{d.name}</label>
                <select
                  className="q-select"
                  value={values[d.id] || ''}
                  onChange={(e) => onValuesChange({ ...values, [d.id]: e.target.value })}
                >
                  <option value="">Any</option>
                  {d.values.map((v: any) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </details>
        );
      })()}
                      read={(p: any) => ({
                        name: p.name,
                        description: p.description,
                        facet: [...new Set(((p.services || []) as any[])
                          .map((sv: any) => sv.domain?.name || sv.domainName)
                          .filter(Boolean))] as string[],
                        tags: [],
                      })}
                    >
                      {(pkgs, { query }) => (
                        <div className="q-stack q-stack-sm">
                          {/*
                            * RECOGNISED, NOT READ.
                            *
                            * These were rows of text, stacked, so twenty
                            * packages became twenty lines that pushed Tasks,
                            * Invoice and Contract off the screen — and the
                            * operator picking one had to read names to tell
                            * them apart while somebody waited on the telephone.
                            *
                            * A picture says which package it is faster than a
                            * name does, and now that packages carry covers
                            * there is a picture to say it with. Sideways, so a
                            * catalogue of thirty cannot grow the form
                            * vertically without limit, and with the next card
                            * showing past the edge so it is plain there is more
                            * that way.
                            *
                            * IT DOES NOT STAND ALONE, and that is the point. A
                            * rail is good for browsing a dozen and bad for
                            * scanning forty — you cannot see them at once. The
                            * search, the domain and the classifications above
                            * are what narrow forty to a dozen; the rail is only
                            * ever showing what came back.
                            *
                            * The card is the ordinary q-card the Packages
                            * catalogue draws — same cover, same empty wash,
                            * same initial, same price — so an operator chooses
                            * from things they already recognise from that page,
                            * and none of it is defined twice.
                            *
                            * Nothing inside it links or clicks. The card IS the
                            * button; a second thing to aim at on a card that is
                            * already the subject is what came off the service
                            * cards, for this reason.
                            */}
                          <div className="q-rail-frame"><div className="q-rail">
                            {pkgs.map((p: any) => {
                              const domains = [...new Set(((p.services || []) as any[])
                                .map((sv: any) => sv.domain?.name || sv.domainName).filter(Boolean))];
                              const priced = hasPrice(p.price);
                              /*
                               * How many of this one are already on the booking.
                               *
                               * Adding the same package twice is legitimate — two
                               * portrait sessions, two shoots on a wedding — so
                               * the click adds rather than toggles. But it was
                               * adding SILENTLY: the card looked identical after,
                               * and the line it created landed below the fold. A
                               * click that appears not to have worked invites
                               * another, so three of a package was the natural
                               * result of doubting the first one.
                               *
                               * The answer is not to forbid the second. It is to
                               * make the first visible where the click happens.
                               */
                              const onBooking = alreadyOn(p.id);
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  className={`q-card q-card-interactive q-stack${onBooking > 0 ? ' q-card-chosen' : ''}`}
                                  style={{ textAlign: 'left', cursor: 'pointer' }}
                                  aria-label={onBooking > 0
                                    ? `${p.name} — ${onBooking} already on this booking. Add another.`
                                    : `Add ${p.name} to this booking`}
                                  onClick={() => onChoose(p.id)}
                                  title={p.description || p.name}
                                >
                                  <div
                                    className={p.coverUrl ? 'q-cover' : 'q-cover q-cover-empty'}
                                    style={p.coverUrl
                                      ? { backgroundImage: `url(${p.coverUrl})`, backgroundPosition: p.coverPosition || undefined }
                                      : undefined}
                                  >
                                    {!p.coverUrl && (
                                      <span className="q-cover-initial">
                                        {(p.name || '?').trim().charAt(0).toUpperCase()}
                                      </span>
                                    )}
                                  </div>

                                  <div>
                                    {/* Every domain it draws on, so a package
                                        bundling across two says so here too. */}
                                    {domains.length > 0 && (
                                      <span className="q-eyebrow">{domains.join(' + ')}</span>
                                    )}
                                    <h4 className="q-card-title">{p.name}</h4>
                                  </div>

                                  {/* What it is made of and what it promises —
                                      the counts that tell one package from
                                      another without reading a description. */}
                                  <p className="q-meta-sm" style={{ margin: 0 }}>
                                    {[
                                      p.services?.length ? `${p.services.length} service${p.services.length === 1 ? '' : 's'}` : null,
                                      p.deliverables?.length ? `${p.deliverables.length} deliverable${p.deliverables.length === 1 ? '' : 's'}` : null,
                                      p.durationMinutes ? `${p.durationMinutes} minutes` : null,
                                    ].filter(Boolean).join(' \u00b7 ')}
                                  </p>

                                  <div className="q-card-foot">
                                    <span className={priced ? 'q-price' : 'q-price q-absent'}>
                                      {priced
                                        ? formatMoney(Number((p.price as any).amount), String((p.price as any).currency || currencyCode))
                                        : 'No price set'}
                                    </span>
                                    {/* Said at the point of the click, which is
                                        where the answer to "did that land?" has
                                        to be. The flash on the new line below
                                        says where it went; this says that it
                                        went. */}
                                    {onBooking > 0 && (
                                      <span className="q-badge q-badge-success">
                                        {onBooking === 1 ? 'On this booking' : `${onBooking} on this booking`}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div></div>

                          {/*
                            * Creating is always offered, not only when the list
                            * comes back empty: an operator often knows before
                            * they look that this one is bespoke. The name they
                            * typed and the classifications they narrowed by both
                            * carry into the new package, which is why the query
                            * has to come back out of the filter.
                            */}
                          <button
                            type="button"
                            className="q-btn q-btn-secondary"
                            onClick={() => onCreateBespoke?.(query)}
                          >
                            {query ? `Create package: “${query}”` : 'Create a new package'}
                          </button>
                        </div>
                      )}
                    </CatalogFilter>
                  </div>
                </div>
  );
}
