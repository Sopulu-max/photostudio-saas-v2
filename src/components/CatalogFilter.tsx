'use client';

import React, { useState } from 'react';

export type CatalogFacets = {
  name: string;
  description?: string | null;
  /**
   * The one facet a thing has exactly one of — a service domain for a package,
   * a stage for a booking. Named for what it does rather than for the first
   * thing that used it, because the second caller narrows by something else
   * entirely and the word domain would have lied there.
   */
  facet?: string | null;
  /** Flattened, because narrowing does not care which entity carried the value. */
  tags: { dimensionId: string; dimensionName: string; valueId: string; valueName: string }[];
};

/**
 * Narrowing a catalogue with the studio's own vocabulary.
 *
 * WHY A SEARCH BOX IS ONLY HALF OF IT. A list you can search is a list you can
 * get through if you already know the name of the thing you want. A studio
 * looking at its own catalogue usually does not: it is looking for the studio
 * maternity packages, or everything it does outdoors — which is exactly what
 * its dimensions say, and exactly how a client narrows the storefront. So the
 * same vocabulary that classifies the work is what browses it. Nothing new is
 * invented here to make a long list navigable; the studio already defined it.
 *
 * WITHIN A DIMENSION, OR. ACROSS DIMENSIONS, AND. Picking Studio and Outdoor
 * under Context means either, because they are two answers to one question.
 * Picking Studio under Context and Maternity under Occasion means both, because
 * they are answers to different ones. That is what narrowing means, and getting
 * it the other way round would make every extra click return more rather than
 * less.
 *
 * IT APPEARS WHEN IT IS NEEDED. Below the threshold the whole catalogue is on
 * one screen and a filter bar above three cards is furniture, so the children
 * render alone. The count line is always shown once narrowing is on, because a
 * filtered list that does not say it is filtered is indistinguishable from a
 * studio that owns nine packages.
 *
 * A CATALOGUE IS NEVER CAPPED, and a picker always is. Browsing inventory is a
 * real thing to do, so hiding some of it behind a "show more" would be its own
 * failure — but inside a form you are choosing rather than looking, and fifty
 * rows between two fields buries the fields. So `cap` is the caller's to set,
 * and when it is set the count of what is held back is stated with a way to
 * open it. A bound that says how much it is holding is not a wall.
 *
 * The children are handed the query as well as the matches, because a picker
 * that offers to CREATE what was searched for — "no package called that, make
 * one" — needs the words that found nothing. That is the caller's to render;
 * this only knows how to narrow.
 */
export function CatalogFilter<T>({
  items,
  read,
  noun,
  facetLabel = 'domain',
  threshold = 8,
  cap,
  children,
}: {
  items: T[];
  read: (item: T) => CatalogFacets;
  /** Singular; pluralised with an s for the count line. */
  noun: string;
  /** What the single-select facet is called, for its own empty option. */
  facetLabel?: string;
  /** Below this many, the control is furniture and does not draw. 0 always draws. */
  threshold?: number;
  /** Most rows to draw at once. Unset means all of them, which is a catalogue. */
  cap?: number;
  children: (shown: T[], state: { query: string; narrowed: boolean }) => React.ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [facet, setFacet] = useState('');
  const [values, setValues] = useState<string[]>([]);
  const [uncapped, setUncapped] = useState(false);

  if (items.length < threshold) return <>{children(items, { query: '', narrowed: false })}</>;

  const facets = new Map<T, CatalogFacets>(items.map((i) => [i, read(i)]));
  const facetValues = [...new Set([...facets.values()].map((f) => f.facet).filter(Boolean))] as string[];

  // Only dimensions this list actually carries, so the control describes the
  // catalogue in front of you rather than the studio's whole vocabulary.
  const dimensions = new Map<string, { name: string; values: Map<string, string> }>();
  for (const f of facets.values()) {
    for (const t of f.tags) {
      if (!dimensions.has(t.dimensionId)) dimensions.set(t.dimensionId, { name: t.dimensionName, values: new Map() });
      dimensions.get(t.dimensionId)!.values.set(t.valueId, t.valueName);
    }
  }

  const chosenByDimension = new Map<string, string[]>();
  for (const [dimId, d] of dimensions) {
    const mine = values.filter((v) => d.values.has(v));
    if (mine.length > 0) chosenByDimension.set(dimId, mine);
  }

  const needle = search.trim().toLowerCase();
  const shown = items.filter((item) => {
    const f = facets.get(item)!;
    if (facet && f.facet !== facet) return false;
    for (const [, chosen] of chosenByDimension) {
      if (!f.tags.some((t) => chosen.includes(t.valueId))) return false;
    }
    if (!needle) return true;
    return [f.name, f.description, f.facet, ...f.tags.map((t) => t.valueName)]
      .some((field) => (field || '').toLowerCase().includes(needle));
  });

  const narrowed = Boolean(needle) || Boolean(facet) || values.length > 0;
  const drawn = cap && !uncapped ? shown.slice(0, cap) : shown;
  const held = shown.length - drawn.length;
  const toggle = (valueId: string) =>
    setValues((prev) => prev.includes(valueId) ? prev.filter((v) => v !== valueId) : [...prev, valueId]);

  return (
    <div className="q-stack q-stack-lg">
      <div className="q-stack q-stack-sm">
        <div className="q-row q-row-sm">
          <input
            className="q-input"
            /* Names only what is actually searchable here: bookings have no
               classifications and a hint promising them would be a lie. */
            placeholder={[
              `Search ${noun}s by name`,
              facetValues.length > 1 ? facetLabel : '',
              dimensions.size > 0 ? 'classification' : '',
            ].filter(Boolean).join(', ')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '1 1 18rem' }}
          />
          {facetValues.length > 1 && (
            <select className="q-select" value={facet} onChange={(e) => setFacet(e.target.value)}>
              <option value="">Every {facetLabel}</option>
              {facetValues.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>

        {[...dimensions.entries()].map(([dimId, d]) => (
          <div key={dimId} className="q-row q-row-sm">
            <span className="q-eyebrow">{d.name}</span>
            {[...d.values.entries()].map(([valId, valName]) => (
              <button
                key={valId}
                type="button"
                className={values.includes(valId) ? 'q-value q-value-sm q-value-on' : 'q-value q-value-sm'}
                onClick={() => toggle(valId)}
                aria-pressed={values.includes(valId)}
              >
                {valName}
              </button>
            ))}
          </div>
        ))}

        {narrowed && (
          <div className="q-row q-row-sm">
            <span className="q-meta-sm">
              {shown.length} of {items.length} {items.length === 1 ? noun : `${noun}s`}
            </span>
            <button
              type="button" className="q-btn q-btn-secondary q-btn-xs"
              onClick={() => { setSearch(''); setFacet(''); setValues([]); }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="q-empty">
          No {noun} matches. Clear the filters, or nothing here is like this yet.
        </p>
      ) : (
        <>
          {children(drawn, { query: search.trim(), narrowed })}
          {held > 0 && (
            <div className="q-row q-row-sm">
              <span className="q-meta-sm">{drawn.length} of {shown.length} shown.</span>
              <button type="button" className="q-btn q-btn-ghost q-btn-xs" onClick={() => setUncapped(true)}>
                Show the other {held}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
