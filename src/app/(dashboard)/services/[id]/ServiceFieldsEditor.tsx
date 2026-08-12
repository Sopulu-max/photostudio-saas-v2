'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createService, updateService, setServiceStatus, duplicateService } from '@/modules/services/interface';
import { narrowFor, DIMENSION_LABELS } from '@/modules/services/interface';
import type { Dimension, Narrowed, DimensionSuggestions } from '@/modules/services/interface';
import { CheckCircle2, ChevronRight, Settings } from 'lucide-react';

export function ServiceFieldsEditor({
  mode, serviceId, status, domainOptions, outputOptions, enabledDimensions,
  occasionOptions, contextOptions, subjectOptions, purposeOptions, clientTypeOptions,
  serviceSuggestions, deliverableSuggestions, dimensionSuggestions,
  initial,
}: {
  mode: 'create' | 'edit'; serviceId?: string; status?: string;
  domainOptions: string[]; outputOptions: string[]; enabledDimensions: Dimension[];
  occasionOptions: string[]; contextOptions: string[]; subjectOptions: string[];
  purposeOptions: string[]; clientTypeOptions: string[];
  /** Domain → the services it knows about. */
  serviceSuggestions?: Record<string, string[]>;
  deliverableSuggestions?: Narrowed;
  dimensionSuggestions?: DimensionSuggestions;
  initial: any;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [domain, setDomain] = useState(initial.serviceDomain ?? '');
  const [primaryDeliverable, setPrimaryOutputType] = useState(initial.primaryDeliverable ?? '');
  const [deliverables, setDeliverables] = useState<string[]>(initial.deliverables || []);
  const [newOutput, setNewOutput] = useState('');
  
  /*
   * All five dimensions, in one shape.
   *
   * Context, Purpose and Client had no fields at all: the settings page let a
   * studio enable them, and the editor rendered Subject and Occasion only,
   * passing the other three straight back from `initial`. They could be
   * preserved but never set — so "Outdoor is a context for this service" was
   * unsayable, which is most of why the knowledge felt absent.
   */
  const [dims, setDims] = useState<Record<Dimension, string[]>>({
    subject: initial.subjects || [],
    occasion: initial.occasions || [],
    context: initial.contexts || [],
    purpose: initial.purposes || [],
    client: initial.clientTypes || [],
  });
  const [drafts, setDrafts] = useState<Record<Dimension, string>>({
    subject: '', occasion: '', context: '', purpose: '', client: '',
  });

  const setDim = (d: Dimension, values: string[]) => setDims((prev) => ({ ...prev, [d]: values }));
  const addDim = (d: Dimension) => {
    const v = drafts[d].trim();
    if (!v || dims[d].some((x) => x.toLowerCase() === v.toLowerCase())) return;
    setDim(d, [...dims[d], v]);
    setDrafts((prev) => ({ ...prev, [d]: '' }));
  };

  /*
   * What the form knows right now.
   *
   * The chain: a domain knows which services live under it; naming one of those
   * services narrows every dimension to what that service actually carries.
   * Type "Photography" and it offers Portrait, Event, Headshot; type "Portrait
   * Photography" and Context offers In-studio, Outdoor, Client's home rather
   * than every context any photography service has ever used.
   *
   * A service the library doesn't know falls back to the domain's union, which
   * is still narrower than the studio's whole vocabulary. And the studio's own
   * lists are appended after, never replaced — the suggestions are knowledge,
   * the free text is the space for what isn't known yet.
   */
  const ALL_OPTIONS: Record<Dimension, string[]> = {
    subject: subjectOptions, occasion: occasionOptions, context: contextOptions,
    purpose: purposeOptions, client: clientTypeOptions,
  };
  const knownServices = serviceSuggestions?.[domain.trim()] ?? [];
  const merge = (narrow: string[], all: string[]) => [
    ...narrow,
    ...all.filter((v) => !narrow.some((n) => n.toLowerCase() === v.toLowerCase())),
  ];
  const suggestFor = (dim: Dimension, all: string[]) =>
    merge(narrowFor(dimensionSuggestions?.[dim], domain, name), all);
  const outputSuggestions = merge(narrowFor(deliverableSuggestions, domain, name), outputOptions);

  const handleSave = () => {
    if (!name.trim()) return alert('Name is required.');
    if (!domain.trim()) return alert('Service Domain is required.');

    startTransition(async () => {
      try {
        const payload = {
          name, description, serviceDomain: domain,
          primaryDeliverable: primaryDeliverable || null,
          deliverables,
          subjects: dims.subject,
          occasions: dims.occasion,
          contexts: dims.context,
          purposes: dims.purpose,
          clientTypes: dims.client,
        };
        if (mode === 'create') {
          const newId = await createService(payload);
          router.push(`/services/${newId}`);
        } else {
          await updateService({ serviceId: serviceId!, ...payload });
          router.push(`/services/${serviceId}`);
        }
      } catch (err: any) { alert(err?.message || 'Failed to save service.'); }
    });
  };

  const toggleArray = (arr: string[], val: string, setter: (v: string[]) => void) => {
    if (arr.includes(val)) setter(arr.filter((x) => x !== val));
    else setter([...arr, val]);
  };

  const addArray = (val: string, arr: string[], setter: (v: string[]) => void, reset: () => void) => {
    const t = val.trim();
    if (t && !arr.includes(t)) setter([...arr, t]);
    reset();
  };

  return (
    <div className="q-stack" style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
      
      {/* 1. Core Service Information */}
      <div className="q-card q-stack" style={{ backgroundColor: 'var(--q-color-paper)', boxShadow: 'var(--q-shadow-sm)' }}>
        <h3 className="q-section-title">Core Capability</h3>
        
        <div className="q-row q-gap-md" style={{ alignItems: 'flex-start' }}>
          <label className="q-label" style={{ flex: 1 }}>
            Service Domain (Parent)
            <input className="q-input q-fill" list="domains-list" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. Photography" disabled={isPending} />
            <datalist id="domains-list">{domainOptions.map((o: string) => <option key={o} value={o} />)}</datalist>
            <span className="q-meta-sm" style={{ marginTop: '4px', opacity: 0.7 }}>Determines available DNA dimensions.</span>
          </label>
        </div>

        <label className="q-label" style={{ marginTop: '8px' }}>
          Service Name
          {/* The second link in the chain: a domain knows which services live
              under it. Naming one the app recognises is what narrows every
              field below to that service's own values. */}
          <input
            className="q-input"
            list="known-services-list"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={knownServices.length > 0 ? `e.g. ${knownServices[0]}` : 'e.g. Wedding Photography'}
            disabled={isPending}
          />
          <datalist id="known-services-list">
            {knownServices.map((o: string) => <option key={o} value={o} />)}
          </datalist>
          {domain.trim() && knownServices.length > 0 && (
            <span className="q-meta-sm" style={{ opacity: 0.7 }}>
              {domain.trim()} usually covers {knownServices.slice(0, 4).join(', ')}
              {knownServices.length > 4 ? ', and more' : ''} — or name your own.
            </span>
          )}
        </label>
        
        <label className="q-label" style={{ marginTop: '8px' }}>
          Description
          <textarea className="q-textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} disabled={isPending} />
        </label>
      </div>

      {/* 2. Internal Restrictions (Derived from Domain DNA) */}
      <div className="q-card q-stack" style={{ backgroundColor: 'var(--q-color-paper)', boxShadow: 'var(--q-shadow-sm)', marginTop: '16px' }}>
        <div className="q-row q-row-between">
          <div>
            <h3 className="q-section-title">Internal Restrictions</h3>
            <span className="q-meta-sm" style={{ opacity: 0.7 }}>Dimensions constrained by this service. Any unconstrained dimension is asked of the client.</span>
          </div>
          <Settings size={20} color="var(--q-color-primary)" opacity={0.5} />
        </div>

        <div className="q-stack q-gap-md" style={{ marginTop: '16px', borderTop: '1px solid var(--q-color-border)', paddingTop: '16px' }}>
          {enabledDimensions.length === 0 ? (
            <span className="q-meta-sm" style={{ fontStyle: 'italic', opacity: 0.6 }}>
              No dimensions turned on. Choose how this studio classifies its work in{' '}
              <a className="q-accent" href="/services/settings">Service settings</a>.
            </span>
          ) : (
            <>
              {enabledDimensions.map((dim) => {
                const meta = DIMENSION_LABELS[dim];
                const options = suggestFor(dim, ALL_OPTIONS[dim]);
                return (
                  <div key={dim} className="q-panel" style={{ padding: '16px', backgroundColor: 'var(--q-color-ground)' }}>
                    <label className="q-label">{meta.label}</label>
                    <span className="q-meta-sm" style={{ display: 'block', opacity: 0.7 }}>{meta.question}</span>
                    <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                      {dims[dim].map((v: string) => (
                        <span key={v} className="q-badge q-badge-neutral" style={{ cursor: 'pointer' }}
                          onClick={() => setDim(dim, dims[dim].filter((x) => x !== v))}>
                          {v} &times;
                        </span>
                      ))}
                      <div className="q-row q-gap-sm">
                        <input
                          className="q-input"
                          style={{ width: '180px', padding: '4px 12px', fontSize: '0.85rem' }}
                          list={`dim-${dim}-list`}
                          value={drafts[dim]}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [dim]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDim(dim); } }}
                          placeholder={options.length > 0 ? options.slice(0, 2).join(', ') : meta.example}
                        />
                        {/* Suggestions, never limits: the list narrows to what this
                            service is known to carry, and anything can still be typed. */}
                        <datalist id={`dim-${dim}-list`}>
                          {options.map((o: string) => <option key={o} value={o} />)}
                        </datalist>
                        <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => addDim(dim)}>Add</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* 3. Output Configuration */}
      <div className="q-card q-stack" style={{ backgroundColor: 'var(--q-color-paper)', boxShadow: 'var(--q-shadow-sm)', marginTop: '16px' }}>
        <h3 className="q-section-title">Produces (Outputs)</h3>
        
        <div className="q-stack q-gap-sm" style={{ marginTop: '16px' }}>
          <label className="q-label">
            Primary Asset
            <input className="q-input q-fill" style={{ fontSize: '1rem', fontWeight: 500, padding: '12px' }} list="outputs-list" value={primaryDeliverable} onChange={(e) => setPrimaryOutputType(e.target.value)} placeholder="e.g. Edited Photograph" disabled={isPending} />
            <datalist id="outputs-list">{outputOptions.map((o: string) => <option key={o} value={o} />)}</datalist>
          </label>

          <div style={{ marginTop: '16px', borderTop: '1px solid var(--q-color-border)', paddingTop: '16px' }}>
            <label className="q-label" style={{ marginBottom: '8px' }}>Additional Deliverables</label>
            <div className="q-stack q-gap-sm">
              {deliverables.map((d: string) => (
                <div key={d} className="q-panel q-row q-row-between" style={{ padding: '12px 16px', backgroundColor: 'var(--q-color-ground)' }}>
                  <span className="q-strong">{d}</span>
                  <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => toggleArray(deliverables, d, setDeliverables)}>&times;</button>
                </div>
              ))}
              
              <div className="q-row q-gap-sm" style={{ marginTop: '8px' }}>
                <input className="q-input q-fill" list="outputs-list" value={newOutput} onChange={(e) => setNewOutput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addArray(newOutput, deliverables, setDeliverables, () => setNewOutput('')); }} placeholder="+ Add another asset..." />
                <button className="q-btn q-btn-secondary" onClick={() => addArray(newOutput, deliverables, setDeliverables, () => setNewOutput(''))}>Add Deliverable</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Actions */}
      <div className="q-row q-row-between" style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--q-color-border)' }}>
        <div className="q-row">
          <button className="q-btn q-btn-primary" onClick={handleSave} disabled={isPending}>
            <CheckCircle2 size={16} style={{ marginRight: '8px' }} />
            {isPending ? 'Saving...' : 'Save Capability Engine'}
          </button>
          <button className="q-btn q-btn-secondary" onClick={() => router.push(mode === 'create' ? '/services' : `/services/${serviceId}`)}>
            Cancel
          </button>
        </div>
        {mode === 'edit' && (
          <div className="q-row">
            {status === 'active' ? (
              <button className="q-btn q-btn-secondary" onClick={() => startTransition(() => setServiceStatus({ serviceId: serviceId!, status: 'retired' }).then(() => router.refresh()))} disabled={isPending}>Archive Engine</button>
            ) : (
              <button className="q-btn q-btn-secondary" onClick={() => startTransition(() => setServiceStatus({ serviceId: serviceId!, status: 'active' }).then(() => router.refresh()))} disabled={isPending}>Restore Engine</button>
            )}
            <button className="q-btn q-btn-secondary" onClick={() => startTransition(() => duplicateService(serviceId!).then((newId) => router.push(`/services/${newId}/edit`)))} disabled={isPending}>Duplicate</button>
          </div>
        )}
      </div>

    </div>
  );
}
