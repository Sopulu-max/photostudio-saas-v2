'use client';

import React, { useState } from 'react';

export type CatalogFacets = {
  name: string;
  description?: string | null;
  /**
   * What this thing files under — a service domain for a package, a stage for
   * a booking. Named for what it does rather than for the first thing that
   * used it, because the second caller narrows by something else entirely and
   * the word domain would have lied there.
   *
   * ONE OR SEVERAL, because some things genuinely are both. This said "the one
   * facet a thing has exactly one of", and a package is the counter-example
   * sitting in the same repository: it bundles services, and those services can
   * come from different domains, so a package of Event Photography and Event
   * Videography belongs to Photography AND Videography. The catalogue's own
   * note claimed such a package "reads under both" while the line beneath it
   * passed services[0].domain.name — the first one, whichever that happened to
   * be — so filtering by Videography hid it.
   */
  facet?: string | string[] | null;
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
  views,
  threshold = 8,
  sorts,
  cap,
  extra,
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
  /*
   * Whether to offer Cards or List.
   *
   * kind was deciding four things at once — the size threshold, the panel, the
   * count, and this — and they do not always travel together. The booking
   * form's package catalogue wants the first three: it is browsed, it says what
   * it holds, and its controls are an instrument worth giving a surface to. But
   * it draws its results as a rail, which spends the same width on every card
   * whatever this says, so offering the switch would be offering a control that
   * does nothing. Defaults to whatever kind implies; said explicitly when it
   * differs.
   */
  views?: boolean;
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
  /*
   * Narrowing this component cannot own, drawn inside its panel anyway.
   *
   * The booking form's classification selects are the case. They cannot be
   * folded into this — they carry into the package that gets created, and they
   * match by the open-narrowing rule where a package that never narrowed a
   * dimension accepts any value of it, which is a statement about the ontology
   * and not a set membership test. But being un-generalisable is not a reason
   * to be somewhere else: they were rendered above the bar as a second fold, so
   * the section had two separate narrowing instruments stacked on each other
   * with a heading between them.
   *
   * So the caller keeps the logic and this keeps the surface.
   */
  extra?: React.ReactNode;
  children: (shown: T[], state: { query: string; narrowed: boolean; dense: boolean }) => React.ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [facet, setFacet] = useState('');
  const [values, setValues] = useState<string[]>([]);
  const [uncapped, setUncapped] = useState(false);
  /* Which classifications have been asked to show all of their values. */
  const [openDims, setOpenDims] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState(sorts?.[0]?.key ?? '');
  /* Cards by default; rows when a studio wants to see more of the list than of
     each thing in it. Which of the two is right depends on whether you are
     recognising something or comparing several, and only the operator knows. */
  const [dense, setDense] = useState(false);

  const catalogue = kind === 'catalogue';
  const offerViews = views ?? catalogue;
  if (!catalogue && items.length < threshold) {
    return <>{children(items, { query: '', narrowed: false, dense: false })}</>;
  }

  const facets = new Map<T, CatalogFacets>(items.map((i) => [i, read(i)]));
  /** One or several, flattened — a thing filing under two offers both. */
  const facetsOf = (f: CatalogFacets): string[] =>
    (Array.isArray(f.facet) ? f.facet : [f.facet]).filter(Boolean) as string[];
  const facetValues = [...new Set([...facets.values()].flatMap(facetsOf))].sort();

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
    // Files under the chosen one, not IS the chosen one: a package spanning two
    // domains is kept by either.
    if (facet && !facetsOf(f).includes(facet)) return false;
    for (const [, chosen] of chosenByDimension) {
      if (!f.tags.some((t) => chosen.includes(t.valueId))) return false;
    }
    if (!needle) return true;
    return [f.name, f.description, ...facetsOf(f), ...f.tags.map((t) => t.valueName)]
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

  const CHIPS_PER_ROW = 8;

  return (
    <div className="q-stack q-stack-lg">
      {/*
        * ONE SURFACE, SO THE INSTRUMENT LOOKS LIKE ONE.
        *
        * Every control here already existed — search, domain, sort, cards or
        * list, and a chip per classification. They sat loose on the page
        * background in a flat run of equal weight, so the page read as a grid
        * of cards with some form fields above it, and an operator told me it
        * had no search, display or filtering at all. It had all three. Nothing
        * said so.
        *
        * The panel is the whole fix in one move: everything that NARROWS the
        * list is inside it, everything that IS the list is outside. A border
        * and a quieter ground are enough to say instrument here, result there.
        */}
      {/*
        * The panel is the catalogue's, not the picker's. A picker is a control
        * inside a form that is already a stack of controls, and a second
        * recessed box around one of them reads as a fieldset nobody asked for.
        * The same distinction this component already draws for the count and
        * the Cards/List switch.
        */}
      <div className={catalogue ? 'q-narrow' : 'q-stack q-stack-sm'}>
        <div className="q-toolbar">
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
          {offerViews && (
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

        {/*
          * The keys share a column so several classifications read as one
          * instrument rather than three loose sentences, and the values line up
          * under each other down the rows.
          */}
        {narrowing.map(([dimId, d]) => {
          const all = [...d.values.entries()];
          /* A studio's vocabulary has no ceiling, and neither did this: every
             value of every classification was drawn, so enough of them pushed
             the list they narrow off the screen. The ones already chosen are
             always kept, so nothing in force can be hidden behind "more". */
          const open = openDims.includes(dimId);
          const drawnChips = open
            ? all
            : all.filter(([id], i) => i < CHIPS_PER_ROW || values.includes(id));
          const hidden = all.length - drawnChips.length;
          return (
            <div key={dimId} className="q-narrow-row">
              <span className="q-narrow-key">{d.name}</span>
              <span className="q-narrow-values">
                {drawnChips.map(([valId, valName]) => (
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
                {hidden > 0 && (
                  <button
                    type="button" className="q-btn q-btn-ghost q-btn-xs"
                    onClick={() => setOpenDims((prev) => [...prev, dimId])}
                  >
                    {hidden} more
                  </button>
                )}
              </span>
            </div>
          );
        })}
        {extra}
      </div>

      {/*
        * WHAT CAME BACK — outside the panel, because it is a fact about the
        * list and not another control. It used to be a mono caption wedged in
        * at the far left of the toolbar, where it read as a label belonging to
        * the search box beside it rather than as the answer to "how many of
        * these do I have".
        */}
      {(catalogue || narrowed) && (
        <div className="q-result-line">
          <span className="q-result-count">
            {narrowed ? `${shown.length} of ${items.length}` : `${items.length}`}{' '}
            {items.length === 1 ? noun : `${noun}s`}
          </span>
          {narrowed && (
            <button
              type="button" className="q-btn q-btn-secondary q-btn-xs"
              onClick={() => { setSearch(''); setFacet(''); setValues([]); setOpenDims([]); }}
            >
              Clear
            </button>
          )}
        </div>
      )}

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
