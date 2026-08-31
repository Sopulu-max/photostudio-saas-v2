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
 * A CONTROL THAT CANNOT CHANGE WHAT YOU SEE IS FURNITURE — and that, not the
 * length of the list, is the test for whether one draws.
 *
 * This used to hide the entire bar below eight items, on the reasoning that a
 * filter above three cards is clutter. The reasoning was fine and the rule was
 * wrong, because it measured the wrong thing. The studio this was built for
 * owns four services, four packages and five bookings, so every catalogue in
 * the app fell under the threshold and NOT ONE OF THESE CONTROLS HAD EVER
 * RENDERED. The search box, the facet, the classification chips: all written,
 * all reachable only by a studio twice this size. The page looked like a loop
 * over cards because, at this size, that is exactly what it was.
 *
 * So a catalogue always says what it holds and how it is arranged — that line
 * is the list describing itself, not furniture on top of it. What varies is the
 * narrowing offered, and each piece asks the same question of itself: could
 * clicking me change what is on screen? A facet with one value cannot (that
 * test was already here). A dimension whose every service answers "Portrait"
 * cannot either, and this studio has one of those — Subject, one value across
 * the whole catalogue, a row of chips that would filter nothing. Occasion has
 * four and Context two, so those draw.
 *
 * A PICKER IS NOT A CATALOGUE. Inside a form you are choosing, not browsing,
 * and a toolbar between two fields is genuinely in the way — so pickers keep
 * the size threshold, and say so by their kind rather than by accident.
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
  kind = 'picker',
  threshold = 8,
  sorts,
  cap,
  children,
}: {
  items: T[];
  read: (item: T) => CatalogFacets;
  /** Singular; pluralised with an s for the count line. */
  noun: string;
  /** What the single-select facet is called, for its own empty option. */
  facetLabel?: string;
  /**
   * A catalogue is browsed and always describes itself. A picker sits inside a
   * form, where the same bar is in the way, so it keeps the size threshold.
   */
  kind?: 'catalogue' | 'picker';
  /** Pickers only: below this many, the bar is furniture and does not draw. */
  threshold?: number;
  /**
   * How this list can be ordered. The caller owns these because only it knows
   * what its items are — a service sorts by name, a booking by date. The first
   * is the default, so a catalogue is never in whatever order the query
   * happened to return.
   */
  sorts?: { key: string; label: string; compare: (a: T, b: T) => number }[];
  /** Most rows to draw at once. Unset means all of them, which is a catalogue. */
  cap?: number;
  children: (shown: T[], state: { query: string; narrowed: boolean; dense: boolean }) => React.ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [facet, setFacet] = useState('');
  const [values, setValues] = useState<string[]>([]);
  const [uncapped, setUncapped] = useState(false);
  const [sortKey, setSortKey] = useState(sorts?.[0]?.key ?? '');
  /* Cards by default; rows when a studio wants to see more of the list than of
     each thing in it. Which of the two is right depends on whether you are
     recognising something or comparing several, and only the operator knows. */
  const [dense, setDense] = useState(false);

  const catalogue = kind === 'catalogue';
  if (!catalogue && items.length < threshold) {
    return <>{children(items, { query: '', narrowed: false, dense: false })}</>;
  }

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

  /*
   * The narrowing test, applied to each dimension in turn. A dimension every
   * item answers the same way sorts nothing into anything: clicking its one
   * chip returns the list you were already looking at. It is shown on the cards,
   * where it is information; it is not offered here, where it would be a
   * promise the control cannot keep.
   */
  const narrowing = [...dimensions.entries()].filter(([, d]) => d.values.size > 1);

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

  // Ordered after narrowing and before capping: what is held back by a cap has
  // to be the tail of the order the operator asked for, not of the query's.
  const chosenSort = sorts?.find((o) => o.key === sortKey) ?? sorts?.[0];
  const ordered = chosenSort ? [...shown].sort(chosenSort.compare) : shown;
  const drawn = cap && !uncapped ? ordered.slice(0, cap) : ordered;
  const held = shown.length - drawn.length;
  const toggle = (valueId: string) =>
    setValues((prev) => prev.includes(valueId) ? prev.filter((v) => v !== valueId) : [...prev, valueId]);

  return (
    <div className="q-stack q-stack-lg">
      <div className="q-stack q-stack-sm">
        <div className="q-toolbar">
          {/* The list, saying what it is. Present before anything is typed,
              because "how many services do I have" is a question a studio has
              without wanting to filter anything, and counting cards is not an
              answer a tool should make someone give themselves. */}
          {catalogue && (
            <span className="q-toolbar-count">
              {narrowed
                ? `${shown.length} of ${items.length}`
                : `${items.length}`}{' '}
              {items.length === 1 ? noun : `${noun}s`}
            </span>
          )}
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
          />
          {facetValues.length > 1 && (
            <select className="q-select" value={facet} onChange={(e) => setFacet(e.target.value)}>
              <option value="">Every {facetLabel}</option>
              {facetValues.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {sorts && sorts.length > 1 && (
            <select
              className="q-select" value={chosenSort?.key ?? ''} aria-label={`Order these ${noun}s`}
              onChange={(e) => setSortKey(e.target.value)}
            >
              {sorts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          )}
          {catalogue && (
            /* Two ways to look at the same list: recognise one thing, or
               compare many. The list does not change, only how much of each
               item it spends the width on. */
            <div className="q-seg" role="group" aria-label="How much to show">
              <button
                type="button" className={dense ? 'q-seg-btn' : 'q-seg-btn q-seg-on'}
                aria-pressed={!dense} onClick={() => setDense(false)}
              >
                Cards
              </button>
              <button
                type="button" className={dense ? 'q-seg-btn q-seg-on' : 'q-seg-btn'}
                aria-pressed={dense} onClick={() => setDense(true)}
              >
                List
              </button>
            </div>
          )}
        </div>

        {narrowing.map(([dimId, d]) => (
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
            {!catalogue && (
              <span className="q-meta-sm">
                {shown.length} of {items.length} {items.length === 1 ? noun : `${noun}s`}
              </span>
            )}
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
          {children(drawn, { query: search.trim(), narrowed, dense })}
          {held > 0 && (
            <div className="q-row q-row-sm">
              <span className="q-meta-sm">{drawn.length} of {ordered.length} shown.</span>
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
