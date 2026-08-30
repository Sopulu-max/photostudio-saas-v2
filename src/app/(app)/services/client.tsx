'use client';

import React from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';

import type { ServiceDimensionTag } from '@/modules/services/interface';
import { CatalogFilter } from '@/components/CatalogFilter';

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
  const active = initialServices.filter((s: any) => s.status !== 'retired');
  const retired = initialServices.filter((s: any) => s.status === 'retired');

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
  const Card = ({ svc }: { svc: any }) => {
    const tags = (svc.dimensions || []) as ServiceDimensionTag[];
    const produces = (svc.deliverables || []).map((d: any) => d.name);
    const steps = svc.workflow?.tasks?.length ?? 0;

    return (
      <Link href={`/services/${svc.id}`} className="q-card q-stack q-plain-link q-card-interactive">
        <div>
          <h3 className="q-card-title">{svc.name}</h3>
          <span className="q-eyebrow">{svc.domain?.name || 'No domain'}</span>
        </div>

        {/*
          * Label column and value column, so the values start at one edge on
          * every row of every card. These were wrapping rows of label-then-
          * value, which put each value at a different x and gave the eye
          * nothing to run down — and a grid of cards exists to be read down.
          *
          * The classifications carry their dimension now. They were a row of
          * chips with the question hidden in a title attribute, so Maternity
          * and Studio floated with nothing to say what either was an answer to.
          */}
        <dl className="q-defs">
          <dt>Produces</dt>
          <dd className={produces.length > 0 ? undefined : 'q-absent'}>
            {produces.length > 0 ? produces.join(', ') : 'Nothing set'}
          </dd>

          {tags.map((d) => (
            <React.Fragment key={d.id}>
              <dt>{d.name}</dt>
              <dd>{d.values.map((v) => v.name).join(', ')}</dd>
            </React.Fragment>
          ))}
        </dl>

        {/* How it gets done, pinned to the bottom — the same place a package
            card keeps its tasks, and the same question. */}
        <div className="q-card-foot">
          <span className={svc.workflow?.name ? 'q-meta-sm' : 'q-meta-sm q-absent'}>
            {svc.workflow?.name
              ? `${svc.workflow.name} · ${steps} ${steps === 1 ? 'step' : 'steps'}`
              : 'No workflow, so it produces no tasks'}
          </span>
        </div>
      </Link>
    );
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
              <h3 className="q-section-title">Create your first service</h3>
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
          items={active}
          noun="service"
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
          {(shown) => (
            <div className="q-grid-cards">
              {shown.map((svc: any) => <Card key={svc.id} svc={svc} />)}
            </div>
          )}
        </CatalogFilter>
      )}

      {retired.length > 0 && (
        <section style={{ marginTop: '40px' }}>
          <h2 className="q-section-title">Retired</h2>
          <p className="q-meta" style={{ marginBottom: '16px' }}>Not offered for new Packages. Packages already built from these are untouched.</p>
          <div className="q-grid-cards">
            {retired.map((svc: any) => <Card key={svc.id} svc={svc} />)}
          </div>
        </section>
      )}
    </div>
  );
}
