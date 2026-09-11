'use client';

import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';

import type { ServiceDimensionTag } from '@/modules/services/interface';
import { CatalogFilter } from '@/components/CatalogFilter';
import { Sheet, type SheetItem } from '@/components/Sheet';

/**
 * The ontology layer: what this studio actually knows how to do. Not what
 * it sells — that's Packages. A Service here is a real, persisted,
 * reusable transformation, not throwaway template content.
 */
export function ServicesClient({
  initialServices, activeFilter,
}: {
  initialServices: any[];
  activeFilter: { label: string } | null;
}) {
  /*
   * ONE LIST, GROUPED AT THE END — not two lists filtered at the start.
   *
   * Retired services used to be split off up here and rendered through a bare
   * loop below the catalogue, outside everything: the search box could not see
   * them, the classification chips could not narrow them, and the sort did not
   * reach them. A studio looking for "Album Design" and finding nothing,
   * because the service exists but is retired, is worse served than one told
   * plainly that it is retired.
   *
   * So everything goes through the same narrowing, and the split into offered
   * and retired happens on what comes out of it. Retired is a fact about a
   * service, not a different kind of thing that lives somewhere else.
   */
  const HOW_TO_ORDER = [
    { key: 'recent', label: 'Newest first',
      compare: (a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')) },
    { key: 'name', label: 'Name A–Z',
      compare: (a: any, b: any) => a.name.localeCompare(b.name) },
    { key: 'domain', label: 'By domain',
      compare: (a: any, b: any) =>
        (a.domain?.name || '').localeCompare(b.domain?.name || '') || a.name.localeCompare(b.name) },
    { key: 'work', label: 'Most steps first',
      compare: (a: any, b: any) =>
        (b.workflow?.tasks?.length ?? 0) - (a.workflow?.tasks?.length ?? 0) || a.name.localeCompare(b.name) },
  ];

  /**
   * One service, as a card.
   *
   * WHAT WAS WRONG BEYOND THE LOOK. Every card carried a line reading "No
   * blueprint attached" — blueprints became workflows in the production rework
   * and `svc.blueprint` has not existed since, so that line was permanently
   * false on every service and told the studio nothing. It now says the thing
   * that is actually true and actually matters: whether this service defines
   * how its work gets done, because without that a booking of it produces no
   * tasks and nobody can be put on the job.
   *
   * The status badge went too. Retired services already sit under their own
   * heading, so a badge reading "active" on every card in the active list is
   * noise standing where information should be.
   *
   * The whole card is the link. It used to end in a full-width secondary button
   * saying "View service" — a second thing to aim at, on a card that was
   * already the subject. Nothing inside it links any more either: nested
   * anchors are why the classifications had to be built out of spans with
   * hand-written commas and inherited colours.
   */
  /*
   * WHAT A SERVICE SAYS ABOUT ITSELF ON THE SHEET.                 (D1, D4, D7)
   *
   * The frame is its cover, or its initial. The caption is what it produces
   * and then the first classification - the two facts that tell one service
   * from the next. The figure is how much work it is: a service's equivalent
   * of a price, and frequently the only thing that differs between two
   * services producing the same deliverables. No workflow is worth seeing -
   * booking such a service puts nobody on the job - so it is the absent
   * figure, not a missing one.
   */
  const item = (svc: any): SheetItem => {
    const tags = (svc.dimensions || []) as ServiceDimensionTag[];
    const produces = (svc.deliverables || []).map((d: any) => d.name as string);
    const steps = svc.workflow?.tasks?.length ?? 0;
    const retired = svc.status === 'retired';
    return {
      id: svc.id,
      href: `/services/${svc.id}`,
      name: svc.name,
      caption: [...produces.slice(0, 2), tags[0]?.values[0]?.name ?? null].slice(0, 3),
      absent: 'Produces nothing yet',
      frame: { url: svc.cover_url, initials: (svc.name || '?').trim().charAt(0).toUpperCase() },
      figure: steps > 0
        ? { text: `${steps} ${steps === 1 ? 'step' : 'steps'}` }
        : { text: 'No workflow', none: true },
      badge: svc.domain?.name ? <span className="q-badge q-badge-neutral">{svc.domain.name}</span> : undefined,
      dim: retired,
    };
  };

  return (
    <div>
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Services</h1>
          <p className="q-page-subtitle">What this studio actually knows how to do — independent of how it&rsquo;s sold.</p>
        </div>
        <div className="q-row">
          {/* The second reading of this same list. It used to be a top-level
              destination called Lens, which made a way of looking sit among the
              things a studio owns; it is a view of what is on this page. */}
          <Link href="/services/classifications" className="q-btn q-btn-secondary">By classification</Link>
          <Link href="/services/settings" className="q-btn q-btn-secondary">Domains, deliverables &amp; workflows</Link>
          <Link href="/services/new" className="q-btn q-btn-primary">Create service</Link>
        </div>
      </header>

      {activeFilter && (
        <div className="q-row" style={{ marginBottom: '16px', alignItems: 'center' }}>
          <span className="q-meta-sm">Filtered by {activeFilter.label}</span>
          <Link href="/services" className="q-btn q-btn-secondary q-btn-xs">Clear &times;</Link>
        </div>
      )}

      {initialServices.length === 0 ? (
        <div className="q-card q-empty-lg q-stack">
          <div className="q-empty-icon"><Package size={24} /></div>
          {activeFilter ? (
            <>
              <h3 className="q-section-title">Nothing tagged this way</h3>
              <p className="q-meta">No service is currently tagged &ldquo;{activeFilter.label}&rdquo;.</p>
              <Link href="/services" className="q-btn q-btn-secondary">Clear filter</Link>
            </>
          ) : (
            <>
              <h3 className="q-section-title">No services yet</h3>
              <p className="q-meta">
                A service is a transformation — Portrait Photography, Album Design. Create one, and it becomes something
                a Package can bundle and sell.
              </p>
              <Link href="/services/new" className="q-btn q-btn-primary">Create service</Link>
            </>
          )}
        </div>
      ) : (
        /*
         * The same narrowing the packages catalogue uses, for the same reason.
         * A studio with fifty services does not scroll to find the one it
         * means; it is looking for what it does outdoors, or for maternity —
         * which is what its own dimensions say.
         */
        <CatalogFilter
          items={initialServices}
          noun="service"
          kind="catalogue"
          sorts={HOW_TO_ORDER}
          read={(svc: any) => ({
            name: svc.name,
            description: svc.description,
            facet: svc.domain?.name ?? null,
            tags: ((svc.dimensions || []) as ServiceDimensionTag[]).flatMap((d) =>
              d.values.map((v) => ({
                dimensionId: d.id, dimensionName: d.name, valueId: v.id, valueName: v.name,
              }))),
          })}
        >
          {(shown, { dense }) => {
            const offered = shown.filter((svc: any) => svc.status !== 'retired');
            const retired = shown.filter((svc: any) => svc.status === 'retired');
            return (
              <>
                <Sheet items={offered.map(item)} dense={dense} />

                {/* Below what is offered, and only when the narrowing in force
                    actually turned some up. */}
                {retired.length > 0 && (
                  <section className={offered.length > 0 ? 'q-section-gap' : undefined}>
                    <h2 className="q-section-title">Retired</h2>
                    <p className="q-meta" style={{ marginBottom: '16px' }}>
                      Not offered for new packages. Packages already built from these are untouched.
                    </p>
                    <Sheet items={retired.map(item)} dense={dense} />
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
