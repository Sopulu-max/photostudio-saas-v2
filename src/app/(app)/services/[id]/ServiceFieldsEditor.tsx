'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createService, updateService, setServiceStatus, duplicateService } from '@/modules/services/interface';
import { narrowFor, dimensionKey } from '@/modules/services/interface';
import type { Narrowed, DimensionSuggestions, StudioDimensionShape, DimensionWrite } from '@/modules/services/interface';
import { CheckCircle2, Plus, Settings } from 'lucide-react';
import { PickOne, PickMany } from '@/components/Pick';
import { ServiceVariablesEditor } from './ServiceVariablesEditor';
import { WorkflowEditor } from './WorkflowEditor';
import type { WorkflowInput } from '@/modules/services/interface';

/**
 * Defining a service, in the vocabulary of its own domain.
 *
 * This used to render a hardcoded five — Subject, Occasion, Context, Purpose,
 * Client — no matter what the studio had actually set up. A studio could add
 * Style to Photography in settings and then find no field for it here, which
 * made the settings page a promise the form broke.
 *
 * What renders now is whatever the chosen domain asks. Choose Photography and
 * the form asks Photography's questions with Photography's values; choose
 * Printing and every question changes, because a domain owns its vocabulary and
 * nothing below it is shared sideways.
 *
 * Two escapes keep it from being a new ceiling, both required by the same rule:
 * every list suggests, none of them limits.
 *  - each value field accepts text the list doesn't have (PickMany), and what
 *    is typed becomes part of that domain's vocabulary on save;
 *  - a whole new dimension can be added right here, without leaving for
 *    settings — the questions are as open as the answers.
 */
export function ServiceFieldsEditor({
  mode, serviceId, status, domains, domainOptions, outputTypesByDomain, dimensionsByDomain,
  serviceSuggestions, deliverableSuggestions, dimensionSuggestions, variableSuggestions,
  workflowsByDomain,
  roleOptions,
  initial,
}: {
  mode: 'create' | 'edit'; serviceId?: string; status?: string;
  domains?: { id: string; name: string }[];
  domainOptions: string[];
  /** Domain name → the KINDS it can produce. Output types belong to a domain too. */
  outputTypesByDomain: Record<string, { id: string; name: string }[]>;
  /** Domain name → the dimensions it actively classifies by, with their values. */
  dimensionsByDomain: Record<string, StudioDimensionShape[]>;
  /** Domain → the services it knows about. */
  serviceSuggestions?: Record<string, string[]>;
  deliverableSuggestions?: Narrowed;
  dimensionSuggestions?: DimensionSuggestions;
  variableSuggestions?: any;
  workflowsByDomain?: Record<string, any[]>;
  roleOptions?: string[];
  initial: any;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [domain, setDomain] = useState(initial.serviceDomain ?? '');
  const [primaryDeliverable, setPrimaryOutputType] = useState(initial.primaryDeliverable ?? '');
  const [deliverables, setDeliverables] = useState<string[]>(initial.deliverables || []);
  const [variables, setVariables] = useState<any[]>(initial.variables || []);
  const [workflow, setWorkflow] = useState<WorkflowInput | null>(initial.workflow || null);

  /*
   * Chosen values, keyed by dimension name rather than by dimension id.
   *
   * By name because the same service may be re-domained, and because a value
   * typed under a dimension this domain doesn't ask yet still has to survive
   * until save — where find-or-create gives it a real row. An id-keyed map
   * would have nothing to key a not-yet-existing dimension by.
   */
  const [chosen, setChosen] = useState<Record<string, string[]>>(() => {
    const seed: Record<string, string[]> = {};
    for (const d of (initial.dimensions || []) as DimensionWrite[]) {
      if (d?.name) seed[dimensionKey(d.name)] = [...(d.values || [])];
    }
    return seed;
  });

  /** Dimensions this studio has invented in this session, before saving. */
  const [added, setAdded] = useState<Record<string, string[]>>({});
  const [adding, setAdding] = useState(false);
  const [newDimension, setNewDimension] = useState('');

  const domainName = domain.trim();
  const domainId = domains?.find((d) => d.name.toLowerCase() === domainName.toLowerCase())?.id;

  /*
   * The questions this form asks right now.
   *
   * The domain's own dimensions first, then anything added here this session,
   * then any dimension the initial service carries that its domain no longer
   * asks — a service tagged Occasion=Wedding must not silently lose that
   * because the studio turned Occasion off afterwards. Turning a dimension off
   * stops it being asked of new work; it never erases what was already said.
   */
  const questions = useMemo(() => {
    const list: { key: string; name: string; question: string | null; example: string | null; values: string[] }[] = [];
    const seen = new Set<string>();

    for (const d of (dimensionsByDomain[domainName] || [])) {
      seen.add(dimensionKey(d.name));
      list.push({
        key: dimensionKey(d.name), name: d.name, question: d.question, example: d.example,
        values: d.values.map((v) => v.name),
      });
    }
    for (const n of (added[domainName] || [])) {
      if (seen.has(dimensionKey(n))) continue;
      seen.add(dimensionKey(n));
      list.push({ key: dimensionKey(n), name: n, question: null, example: null, values: [] });
    }
    for (const d of ((initial.dimensions || []) as DimensionWrite[])) {
      if (!d?.name || seen.has(dimensionKey(d.name))) continue;
      seen.add(dimensionKey(d.name));
      list.push({ key: dimensionKey(d.name), name: d.name, question: null, example: null, values: [] });
    }
    return list;
  }, [dimensionsByDomain, domainName, added, initial.dimensions]);

  /*
   * What the form knows.
   *
   * The chain: a domain knows which services live under it; naming one of those
   * services narrows every dimension to what that service actually carries.
   * Type "Photography" and it offers Portrait, Event, Headshot; type "Portrait
   * Photography" and Context offers In-studio, Outdoor, Client's home rather
   * than every context any photography service has ever used.
   *
   * A service the library doesn't know falls back to the domain's union, which
   * is still narrower than the studio's whole vocabulary. The domain's own
   * values are appended after, never replaced.
   */
  const knownServices = serviceSuggestions?.[domainName] ?? [];
  const merge = (narrow: string[], all: string[]) => [
    ...narrow,
    ...all.filter((v) => !narrow.some((n) => n.toLowerCase() === v.toLowerCase())),
  ];
  const outputSuggestions = merge(
    narrowFor(deliverableSuggestions, domain, name),
    (outputTypesByDomain[domainName] || []).map((o) => o.name)
  );

  const setValues = (key: string, values: string[]) => setChosen((prev) => ({ ...prev, [key]: values }));

  const addDimension = () => {
    const n = newDimension.trim();
    if (!n) return;
    if (questions.some((q) => q.key === dimensionKey(n))) {
      setNewDimension('');
      setAdding(false);
      return;
    }
    setAdded((prev) => ({ ...prev, [domainName]: [...(prev[domainName] || []), n] }));
    setNewDimension('');
    setAdding(false);
  };

  const handleSave = () => {
    if (!name.trim()) return alert('Name is required.');
    if (!domainName) return alert('Service Domain is required.');

    startTransition(async () => {
      try {
        // Only what the form actually asked gets sent. A dimension with nothing
        // chosen still goes, empty — that is how clearing a value is said.
        const dimensions: DimensionWrite[] = questions.map((q) => ({
          name: q.name,
          values: chosen[q.key] || [],
        }));

        const payload = {
          name, description, serviceDomain: domain,
          primaryDeliverable: primaryDeliverable || null,
          deliverables,
          dimensions,
          variables,
          workflow,
        };
        if (mode === 'create') {
          // createService answers { serviceId }, not the id. Interpolating the
          // object gave /services/[object Object] — a 404 at the end of filling
          // in the whole form, with the service actually created. Packages
          // destructures the same shape correctly a directory away.
          const { serviceId: newId } = await createService(payload);
          router.push(`/services/${newId}`);
        } else {
          await updateService({ serviceId: serviceId!, ...payload });
          router.push(`/services/${serviceId}`);
        }
      } catch (err: any) { alert(err?.message || 'Failed to save service.'); }
    });
  };

  return (
    <div className="q-stack" style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>

      {/* 1. Core Service Information */}
      <div className="q-card q-stack" style={{ backgroundColor: 'var(--q-color-paper)', boxShadow: 'var(--q-shadow-sm)' }}>
        <h3 className="q-section-title">Service</h3>

        <div className="q-row q-gap-md" style={{ alignItems: 'flex-start' }}>
          <label className="q-label" style={{ flex: 1 }}>
            Service domain
            <PickOne
              value={domain}
              onChange={setDomain}
              options={domainOptions}
              placeholder="Select or enter a domain"
              disabled={isPending}
            />
            <span className="q-meta-sm" style={{ marginTop: '4px', opacity: 0.7 }}>
              Determines the classifications and output types available below.
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
            placeholder={domainName ? `Select or enter a ${domainName} service` : 'Select a domain first'}
            disabled={isPending || !domainName}
          />
          <span className="q-meta-sm" style={{ opacity: 0.7 }}>
            {!domainName
              ? 'Select a domain to see its known services.'
              : knownServices.length > 0
                ? `${knownServices.length} known under ${domainName}, or enter a new one.`
                : `No known services under ${domainName} yet.`}
          </span>
        </label>

        <label className="q-label" style={{ marginTop: '8px' }}>
          Description
          <textarea className="q-textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} disabled={isPending} />
        </label>
      </div>

      {/* 2. How this domain classifies its work */}
      <div className="q-card q-stack" style={{ backgroundColor: 'var(--q-color-paper)', boxShadow: 'var(--q-shadow-sm)', marginTop: '16px' }}>
        <div className="q-row q-row-between">
          <div>
            <h3 className="q-section-title">Classification</h3>
            <span className="q-meta-sm" style={{ opacity: 0.7 }}>
              What this service is limited to. Anything left unset becomes a question for the client at booking.
            </span>
          </div>
          <Settings size={20} color="var(--q-color-primary)" opacity={0.5} />
        </div>

        <div className="q-stack q-gap-md" style={{ marginTop: '16px', borderTop: '1px solid var(--q-color-border)', paddingTop: '16px' }}>
          {!domainName ? (
            <span className="q-meta-sm" style={{ fontStyle: 'italic', opacity: 0.6 }}>
              Select a service domain to see its classifications.
            </span>
          ) : (
            <>
              {questions.length === 0 && (
                <span className="q-meta-sm" style={{ fontStyle: 'italic', opacity: 0.6 }}>
                  {domainName} has no classifications yet. Add one below.
                </span>
              )}

              {questions.map((q) => {
                // Library knowledge for this dimension, narrowed by the named
                // service where it's known, then the domain's own values after.
                const options = merge(
                  narrowFor(dimensionSuggestions?.[q.key], domain, name),
                  q.values
                );
                return (
                  <div key={q.key} className="q-panel" style={{ padding: '16px', backgroundColor: 'var(--q-color-ground)' }}>
                    <label className="q-label">{q.name}</label>
                    {q.question && (
                      <span className="q-meta-sm" style={{ display: 'block', opacity: 0.7 }}>{q.question}</span>
                    )}
                    <div style={{ marginTop: '8px' }}>
                      <PickMany
                        values={chosen[q.key] || []}
                        onChange={(v) => setValues(q.key, v)}
                        options={options}
                        placeholder={
                          q.example
                            ? `e.g. ${q.example.split(',')[0].trim()}`
                            : `Select or enter a value`
                        }
                        disabled={isPending}
                      />
                    </div>
                  </div>
                );
              })}

              {/* The questions are as open as the answers. A studio that wants
                  to classify by Style shouldn't have to leave the form to say so. */}
              {adding ? (
                <div className="q-row q-gap-sm" style={{ alignItems: 'center' }}>
                  <input
                    className="q-input q-input-sm"
                    autoFocus
                    value={newDimension}
                    onChange={(e) => setNewDimension(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addDimension(); }
                      if (e.key === 'Escape') { setAdding(false); setNewDimension(''); }
                    }}
                    placeholder="e.g. Style, Season, Turnaround"
                    style={{ minWidth: '14rem' }}
                  />
                  <button className="q-btn q-btn-secondary q-btn-xs" onClick={addDimension} disabled={!newDimension.trim()}>
                    Add
                  </button>
                  <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => { setAdding(false); setNewDimension(''); }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => setAdding(true)} disabled={isPending}>
                  <Plus size={14} style={{ marginRight: '6px' }} />
                  Add classification
                </button>
              )}
              <span className="q-meta-sm" style={{ opacity: 0.7 }}>
                Anything added here belongs to {domainName} and will be available for its other services.{' '}
                <a className="q-accent" href="/services/settings">Manage classifications</a>.
              </span>
            </>
          )}
        </div>
      </div>

      {/* 3. Output Configuration */}
      <div className="q-card q-stack" style={{ backgroundColor: 'var(--q-color-paper)', boxShadow: 'var(--q-shadow-sm)', marginTop: '16px' }}>
        <h3 className="q-section-title">Output types</h3>

        <div className="q-stack q-gap-sm" style={{ marginTop: '16px' }}>
          <label className="q-label">
            Primary output
            {/* Narrowed by the named service where the app knows it: Portrait
                Photography produces edited photographs, not the whole studio
                vocabulary. How many of them is a package's business. */}
            <PickOne
              value={primaryDeliverable}
              onChange={setPrimaryOutputType}
              options={outputSuggestions}
              placeholder="Select or type a new output type"
              disabled={isPending}
            />
          </label>

          <div style={{ marginTop: '16px', borderTop: '1px solid var(--q-color-border)', paddingTop: '16px' }}>
            <label className="q-label" style={{ marginBottom: '8px' }}>Additional outputs</label>
            <PickMany
              values={deliverables}
              onChange={setDeliverables}
              options={outputSuggestions.filter((o) => o !== primaryDeliverable)}
              placeholder="Select or type new output types"
              disabled={isPending}
            />
            <span className="q-meta-sm" style={{ display: 'block', marginTop: '8px', opacity: 0.7 }}>
              Output types only. Quantities and sizes are set on a package.
            </span>
          </div>
        </div>
      </div>

      {/* Workflow Configuration */}
      <div className="q-card q-stack" style={{ backgroundColor: 'var(--q-color-paper)', boxShadow: 'var(--q-shadow-sm)', marginTop: '16px' }}>
        <h3 className="q-section-title">Workflow Tasks</h3>
        <span className="q-meta-sm" style={{ opacity: 0.7 }}>
          Define the production tasks that must happen to deliver this service.
        </span>
        <div style={{ marginTop: '16px', borderTop: '1px solid var(--q-color-border)', paddingTop: '16px' }}>
          <WorkflowEditor
            workflow={workflow}
            availableWorkflows={workflowsByDomain && domainId ? workflowsByDomain[domainId] : []}
            roleOptions={roleOptions}
            onChange={setWorkflow}
          />
        </div>
      </div>

      {/* Variables Section - Only rendered if in create mode (edit mode has it as a separate page section) */}
      {mode === 'create' && (
        <div className="q-card q-stack" style={{ backgroundColor: 'var(--q-color-paper)', boxShadow: 'var(--q-shadow-sm)', marginTop: '16px' }}>
          <h3 className="q-section-title">Variables</h3>
          <span className="q-meta-sm" style={{ opacity: 0.7 }}>
            What may vary about this service when a client books it (e.g., hours of coverage, outfits).
          </span>
          <div style={{ marginTop: '16px', borderTop: '1px solid var(--q-color-border)', paddingTop: '16px' }}>
            <ServiceVariablesEditor
              mode="create"
              initial={variables}
              onChange={setVariables}
              suggestions={variableSuggestions}
              domainName={domainName}
              serviceName={name}
            />
          </div>
        </div>
      )}

      {/* 4. Actions */}
      <div className="q-row q-row-between" style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--q-color-border)' }}>
        <div className="q-row">
          <button className="q-btn q-btn-primary" onClick={handleSave} disabled={isPending}>
            <CheckCircle2 size={16} style={{ marginRight: '8px' }} />
            {isPending ? 'Saving…' : 'Save service'}
          </button>
          <button className="q-btn q-btn-secondary" onClick={() => router.push(mode === 'create' ? '/services' : `/services/${serviceId}`)}>
            Cancel
          </button>
        </div>
        {mode === 'edit' && (
          <div className="q-row">
            {status === 'active' ? (
              <button className="q-btn q-btn-secondary" onClick={() => startTransition(() => setServiceStatus({ serviceId: serviceId!, status: 'retired' }).then(() => router.refresh()))} disabled={isPending}>Retire service</button>
            ) : (
              <button className="q-btn q-btn-secondary" onClick={() => startTransition(() => setServiceStatus({ serviceId: serviceId!, status: 'active' }).then(() => router.refresh()))} disabled={isPending}>Restore service</button>
            )}
            <button className="q-btn q-btn-secondary" onClick={() => startTransition(() => duplicateService(serviceId!).then(({ serviceId: copyId }) => router.push(`/services/${copyId}/edit`)))} disabled={isPending}>Duplicate</button>
          </div>
        )}
      </div>

    </div>
  );
}
