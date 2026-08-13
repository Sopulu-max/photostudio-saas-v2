'use client';

import React, { useState } from 'react';
import { templatesByDomain } from '@/modules/services/interface';
import type { ServiceTemplate } from '@/modules/services/interface';
import { ServiceFieldsEditor } from '../[id]/ServiceFieldsEditor';
import { createService } from '@/modules/services/interface';
import type { Narrowed, DimensionSuggestions, StudioDimensionShape } from '@/modules/services/interface';
import { TEMPLATE_DIMENSION_NAMES } from '@/modules/services/interface';


/**
 * Templates are a fast path, not a gate: picking one pre-fills the same
 * editor a studio would use to edit any Service afterward, and everything
 * it suggests stays fully editable. When none of the curated starting
 * points match — a discipline this studio does that isn't in the library —
 * "Create a custom service" opens the identical editor with nothing filled
 * in. The Service's shape (Domain, Deliverables, Blueprint, and whatever the
 * domain classifies by) is the same either way; only the starting values
 * differ. That's not a blank canvas in the no-code-builder
 * sense — it's Progressive Enrichment: an entity has to be creatable with
 * minimal data, not just with a curated one.
 */
export function TemplatePicker({
  domainOptions,
  serviceSuggestions,
  deliverableSuggestions,
  dimensionSuggestions,
  outputTypesByDomain,
  dimensionsByDomain,
}: {
  domainOptions: string[];
  serviceSuggestions: Record<string, string[]>;
  deliverableSuggestions: Narrowed;
  dimensionSuggestions: DimensionSuggestions;
  outputTypesByDomain: Record<string, { id: string; name: string }[]>;
  dimensionsByDomain: Record<string, StudioDimensionShape[]>;
}) {
  const [chosen, setChosen] = useState<ServiceTemplate | null>(null);
  const [custom, setCustom] = useState(false);
  const groups = templatesByDomain();

  const pick = async (t: ServiceTemplate) => {
    setChosen(t);
  };

  if (custom) {
    return (
      <div className="q-page-narrow">
        <button className="q-back" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setCustom(false)}>
          &larr; Choose a different starting point
        </button>
        <header className="q-page-header">
          <div>
            <h1 className="q-page-title">New service</h1>
            <p className="q-page-subtitle">Nothing filled in for you — start entirely from your own words.</p>
          </div>
        </header>
        <ServiceFieldsEditor
          mode="create"
          domainOptions={domainOptions}
          serviceSuggestions={serviceSuggestions}
          deliverableSuggestions={deliverableSuggestions}
          dimensionSuggestions={dimensionSuggestions}
          outputTypesByDomain={outputTypesByDomain}
          dimensionsByDomain={dimensionsByDomain}
          initial={{}}
        />
      </div>
    );
  }

  if (chosen) {
    return (
      <div className="q-page-narrow">
        <button className="q-back" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => { setChosen(null); }}>
          &larr; Choose a different starting point
        </button>
        <header className="q-page-header">
          <div>
            <h1 className="q-page-title">{chosen.domain} · {chosen.name}</h1>
            <p className="q-page-subtitle">Everything below is a starting point — change anything before creating it.</p>
          </div>
        </header>
        <ServiceFieldsEditor
          mode="create"
          domainOptions={domainOptions}
          serviceSuggestions={serviceSuggestions}
          deliverableSuggestions={deliverableSuggestions}
          dimensionSuggestions={dimensionSuggestions}
          outputTypesByDomain={outputTypesByDomain}
          dimensionsByDomain={dimensionsByDomain}
          initial={{
            name: chosen.name,
            description: chosen.summary,
            serviceDomain: chosen.domain,
            primaryDeliverable: chosen.deliverables?.[0] || null,
            deliverables: chosen.deliverables,
            // The service arrives knowing what may vary about it, so a package
            // built from it can fix outfits or coverage without hand-entry.
            variables: chosen.variables || [],
            // The library speaks the five names it ships with; the editor
            // matches them against whatever the domain actually asks, by name.
            dimensions: Object.entries(TEMPLATE_DIMENSION_NAMES)
              .map(([templateKey, dimensionName]) => ({
                name: dimensionName,
                values: ((chosen as any)[templateKey] as string[] | undefined) || [],
              }))
              .filter((d) => d.values.length > 0),
          }}
        />
      </div>
    );
  }

  return (
    <div className="q-page-narrow">
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Start a new service</h1>
          <p className="q-page-subtitle">Pick the closest starting point — everything about it is yours to change.</p>
        </div>
        <button className="q-btn q-btn-secondary" onClick={() => setCustom(true)}>None of these — create a custom service</button>
      </header>
      <div className="q-stack q-stack-lg">
        {groups.map(({ domain, templates }) => (
          <section key={domain}>
            <h2 className="q-section-title">{domain}</h2>
            <div className="q-grid-cards">
              {templates.map((t) => (
                <button key={t.id} className="q-card q-stack" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--q-color-ink-100)' }} onClick={() => pick(t)}>
                  <strong className="q-strong">{t.name}</strong>
                  <p className="q-meta" style={{ margin: 0 }}>{t.summary}</p>
                  <span className="q-meta-sm">Produces: {t.deliverables.join(', ')}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
