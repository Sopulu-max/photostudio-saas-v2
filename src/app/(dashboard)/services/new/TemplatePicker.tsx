'use client';

import React, { useState } from 'react';
import { templatesByDomain } from '@/modules/services/interface';
import type { ServiceTemplate } from '@/modules/services/interface';
import { ServiceFieldsEditor } from '../[id]/ServiceFieldsEditor';
import { createBlueprint } from '@/modules/services/interface';
import type { Dimension, DeliverableSuggestions, DimensionSuggestions } from '@/modules/services/interface';

type Blueprint = { id: string; name: string };

/**
 * Templates are a fast path, not a gate: picking one pre-fills the same
 * editor a studio would use to edit any Service afterward, and everything
 * it suggests stays fully editable. When none of the curated starting
 * points match — a discipline this studio does that isn't in the library —
 * "Create a custom service" opens the identical editor with nothing filled
 * in. The Service's shape (Domain, Deliverables, Blueprint, the five
 * dimensions) stays the same closed, bounded set either way; only the
 * starting values differ. That's not a blank canvas in the no-code-builder
 * sense — it's Progressive Enrichment: an entity has to be creatable with
 * minimal data, not just with a curated one.
 */
export function TemplatePicker({
  blueprints,
  domainOptions,
  deliverableOptions,
  enabledDimensions,
  occasionOptions,
  contextOptions,
  subjectOptions,
  purposeOptions,
  clientTypeOptions,
  deliverableSuggestionsByDomain,
  dimensionSuggestionsByDomain,
}: {
  blueprints: Blueprint[];
  domainOptions: string[];
  deliverableOptions: string[];
  enabledDimensions: Dimension[];
  occasionOptions: string[];
  contextOptions: string[];
  subjectOptions: string[];
  purposeOptions: string[];
  clientTypeOptions: string[];
  deliverableSuggestionsByDomain: DeliverableSuggestions;
  dimensionSuggestionsByDomain: DimensionSuggestions;
}) {
  const [chosen, setChosen] = useState<ServiceTemplate | null>(null);
  const [custom, setCustom] = useState(false);
  const [resolvedBlueprintId, setResolvedBlueprintId] = useState<string | null | undefined>(undefined);
  const groups = templatesByDomain();

  const pick = async (t: ServiceTemplate) => {
    setChosen(t);
    if (t.blueprint) {
      const existing = blueprints.find((b) => b.name === t.blueprint!.name);
      if (existing) { setResolvedBlueprintId(existing.id); return; }
      try {
        const { blueprintId } = await createBlueprint({
          name: t.blueprint.name,
          stages: t.blueprint.stages.map((s) => ({ name: s.name, roleName: s.roleName || null, frontStage: s.frontStage })),
        });
        setResolvedBlueprintId(blueprintId);
      } catch {
        setResolvedBlueprintId(null);
      }
    } else {
      setResolvedBlueprintId(null);
    }
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
          blueprints={blueprints}
          domainOptions={domainOptions}
          deliverableOptions={deliverableOptions}
          enabledDimensions={enabledDimensions}
          occasionOptions={occasionOptions}
          contextOptions={contextOptions}
          subjectOptions={subjectOptions}
          purposeOptions={purposeOptions}
          clientTypeOptions={clientTypeOptions}
          deliverableSuggestionsByDomain={deliverableSuggestionsByDomain}
          dimensionSuggestionsByDomain={dimensionSuggestionsByDomain}
          initial={{}}
        />
      </div>
    );
  }

  if (chosen) {
    // Wait for the suggested blueprint to actually resolve (found or created)
    // before mounting the editor — its blueprint selection is only set from
    // this once, on mount, so mounting early would show it as unset.
    if (resolvedBlueprintId === undefined) {
      return <div className="q-page-narrow"><p className="q-meta">Setting up…</p></div>;
    }
    return (
      <div className="q-page-narrow">
        <button className="q-back" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => { setChosen(null); setResolvedBlueprintId(undefined); }}>
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
          blueprints={resolvedBlueprintId && !blueprints.find((b) => b.id === resolvedBlueprintId) ? [...blueprints, { id: resolvedBlueprintId, name: chosen.blueprint?.name || '' }] : blueprints}
          domainOptions={domainOptions}
          deliverableOptions={deliverableOptions}
          enabledDimensions={enabledDimensions}
          occasionOptions={occasionOptions}
          contextOptions={contextOptions}
          subjectOptions={subjectOptions}
          purposeOptions={purposeOptions}
          clientTypeOptions={clientTypeOptions}
          deliverableSuggestionsByDomain={deliverableSuggestionsByDomain}
          dimensionSuggestionsByDomain={dimensionSuggestionsByDomain}
          initial={{
            name: chosen.name,
            description: chosen.summary,
            serviceDomain: chosen.domain,
            blueprintId: resolvedBlueprintId || null,
            deliverables: chosen.primaryDeliverables,
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
                  <span className="q-meta-sm">Produces: {t.primaryDeliverables.join(', ')}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
