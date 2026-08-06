'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createService, updateService, setServiceStatus, duplicateService, templatesByDomain } from '@/modules/services/interface';
import type { Dimension, DeliverableSuggestions, DimensionSuggestions } from '@/modules/services/interface';

type Blueprint = { id: string; name: string };

/**
 * A Service is what the studio actually knows how to do — the ontology
 * layer. Name, which Service Domain it belongs to, the Process (Blueprint)
 * that carries it out, and what it directly produces (Deliverables). Not a
 * commercial thing: no price, no payment terms, no intake questions — those
 * belong to a Package built from this Service.
 */
export function ServiceFieldsEditor({
  mode,
  serviceId,
  status,
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
  initial,
}: {
  mode: 'create' | 'edit';
  serviceId?: string;
  status?: string;
  blueprints: Blueprint[];
  domainOptions: string[];
  deliverableOptions: string[];
  /** Which of the five possible dimensions this studio has chosen to organize by — only these render. */
  enabledDimensions: Dimension[];
  occasionOptions: string[];
  contextOptions: string[];
  subjectOptions: string[];
  purposeOptions: string[];
  clientTypeOptions: string[];
  /** What this studio already produces per Domain (plus curated fallback) — the form morphs its deliverable suggestions to whichever Domain is typed. */
  deliverableSuggestionsByDomain: DeliverableSuggestions;
  /** Same, per classification dimension — picking a Domain reorganizes Subject/Occasion/Context/Purpose/Client suggestions too, not just deliverables. */
  dimensionSuggestionsByDomain: DimensionSuggestions;
  initial: {
    name?: string;
    description?: string | null;
    serviceDomain?: string;
    blueprintId?: string | null;
    deliverables?: string[];
    occasion?: string;
    context?: string;
    subject?: string;
    purpose?: string;
    clientType?: string;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [domain, setDomain] = useState(initial.serviceDomain ?? '');
  const [blueprintId, setBlueprintId] = useState(initial.blueprintId ?? '');
  const [deliverables, setDeliverables] = useState<string[]>(initial.deliverables || []);
  const [newDeliverable, setNewDeliverable] = useState('');
  const [occasion, setOccasion] = useState(initial.occasion ?? '');
  const [context, setContext] = useState(initial.context ?? '');
  const [subject, setSubject] = useState(initial.subject ?? '');
  const [purpose, setPurpose] = useState(initial.purpose ?? '');
  const [clientType, setClientType] = useState(initial.clientType ?? '');

  // The Service Domain someone's typed changes what renders here, not just
  // what gets stored: the deliverable quick-suggestions are this studio's
  // own accumulated vocabulary for that Domain (grown from other Services
  // it already has), enriched with the curated template defaults so a
  // brand-new Domain still suggests something. Case-insensitive since the
  // Domain field is free text.
  const domainKey = Object.keys(deliverableSuggestionsByDomain).find((k) => k.toLowerCase() === domain.trim().toLowerCase());
  const suggestedDeliverables = (domainKey ? deliverableSuggestionsByDomain[domainKey] : []).filter((d) => !deliverables.includes(d));

  // Same reorganization for the five classification dimensions — a value
  // already set is excluded from its own suggestion row (nothing to suggest
  // re-picking).
  const dimSuggestions = (dim: Dimension, current: string): string[] => {
    const byDomain = dimensionSuggestionsByDomain[dim] || {};
    const key = Object.keys(byDomain).find((k) => k.toLowerCase() === domain.trim().toLowerCase());
    return (key ? byDomain[key] : []).filter((v) => v !== current.trim());
  };

  // The Blueprint list reorganizes the same way: whichever blueprints trace
  // back to a template in this Domain surface first, under their own group,
  // rather than sitting flat in the full list regardless of what's typed.
  const domainBlueprintNames = new Set(
    templatesByDomain().find((g) => g.domain.toLowerCase() === domain.trim().toLowerCase())?.templates
      .map((t) => t.blueprint?.name).filter((n): n is string => !!n) || []
  );
  const domainBlueprints = blueprints.filter((b) => domainBlueprintNames.has(b.name));
  const otherBlueprints = blueprints.filter((b) => !domainBlueprintNames.has(b.name));

  const addDeliverableValue = (d: string) => { if (d && !deliverables.includes(d)) setDeliverables((ds) => [...ds, d]); };
  const addDeliverable = () => { addDeliverableValue(newDeliverable.trim()); setNewDeliverable(''); };
  const removeDeliverable = (d: string) => setDeliverables((ds) => ds.filter((x) => x !== d));

  const buildPayload = () => ({
    name: name.trim(),
    description: description.trim() || null,
    serviceDomain: domain.trim() || null,
    blueprintId: blueprintId || null,
    deliverables,
    occasion: occasion.trim() || null,
    context: context.trim() || null,
    subject: subject.trim() || null,
    purpose: purpose.trim() || null,
    clientType: clientType.trim() || null,
  });

  const submit = () => {
    if (!name.trim()) { alert('A service needs a name.'); return; }
    if (mode === 'edit' && serviceId) {
      startTransition(async () => {
        try { await updateService({ serviceId, ...buildPayload() }); router.refresh(); }
        catch (e: any) { alert(e?.message || 'Something went wrong.'); }
      });
    }
  };

  const submitCreate = () => {
    if (!name.trim()) { alert('A service needs a name.'); return; }
    startTransition(async () => {
      try {
        const { serviceId: newId } = await createService(buildPayload());
        router.push(`/services/${newId}`);
      } catch (e: any) {
        alert(e?.message || 'Failed to create the service.');
      }
    });
  };

  const retired = status === 'retired';

  return (
    <div className="q-stack q-stack-lg">
      <div className="q-card q-section">
        <h2 className="q-section-title">What it is</h2>
        <div className="q-stack q-stack-md">
          <div className="q-field">
            <label className="q-label">Name</label>
            <input className="q-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Portrait Photography" />
          </div>
          <div className="q-field">
            <label className="q-label">Description</label>
            <textarea className="q-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this transformation is, in general." />
          </div>
          <div className="q-field">
            <label className="q-label">Service Domain</label>
            <input className="q-input" list="domain-options" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. Photography" />
            <datalist id="domain-options">{domainOptions.map((d) => <option key={d} value={d} />)}</datalist>
            <span className="q-meta-sm">The broad capability this belongs to — the strongest, but not the only, way to classify it.</span>
          </div>
          {(enabledDimensions.length > 0) && (
            <div className="q-grid-3">
              {enabledDimensions.includes('subject') && (
                <div className="q-field">
                  <label className="q-label">Subject</label>
                  <input className="q-input" list="service-subject-options" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Real Estate" />
                  <datalist id="service-subject-options">{subjectOptions.map((o) => <option key={o} value={o} />)}</datalist>
                  {dimSuggestions('subject', subject).length > 0 && (
                    <div className="q-row" style={{ flexWrap: 'wrap', marginTop: '6px' }}>
                      {dimSuggestions('subject', subject).map((v) => (
                        <button key={v} type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => setSubject(v)}>{v}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {enabledDimensions.includes('occasion') && (
                <div className="q-field">
                  <label className="q-label">Occasion</label>
                  <input className="q-input" list="service-occasion-options" value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="e.g. Wedding" />
                  <datalist id="service-occasion-options">{occasionOptions.map((o) => <option key={o} value={o} />)}</datalist>
                  {dimSuggestions('occasion', occasion).length > 0 && (
                    <div className="q-row" style={{ flexWrap: 'wrap', marginTop: '6px' }}>
                      {dimSuggestions('occasion', occasion).map((v) => (
                        <button key={v} type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => setOccasion(v)}>{v}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {enabledDimensions.includes('context') && (
                <div className="q-field">
                  <label className="q-label">Context</label>
                  <input className="q-input" list="service-context-options" value={context} onChange={(e) => setContext(e.target.value)} placeholder="e.g. On-location" />
                  <datalist id="service-context-options">{contextOptions.map((o) => <option key={o} value={o} />)}</datalist>
                  {dimSuggestions('context', context).length > 0 && (
                    <div className="q-row" style={{ flexWrap: 'wrap', marginTop: '6px' }}>
                      {dimSuggestions('context', context).map((v) => (
                        <button key={v} type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => setContext(v)}>{v}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {enabledDimensions.includes('purpose') && (
                <div className="q-field">
                  <label className="q-label">Purpose</label>
                  <input className="q-input" list="service-purpose-options" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Advertising" />
                  <datalist id="service-purpose-options">{purposeOptions.map((o) => <option key={o} value={o} />)}</datalist>
                  {dimSuggestions('purpose', purpose).length > 0 && (
                    <div className="q-row" style={{ flexWrap: 'wrap', marginTop: '6px' }}>
                      {dimSuggestions('purpose', purpose).map((v) => (
                        <button key={v} type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => setPurpose(v)}>{v}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {enabledDimensions.includes('client') && (
                <div className="q-field">
                  <label className="q-label">Client</label>
                  <input className="q-input" list="service-client-options" value={clientType} onChange={(e) => setClientType(e.target.value)} placeholder="e.g. Corporate" />
                  <datalist id="service-client-options">{clientTypeOptions.map((o) => <option key={o} value={o} />)}</datalist>
                  {dimSuggestions('client', clientType).length > 0 && (
                    <div className="q-row" style={{ flexWrap: 'wrap', marginTop: '6px' }}>
                      {dimSuggestions('client', clientType).map((v) => (
                        <button key={v} type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => setClientType(v)}>{v}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">Primary deliverables</h2>
        <p className="q-meta" style={{ marginBottom: '12px' }}>What this service directly produces — RAW images, edited photographs, edited video.</p>
        <div className="q-row" style={{ flexWrap: 'wrap' }}>
          {deliverables.map((d) => (
            <span key={d} className="q-badge q-badge-neutral">
              {d} <button className="q-btn-ghost" style={{ padding: '0 0 0 6px' }} onClick={() => removeDeliverable(d)}>×</button>
            </span>
          ))}
        </div>
        <div className="q-row" style={{ marginTop: '8px' }}>
          <input className="q-input" list="deliverable-options" value={newDeliverable} onChange={(e) => setNewDeliverable(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDeliverable(); } }}
            placeholder="e.g. Edited photographs" style={{ minWidth: '12rem' }} />
          <datalist id="deliverable-options">{deliverableOptions.map((d) => <option key={d} value={d} />)}</datalist>
          <button className="q-btn q-btn-secondary q-btn-xs" onClick={addDeliverable}>+ Add</button>
        </div>
        {domain.trim() && suggestedDeliverables.length > 0 && (
          <div className="q-row" style={{ flexWrap: 'wrap', marginTop: '8px', alignItems: 'center' }}>
            <span className="q-meta-sm">Common for {domain.trim()}:</span>
            {suggestedDeliverables.map((d) => (
              <button key={d} type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => addDeliverableValue(d)}>+ {d}</button>
            ))}
          </div>
        )}
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">Process</h2>
        <div className="q-field">
          <label className="q-label">Blueprint</label>
          <select className="q-select" value={blueprintId} onChange={(e) => setBlueprintId(e.target.value)}>
            <option value="">No blueprint — work starts from a single stage</option>
            {domain.trim() && domainBlueprints.length > 0 ? (
              <>
                <optgroup label={`Common for ${domain.trim()}`}>
                  {domainBlueprints.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </optgroup>
                {otherBlueprints.length > 0 && (
                  <optgroup label="Other blueprints">
                    {otherBlueprints.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </optgroup>
                )}
              </>
            ) : (
              blueprints.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)
            )}
          </select>
          <span className="q-meta-sm">How this transformation is carried out. Manage blueprints on the Services settings page.</span>
        </div>
      </div>

      <div className="q-row">
        {mode === 'create' ? (
          <button className="q-btn q-btn-primary" disabled={isPending} onClick={submitCreate}>{isPending ? 'Creating…' : 'Create service'}</button>
        ) : (
          <>
            <button className="q-btn q-btn-primary" disabled={isPending} onClick={submit}>{isPending ? 'Saving…' : 'Save changes'}</button>
            <button className="q-btn q-btn-secondary" disabled={isPending}
              onClick={() => startTransition(async () => {
                try { const { serviceId: copyId } = await duplicateService(serviceId!); router.push(`/services/${copyId}`); }
                catch (e: any) { alert(e?.message || 'Failed to duplicate the service.'); }
              })}>
              Duplicate
            </button>
            <span className="q-spacer" />
            <button className="q-btn q-btn-secondary" disabled={isPending}
              onClick={() => startTransition(async () => {
                try { await setServiceStatus({ serviceId: serviceId!, status: retired ? 'active' : 'retired' }); router.refresh(); }
                catch (e: any) { alert(e?.message || 'Something went wrong.'); }
              })}>
              {retired ? 'Make available again' : 'Retire this service'}
            </button>
          </>
        )}
      </div>
      {mode === 'edit' && (
        retired ? (
          <div className="q-note q-note-warn"><span className="q-meta-plain">Retired — it won&rsquo;t appear when bundling a new Package.</span></div>
        ) : (
          <span className="q-meta-sm">Retiring hides it from new Packages. Packages already built from it are untouched — nothing is deleted.</span>
        )
      )}
    </div>
  );
}
