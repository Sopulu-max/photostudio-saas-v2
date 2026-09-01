'use client';

import Link from 'next/link';
import { CatalogFilter } from '@/components/CatalogFilter';
import type { ValueEntry } from '@/modules/services/interface';

/**
 * The studio's vocabulary, narrowed by the studio's vocabulary.
 *
 * WHY THIS IS NOT A SECOND FILTER. The page was a triple `.map()` — domain,
 * then classification, then every value as a badge — with nothing above it. At
 * nine values that reads fine, which is why it survived; at six domains asking
 * eight questions with a dozen answers each it is a wall of three hundred
 * badges and the only way through is Ctrl-F. So it gets the same instrument
 * every other catalogue in the app got, rather than a bespoke one.
 *
 * WHAT A VALUE'S FACETS ACTUALLY ARE, which is the part worth getting right.
 * CatalogFilter narrows things by the classifications they CARRY. A value does
 * not carry a classification — it IS an answer to one, so tagging it with
 * itself would draw a chip per badge and narrow a list of nine to a list of
 * one. The two questions genuinely worth asking OF a value are which question
 * it answers, and whether anything answers with it. Those are its facets.
 *
 * AND THE SECOND ONE IS THE POINT. The page already knew which values nothing
 * carries — it coloured them differently — but the knowledge was inert: you
 * could see there was unused vocabulary and had no way to gather it. Unused
 * vocabulary is the one actionable thing on this screen. A studio that wrote
 * down Burial and never classified a service by it either has work it is not
 * describing or a word it should drop, and both are worth knowing.
 *
 * The grouping survives the narrowing. Results are regrouped into domain →
 * classification on the way out, because that hierarchy is the ontology's and
 * not a display choice — a value belongs to exactly one classification of
 * exactly one domain, and a flat list of matches would say otherwise.
 */
export function ClassificationIndex({ entries }: { entries: ValueEntry[] }) {
  return (
    <CatalogFilter
      items={entries}
      /* The word the settings page already uses for these — "Add a value",
         "No values yet". Calling them classification values here would put the
         word twice in one placeholder: "search classification values by name,
         domain, classification". */
      noun="value"
      facetLabel="domain"
      kind="catalogue"
      /* Both views draw the same badges, so offering the switch would offer a
         control that cannot change anything. */
      views={false}
      sorts={[
        { key: 'name', label: 'A–Z', compare: (a, b) => a.name.localeCompare(b.name) },
        {
          key: 'most',
          label: 'Most used',
          compare: (a, b) =>
            b.servicesIncludingNarrower - a.servicesIncludingNarrower || a.name.localeCompare(b.name),
        },
        {
          key: 'least',
          label: 'Least used',
          compare: (a, b) =>
            a.servicesIncludingNarrower - b.servicesIncludingNarrower || a.name.localeCompare(b.name),
        },
      ]}
      read={(e) => ({
        name: e.name,
        facet: e.domainName,
        tags: [
          {
            dimensionId: 'classification',
            dimensionName: 'Classification',
            valueId: e.dimensionId,
            valueName: e.dimensionName,
          },
          /*
           * A derived facet, not a stored one — which is the only kind this
           * page is allowed. It reads the same count the badge does, so the
           * chip and the colour can never disagree.
           */
          {
            dimensionId: 'use',
            dimensionName: 'In use',
            valueId: e.servicesIncludingNarrower > 0 ? 'used' : 'unused',
            valueName: e.servicesIncludingNarrower > 0 ? 'Carried by a service' : 'Not used yet',
          },
        ],
      })}
    >
      {(shown, { narrowed }) => {
        if (shown.length === 0) {
          return (
            <p className="q-empty">
              No classification value matches that. Clear the filters to see the studio&rsquo;s whole
              vocabulary.
            </p>
          );
        }

        // Domain → classification → values, which is the shape the graph has.
        const byDomain = new Map<string, Map<string, ValueEntry[]>>();
        for (const e of shown) {
          const domain = e.domainName || 'Unfiled';
          if (!byDomain.has(domain)) byDomain.set(domain, new Map());
          const dims = byDomain.get(domain)!;
          if (!dims.has(e.dimensionName)) dims.set(e.dimensionName, []);
          dims.get(e.dimensionName)!.push(e);
        }

        return (
          <div className="q-stack q-stack-lg">
            {[...byDomain.entries()].map(([domain, dims]) => (
              <section key={domain}>
                <h2 className="q-section-title">{domain}</h2>
                <div className="q-stack q-stack-md" style={{ marginTop: '12px' }}>
                  {[...dims.entries()].map(([dimension, values]) => (
                    <div key={dimension} className="q-tile q-stack q-stack-sm">
                      <strong className="q-strong">{dimension}</strong>
                      <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                        {values.map((v) => (
                          <Link
                            key={v.id}
                            href={`/services/classifications/${v.id}`}
                            className={`q-badge ${v.servicesIncludingNarrower > 0 ? 'q-badge-success' : 'q-badge-neutral'}`}
                            title={
                              v.servicesIncludingNarrower === 0
                                ? `No services classified as ${v.name}`
                                : v.servicesIncludingNarrower === v.services
                                  ? `${v.services} service${v.services === 1 ? '' : 's'} classified as ${v.name}`
                                  : `${v.services} classified as ${v.name}, ${v.servicesIncludingNarrower} including narrower values`
                            }
                          >
                            {/* A value nested inside another is shown as such, so
                                the list reads as the tree the studio built. */}
                            {v.parentId && <span style={{ opacity: 0.5, marginRight: '4px' }}>&#8627;</span>}
                            {v.name}
                            {/*
                              * ALWAYS THE NUMBER, INCLUDING ZERO.
                              *
                              * This was hidden when it was nought, which left
                              * grey as the only thing saying a value is unused
                              * — carried by colour alone, with the explanation
                              * in a title attribute no keyboard and no phone
                              * ever reaches. A zero says it in the one place
                              * everyone is already looking.
                              */}
                            <span style={{ marginLeft: '6px', opacity: 0.7 }}>
                              {v.servicesIncludingNarrower}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {narrowed && (
              <p className="q-meta-sm">
                Grouped by domain and classification, as the studio defined them.
              </p>
            )}
          </div>
        );
      }}
    </CatalogFilter>
  );
}
