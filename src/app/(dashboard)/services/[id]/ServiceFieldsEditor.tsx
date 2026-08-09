'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createService, updateService, setServiceStatus, duplicateService } from '@/modules/services/interface';
import type { Dimension, DeliverableSuggestions, DimensionSuggestions } from '@/modules/services/interface';

/**
 * A Service is what the studio actually knows how to do — the ontology
 * layer. Name, which Service Domain it belongs to, its inputs and deliverables.
 * Not a commercial thing: no price, no payment terms, no intake questions — those
 * belong to a Package built from this Service.
 */
export function ServiceFieldsEditor({
  mode,
  serviceId,
  status,
  domainOptions,
  outputOptions,
  enabledDimensions,
  occasionOptions,
  contextOptions,
  subjectOptions,
  purposeOptions,
  clientTypeOptions,
  outputSuggestionsByDomain,
  dimensionSuggestionsByDomain,
  initial,
}: {
  mode: 'create' | 'edit';
  serviceId?: string;
  status?: string;
  domainOptions: string[];
  outputOptions: string[];
  /** Which of the five possible dimensions this studio has chosen to organize by — only these render. */
  enabledDimensions: Dimension[];
  occasionOptions: string[];
  contextOptions: string[];
  subjectOptions: string[];
  purposeOptions: string[];
  clientTypeOptions: string[];
  /** What this studio already produces per Domain (plus curated fallback) — the form morphs its output suggestions to whichever Domain is typed. */
  outputSuggestionsByDomain: DeliverableSuggestions;
  /** Same, per classification dimension — picking a Domain reorganizes Subject/Occasion/Context/Purpose/Client suggestions too. */
  dimensionSuggestionsByDomain: DimensionSuggestions;
  initial: {
    name?: string;
    description?: string | null;
    serviceDomain?: string;
    requiredInputDeliverable?: string | null;
    primaryDeliverable?: string | null;
    deliverables?: string[];
    occasions?: string[];
    contexts?: string[];
    subjects?: string[];
    purposes?: string[];
    clientTypes?: string[];
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [domain, setDomain] = useState(initial.serviceDomain ?? '');
  
  const [requiredInputDeliverable, setRequiredInputType] = useState(initial.requiredInputDeliverable ?? '');
  const [primaryDeliverable, setPrimaryOutputType] = useState(initial.primaryDeliverable ?? '');
  const [deliverables, setDeliverables] = useState<string[]>(initial.deliverables || []);
  const [newOutput, setNewOutput] = useState('');

  // Configuration schemas (arrays)
  const [occasions, setOccasions] = useState<string[]>(initial.occasions || []);
  const [newOccasion, setNewOccasion] = useState('');
  
  const [contexts, setContexts] = useState<string[]>(initial.contexts || []);
  const [newContext, setNewContext] = useState('');
  
  const [subjects, setSubjects] = useState<string[]>(initial.subjects || []);
  const [newSubject, setNewSubject] = useState('');
  
  const [purposes, setPurposes] = useState<string[]>(initial.purposes || []);
  const [newPurpose, setNewPurpose] = useState('');
  
  const [clientTypes, setClientTypes] = useState<string[]>(initial.clientTypes || []);
  const [newClientType, setNewClientType] = useState('');

  // The Service Domain someone's typed changes what renders here, not just
  // what gets stored: the output quick-suggestions are this studio's
  // own accumulated vocabulary for that Domain.
  const domainKey = Object.keys(outputSuggestionsByDomain).find((k) => k.toLowerCase() === domain.trim().toLowerCase());
  const suggestedDeliverables = (domainKey ? outputSuggestionsByDomain[domainKey] : []).filter((d) => !deliverables.includes(d) && d !== primaryDeliverable);

  // Same reorganization for the five classification dimensions.
  const dimSuggestions = (dim: Dimension, current: string[]): string[] => {
    const byDomain = dimensionSuggestionsByDomain[dim] || {};
    const key = Object.keys(byDomain).find((k) => k.toLowerCase() === domain.trim().toLowerCase());
    return (key ? byDomain[key] : []).filter((v) => !current.includes(v));
  };

  const addDeliverableValue = (d: string) => { if (d && !deliverables.includes(d) && d !== primaryDeliverable) setDeliverables((ds) => [...ds, d]); };
  const addDeliverable = () => { addDeliverableValue(newOutput.trim()); setNewOutput(''); };
  const removeDeliverable = (d: string) => setDeliverables((ds) => ds.filter((x) => x !== d));

  const buildPayload = () => ({
    name: name.trim(),
    description: description.trim() || null,
    serviceDomain: domain.trim() || null,
    requiredInputDeliverable: requiredInputDeliverable.trim() || null,
    primaryDeliverable: primaryDeliverable.trim() || null,
    deliverables,
    occasions,
    contexts,
    subjects,
    purposes,
    clientTypes,
  });

  const submit = () => {
    if (!name.trim()) { alert('A service needs a name.'); return; }
    if (mode === 'edit' && serviceId) {
      startTransition(async () => {
        try { 
          await updateService({ serviceId, ...buildPayload() }); 
          router.refresh(); 
          router.push(`/services/${serviceId}`);
        }
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

  const renderMultiDim = (
    label: string, 
    items: string[], 
    setItems: React.Dispatch<React.SetStateAction<string[]>>, 
    newItem: string, 
    setNewItem: React.Dispatch<React.SetStateAction<string>>, 
    options: string[], 
    suggestions: string[]
  ) => {
    const addItemValue = (v: string) => { if (v && !items.includes(v)) setItems(prev => [...prev, v]); };
    const addItem = () => { addItemValue(newItem.trim()); setNewItem(''); };
    return (
      <div className="q-field">
        <label className="q-label">{label}</label>
        <div className="q-row" style={{ flexWrap: 'wrap', marginBottom: items.length > 0 ? '8px' : '0' }}>
          {items.map((item) => (
            <span key={item} className="q-badge q-badge-neutral">
              {item} <button className="q-btn-ghost" style={{ padding: '0 0 0 6px' }} onClick={() => setItems(prev => prev.filter(x => x !== item))}>×</button>
            </span>
          ))}
        </div>
        <div className="q-row">
          <input className="q-input" list={`options-${label}`} value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} placeholder={`e.g. ${options[0] || '...'}`} />
          <datalist id={`options-${label}`}>{options.map(o => <option key={o} value={o} />)}</datalist>
          <button className="q-btn q-btn-secondary q-btn-xs" onClick={addItem}>+ Add</button>
        </div>
        {suggestions.length > 0 && (
          <div className="q-row" style={{ flexWrap: 'wrap', marginTop: '6px' }}>
            {suggestions.map((v) => (
              <button key={v} type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => addItemValue(v)}>+ {v}</button>
            ))}
          </div>
        )}
      </div>
    );
  };

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
            <div className="q-grid-2">
              {enabledDimensions.includes('subject') && renderMultiDim('Subjects', subjects, setSubjects, newSubject, setNewSubject, subjectOptions, dimSuggestions('subject', subjects))}
              {enabledDimensions.includes('occasion') && renderMultiDim('Occasions', occasions, setOccasions, newOccasion, setNewOccasion, occasionOptions, dimSuggestions('occasion', occasions))}
              {enabledDimensions.includes('context') && renderMultiDim('Contexts', contexts, setContexts, newContext, setNewContext, contextOptions, dimSuggestions('context', contexts))}
              {enabledDimensions.includes('purpose') && renderMultiDim('Purposes', purposes, setPurposes, newPurpose, setNewPurpose, purposeOptions, dimSuggestions('purpose', purposes))}
              {enabledDimensions.includes('client') && renderMultiDim('Client Types', clientTypes, setClientTypes, newClientType, setNewClientType, clientTypeOptions, dimSuggestions('client', clientTypes))}
            </div>
          )}
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">Inputs & Deliverables</h2>
        <p className="q-meta" style={{ marginBottom: '12px' }}>What this service requires to start, and what it produces at the end.</p>
        
        <div className="q-stack q-stack-md">
          <div className="q-field">
            <label className="q-label">Required Input Type</label>
            <input className="q-input" list="input-options" value={requiredInputDeliverable} onChange={(e) => setRequiredInputType(e.target.value)} placeholder="e.g. RAW Images (leave blank if none required)" />
            <datalist id="input-options">{outputOptions.map((d) => <option key={d} value={d} />)}</datalist>
            <span className="q-meta-sm">Does this service depend on the output of a previous service? (e.g. Photo Editing requires RAW Images)</span>
          </div>
          
          <div className="q-field">
            <label className="q-label">Primary Output Type</label>
            <input className="q-input" list="output-options" value={primaryDeliverable} onChange={(e) => setPrimaryOutputType(e.target.value)} placeholder="e.g. Edited photographs" />
            <span className="q-meta-sm">The main asset this service produces. (e.g. Photography produces RAW images)</span>
          </div>
        </div>

        <div style={{ marginTop: '24px' }}>
          <label className="q-label">Additional Deliverables</label>
          <div className="q-row" style={{ flexWrap: 'wrap' }}>
            {deliverables.map((d) => (
              <span key={d} className="q-badge q-badge-neutral">
                {d} <button className="q-btn-ghost" style={{ padding: '0 0 0 6px' }} onClick={() => removeDeliverable(d)}>×</button>
              </span>
            ))}
          </div>
          <div className="q-row" style={{ marginTop: '8px' }}>
            <input className="q-input" list="output-options" value={newOutput} onChange={(e) => setNewOutput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDeliverable(); } }}
              placeholder="e.g. Behind the scenes video" style={{ minWidth: '12rem' }} />
            <datalist id="output-options">{outputOptions.map((d) => <option key={d} value={d} />)}</datalist>
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
      </div>

      <div className="q-row" style={{ marginTop: '16px' }}>
        {mode === 'create' ? (
          <button className="q-btn q-btn-primary" disabled={isPending} onClick={submitCreate}>{isPending ? 'Creating…' : 'Create service'}</button>
        ) : (
          <>
            <button className="q-btn q-btn-primary" disabled={isPending} onClick={submit}>{isPending ? 'Saving…' : 'Save changes'}</button>
            <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => router.push(`/services/${serviceId}`)}>Cancel</button>
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
