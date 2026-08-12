'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createService, updateService, setServiceStatus, duplicateService } from '@/modules/services/interface';
import { narrowFor, DIMENSION_LABELS } from '@/modules/services/interface';
import type { Dimension, Narrowed, DimensionSuggestions } from '@/modules/services/interface';
import { CheckCircle2, ChevronRight, Settings } from 'lucide-react';
import { PickOne, PickMany } from '@/components/Pick';

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
  const setDim = (d: Dimension, values: string[]) => setDims((prev) => ({ ...prev, [d]: values }));

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
            <PickOne
              value={domain}
              onChange={setDomain}
              options={domainOptions}
              placeholder="Choose a domain, or type a new one…"
              disabled={isPending}
            />
            <span className="q-meta-sm" style={{ marginTop: '4px', opacity: 0.7 }}>
              Everything below reconfigures around this.
            </span>
          </label>
        </div>

        <label className="q-label" style={{ marginTop: '8px' }}>
          Service Name
          {/* The second link in the chain: a domain knows which services live
              under it. Naming one the app recognises is what narrows every
              field below to that service's own values. */}
          <PickOne
            value={name}
            onChange={setName}
            options={knownServices}
            placeholder={domain.trim() ? `Which ${domain.trim()} service — or type your own` : 'Choose a domain first…'}
            disabled={isPending || !domain.trim()}
          />
          <span className="q-meta-sm" style={{ opacity: 0.7 }}>
            {!domain.trim()
              ? 'Pick a domain and this fills with the services it knows.'
              : knownServices.length > 0
                ? `${knownServices.length} known under ${domain.trim()} — or add your own.`
                : `Nothing known under ${domain.trim()} yet — add the first.`}
          </span>
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
                    <div style={{ marginTop: '8px' }}>
                      <PickMany
                        values={dims[dim]}
                        onChange={(v) => setDim(dim, v)}
                        options={options}
                        placeholder={`Add ${meta.label.toLowerCase()} — choose or type`}
                        disabled={isPending}
                      />
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
            {/* Narrowed by the named service where the app knows it: Portrait
                Photography produces edited photographs, not the whole studio
                vocabulary. How many of them is a package's business. */}
            <PickOne
              value={primaryDeliverable}
              onChange={setPrimaryOutputType}
              options={outputSuggestions}
              placeholder="What does this mainly produce — choose or type"
              disabled={isPending}
            />
          </label>

          <div style={{ marginTop: '16px', borderTop: '1px solid var(--q-color-border)', paddingTop: '16px' }}>
            <label className="q-label" style={{ marginBottom: '8px' }}>Also produces</label>
            <PickMany
              values={deliverables}
              onChange={setDeliverables}
              options={outputSuggestions.filter((o) => o !== primaryDeliverable)}
              placeholder="Add an output — choose or type"
              disabled={isPending}
            />
            <span className="q-meta-sm" style={{ display: 'block', marginTop: '8px', opacity: 0.7 }}>
              What kind of thing, not how many — quantities and sizes belong to a package.
            </span>
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
