'use client';

import React, { useState, useTransition, forwardRef, useImperativeHandle } from 'react';
import { useRouter } from 'next/navigation';
import { createPackage, updatePackage, setPackageStatus, duplicatePackage } from '@/modules/packages/interface';
import { formatDeliverable } from '@/modules/packages/interface';
import { DURATION_CHOICES } from '@/kernel/currency';

type ServiceOption = { 
  id: string; 
  name: string; 
  domain?: { name: string } | null;
  description?: string | null;
  deliverables?: { id: string; name: string }[];
  /** However many dimensions this service's domain asks, with what it carries. */
  dimensions?: { id: string; name: string; values: { id: string; name: string }[] }[];
  workflows?: { id: string; name: string }[];
};

/** A dimension a package can be classified by, and the domain that owns it. */
type DimensionOption = {
  id: string;
  name: string;
  domainName: string;
  values: { id: string; name: string }[];
};
type Stage = { name: string; roleName: string; frontStage: boolean };

/**
 * One thing this package promises, and the bundled service that produces it.
 *
 * The service is part of the promise rather than looked up from it. A package
 * bundling Photography and Framing promises prints through Framing; without the
 * pairing, "20 prints" floats free of anything that makes them.
 */
type Promise_ = { serviceId: string; deliverableId: string; quantity: number | null; unit: string | null; spec: string | null; specValues?: Record<string, unknown> | null };

import type { ServiceVariable } from '@/modules/services/interface';

/**
 * A Package is a commercial construct — it bundles one or more real
 * Services (asked of the Services module, never invented here) into a
 * single priced offering. Its routing is the union of every bundled
 * Service's Process, plus whatever this specific offering adds on its own.
 */
export const PackageFieldsEditor = forwardRef(function PackageFieldsEditor({
  mode,
  packageId,
  status,
  currencyCode,
  allServices,
  allVariables,
  allDeliverables,
  allContainers,
  allWorkflows,
  dimensionsByDomain,
  roleOptions,
  intendedValueId = null,
  initial,
  onSubmitOverride,
  hideControls,
}: {
  mode: 'create' | 'edit';
  packageId?: string;
  status?: string;
  currencyCode: string;
  allServices: ServiceOption[];
  allVariables: (ServiceVariable & { serviceName: string })[];
  allDeliverables: { id: string; name: string }[];
  allContainers: { id: string; name: string }[];
  allWorkflows: { id: string; name: string }[];
  /** Domain name → the dimensions it classifies by. A package may draw on several. */
  dimensionsByDomain: Record<string, { id: string; name: string; values: { id: string; name: string }[] }[]>;
  roleOptions: string[];
  /**
   * A classification the operator started from, before there was any service to
   * attach it to. Applied to the first bundled service whose domain owns it.
   */
  intendedValueId?: string | null;
  initial: {
    name?: string;
    description?: string | null;
    durationMinutes?: number | null;
    serviceIds?: string[];
    /** What the package promises, each on the bundled service that produces it. */
    deliverables?: Promise_[];
    containerIds?: string[];
    /** The production sequences to run, each on the bundled service it belongs to. */
    workflows?: { serviceId: string; blueprintId: string }[];
    /** Each value paired with the bundled service this package narrows to it. */
    narrowings?: { serviceId: string; valueId: string }[];
    extraStages?: Stage[];
    variableValues?: { serviceVariableId: string; value: unknown }[];
  };
  onSubmitOverride?: (payload: any) => Promise<void> | void;
  hideControls?: boolean;
}, ref) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [nameTouched, setNameTouched] = useState(!!initial.name);
  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [serviceIds, setServiceIds] = useState<string[]>(initial.serviceIds || []);
  const [duration, setDuration] = useState(initial.durationMinutes ?? 0);
  
  /*
   * What this package promises, and how much of it, in what unit, to what spec.
   *
   * A service says the KIND — edited photographs. Only a package says six of
   * them, or thirty seconds, or 20x30. Held against the service that produces
   * it, so a package promising prints has to bundle something that prints.
   */
  const [promises, setPromises] = useState<Promise_[]>(() => {
    /*
     * Open a package and see what its services already produce.
     *
     * Selecting a service auto-promises what it makes, to save clicks. Coming
     * back to edit did not, so a bundle assembled before that — or by any path
     * other than the checkbox — opened with an empty promises list beside a
     * service that plainly produces things. Editing a bundled service is meant
     * to feel like editing the service, and a service does not forget its own
     * outputs.
     *
     * Materialised rather than merely shown, unlike the classifications above:
     * there, absence has a documented meaning — untouched sells everything —
     * so drawing the inheritance is enough. Here absence means nothing is
     * promised, and the rest of the app reads it that way, so parity with what
     * adding a service does is the honest fix.
     */
    const seeded = [...(initial.deliverables || [])];
    for (const sid of (initial.serviceIds || [])) {
      if (seeded.some((p) => p.serviceId === sid)) continue;
      const produces = (allServices.find((x) => x.id === sid)?.deliverables || []) as { id: string }[];
      for (const d of produces) {
        seeded.push({ serviceId: sid, deliverableId: d.id, quantity: null, unit: null, spec: null, specValues: null });
      }
    }
    return seeded;
  });
  const [newDeliverableId, setNewDeliverableId] = useState<Record<string, string>>({});

  const promisesFor = (sid: string) => promises.filter((p) => p.serviceId === sid);
  const addPromise = (sid: string, deliverableId: string) => {
    if (!deliverableId) return;
    setPromises((prev) => prev.some((p) => p.serviceId === sid && p.deliverableId === deliverableId)
      ? prev
      : [...prev, { serviceId: sid, deliverableId, quantity: null, unit: null, spec: null, specValues: null }]);
    setNewDeliverableId((prev) => ({ ...prev, [sid]: '' }));
  };
  const removePromise = (sid: string, deliverableId: string) =>
    setPromises((prev) => prev.filter((p) => !(p.serviceId === sid && p.deliverableId === deliverableId)));
  const patchPromise = (sid: string, deliverableId: string, patch: Partial<Promise_>) =>
    setPromises((prev) => prev.map((p) => (p.serviceId === sid && p.deliverableId === deliverableId ? { ...p, ...patch } : p)));

  const [containers, setContainers] = useState<string[]>(initial.containerIds || []);
  const [newContainerId, setNewContainerId] = useState('');

  const [workflows, setWorkflows] = useState<{ serviceId: string; blueprintId: string }[]>(initial.workflows || []);
  const [newWorkflowId, setNewWorkflowId] = useState<Record<string, string>>({});

  const workflowsFor = (sid: string) => workflows.filter((w) => w.serviceId === sid);
  const addWorkflow = (sid: string, blueprintId: string) => {
    if (!blueprintId) return;
    setWorkflows((prev) => prev.some((w) => w.serviceId === sid && w.blueprintId === blueprintId)
      ? prev
      : [...prev, { serviceId: sid, blueprintId }]);
    setNewWorkflowId((prev) => ({ ...prev, [sid]: '' }));
  };
  const removeWorkflow = (sid: string, blueprintId: string) =>
    setWorkflows((prev) => prev.filter((w) => !(w.serviceId === sid && w.blueprintId === blueprintId)));

  /*
   * How this package narrows each service it bundles, keyed by service id.
   *
   * Per service rather than one flat list, because the narrowing is a fact
   * about a service inside this package: bundle two Photography services and a
   * bare value could not say which of them it applied to.
   *
   * A package selects; it never redefines. There is no free-text escape here on
   * purpose — inventing a value is an act on a domain's vocabulary, which
   * belongs to the service layer. What a package can say is drawn from what it
   * bundles, and a service left untouched sells everything it offers.
   */
  const [narrowings, setNarrowings] = useState<Record<string, string[]>>(() => {
    const byService: Record<string, string[]> = {};
    for (const n of (initial.narrowings || [])) {
      if (!byService[n.serviceId]) byService[n.serviceId] = [];
      byService[n.serviceId].push(n.valueId);
    }
    return byService;
  });
  const [pendingValue, setPendingValue] = useState<Record<string, string>>({});
  /*
   * What this package includes (fixed variables).
   * Like dimensions, variables are tied to the selected services.
   */
  const initialVarsMap: Record<string, string> = {};
  for (const v of (initial.variableValues || [])) {
    initialVarsMap[v.serviceVariableId] = String(v.value ?? '');
  }
  const [variableValues, setVariableValues] = useState<Record<string, string>>(initialVarsMap);
  const setVariable = (id: string, raw: string) => setVariableValues((v) => ({ ...v, [id]: raw }));

  const [extraStages, setExtraStages] = useState<Stage[]>(initial.extraStages || []);

  const bundledNames = allServices.filter((s) => serviceIds.includes(s.id)).map((s) => s.name);
  const composed = bundledNames.join(' + ') || 'Untitled package';

  /*
   * (Available dimensions logic has been moved directly into the Service Cards)
   */
  const effectiveName = nameTouched ? name : composed;

  const toggleService = (id: string) => {
    setServiceIds((prevIds) => {
      const isRemoving = prevIds.includes(id);
      const newServiceIds = isRemoving ? prevIds.filter((x) => x !== id) : [...prevIds, id];

      if (isRemoving) {
        // Everything a package says is said about a bundled service, so dropping
        // one drops exactly its own — no set arithmetic, and a sibling service
        // keeps what it promised even if the two produce the same thing.
        setVariableValues((prevVars) => {
          const next = { ...prevVars };
          allVariables.filter((v) => v.serviceId === id).forEach((v) => delete next[v.id]);
          return next;
        });
        setNarrowings((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setPromises((prev) => prev.filter((p) => p.serviceId !== id));
        setWorkflows((prev) => prev.filter((w) => w.serviceId !== id));
      } else {
        // Adding a service: auto-promise what it produces, to save clicks.
        const addedService = allServices.find((s) => s.id === id);
        if (addedService) {
          const produces = addedService.deliverables || [];
          if (produces.length > 0) {
            setPromises((prev) => [
              ...prev,
              ...produces
                .filter((d) => !prev.some((p) => p.serviceId === id && p.deliverableId === d.id))
                .map((d) => ({ serviceId: id, deliverableId: d.id, quantity: null, unit: null, spec: null, specValues: null })),
            ]);
          }

          const sw = addedService.workflows || [];
          if (sw.length > 0) {
            setWorkflows((prev) => [
              ...prev,
              ...sw.filter((w) => !prev.some((pw) => pw.serviceId === id && pw.blueprintId === w.id))
                   .map((w) => ({ serviceId: id, blueprintId: w.id }))
            ]);
          }

          const sDims = addedService.dimensions || [];
          if (sDims.length > 0) {
            const defaultTags = sDims.flatMap((d) => d.values.map((v: any) => v.id));
            if (defaultTags.length > 0) {
              setNarrowings((prev) => {
                const existing = prev[id] || [];
                const toAdd = defaultTags.filter(tid => !existing.includes(tid));
                if (toAdd.length === 0) return prev;
                return { ...prev, [id]: [...existing, ...toAdd] };
              });
            }
          }
        }

        // The value the operator came in with finally has a service to narrow,
        // but only if this one's domain is the one that owns it.
        const domainName = addedService?.domain?.name;
        const speaksIt = Boolean(intendedValueId) && Boolean(domainName)
          && (dimensionsByDomain[domainName!] || []).some((d) => d.values.some((v) => v.id === intendedValueId));
        if (speaksIt) {
          setNarrowings((prev) => prev[id]?.includes(intendedValueId!)
            ? prev
            : { ...prev, [id]: [...(prev[id] || []), intendedValueId!] });
        }
      }
      return newServiceIds;
    });
  };

  const addContainer = (id: string) => { if (id && !containers.includes(id)) setContainers(d => [...d, id]); setNewContainerId(''); };
  const removeContainer = (id: string) => setContainers(d => d.filter(x => x !== id));


  const addStage = () => setExtraStages((s) => [...s, { name: '', roleName: '', frontStage: true }]);
  const patchStage = (i: number, updates: Partial<Stage>) => setExtraStages((s) => s.map((row, idx) => (idx === i ? { ...row, ...updates } : row)));
  const removeStage = (i: number) => setExtraStages((s) => s.filter((_, idx) => idx !== i));

  const buildPayload = () => {
    // Only send values for variables belonging to currently selected services
    const activeVariables = allVariables.filter((v) => serviceIds.includes(v.serviceId));
    const payloadVariableValues = activeVariables
      .filter((v) => (variableValues[v.id] ?? '') !== '')
      .map((v) => {
        const raw = variableValues[v.id];
        const value =
          v.kind === 'number' ? Number(raw)
          : v.kind === 'boolean' ? raw === 'true'
          : raw;
        return { serviceVariableId: v.id, value };
      });

    return {
      name: effectiveName,
      description: description.trim() || null,
      durationMinutes: duration > 0 ? duration : null,
      serviceIds,
      // Everything below is filtered to services still bundled, so deselecting
      // one cannot leave a link behind that the server would then reject.
      deliverables: promises.filter((p) => serviceIds.includes(p.serviceId)).map(p => ({
        serviceId: p.serviceId,
        deliverableId: p.deliverableId,
        quantity: p.quantity,
        specValues: p.specValues
      })),
      containerIds: containers,
      workflows: workflows.filter((w) => serviceIds.includes(w.serviceId)),
      narrowings: serviceIds.flatMap((sid) =>
        (narrowings[sid] || []).map((valueId) => ({ serviceId: sid, valueId }))
      ),
      extraStages: extraStages.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), roleName: s.roleName.trim() || null, frontStage: s.frontStage })),
      variableValues: payloadVariableValues,
    };
  };

  useImperativeHandle(ref, () => ({
    buildPayload,
  }), [buildPayload]);

  const submit = () => {
    if (packageId) startTransition(async () => {
      try { 
        if (onSubmitOverride) { await onSubmitOverride({ packageId, ...buildPayload() }); return; }
        await updatePackage({ packageId, ...buildPayload() }); 
        router.refresh(); 
        router.push(`/packages/${packageId}`);
      }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });
  };
  const submitCreate = () => startTransition(async () => {
    try { 
      if (onSubmitOverride) { await onSubmitOverride(buildPayload()); return; }
      const { packageId: newId } = await createPackage(buildPayload()); 
      router.push(`/packages/${newId}`); 
    }
    catch (e: any) { alert(e?.message || 'Failed to create the package.'); }
  });

  const retired = status === 'retired';

  /** Everything the service itself is classified as — what it sells untouched. */
  const offeredBy = (serviceId: string) =>
    ((allServices.find((x) => x.id === serviceId)?.dimensions || []) as DimensionOption[])
      .flatMap((d) => d.values.map((v) => v.id));

  const renderDimension = (dim: DimensionOption, serviceId: string) => {
    /*
     * Untouched means "sells everything it offers" — so show that.
     *
     * The rule was already right and already written down a few lines above;
     * only the drawing of it was wrong. An empty answer rendered as an empty
     * field, which reads as though the service carried no classification at
     * all — so coming back to edit a package looked like the section had lost
     * what you put in it, when in fact nothing had ever needed storing.
     *
     * Inherited values are shown as the service's own. Touch one and the set
     * becomes this package's own answer, which is the moment narrowing
     * actually happens: subtraction from what the service offers.
     */
    const explicit = narrowings[serviceId];
    const inherited = explicit === undefined;
    const forService = explicit ?? offeredBy(serviceId);
    const chosen = forService.filter((id) => dim.values.some((v) => v.id === id));
    // Scoped to the card it is drawn in, so the same dimension on two bundled
    // services keeps two independent answers.
    const pendingKey = `${serviceId}:${dim.id}`;
    const setFor = (next: string[]) => setNarrowings((prev) => ({ ...prev, [serviceId]: next }));
    const add = (id: string) => {
      if (id && !forService.includes(id)) setFor([...forService, id]);
      setPendingValue((prev) => ({ ...prev, [pendingKey]: '' }));
    };
    return (
      <div className="q-field" key={dim.id}>
        <label className="q-label">{dim.name}</label>
        <span className="q-meta-sm" style={{ display: 'block', opacity: 0.7 }}>
          {dim.domainName}
          {inherited && chosen.length > 0 && ' · as the service is classified'}
        </span>
        <div className="q-row" style={{ flexWrap: 'wrap', margin: chosen.length > 0 ? '8px 0' : '0' }}>
          {chosen.map((id) => {
            const name = dim.values.find((v) => v.id === id)?.name || id;
            return (
              <span key={id} className="q-badge q-badge-neutral">
                {name} <button className="q-btn-ghost" style={{ padding: '0 0 0 6px' }} onClick={() => setFor(forService.filter((x) => x !== id))}>×</button>
              </span>
            );
          })}
        </div>
        <div className="q-row">
          <select
            className="q-select"
            value={pendingValue[pendingKey] || ''}
            onChange={(e) => setPendingValue((prev) => ({ ...prev, [pendingKey]: e.target.value }))}
            style={{ minWidth: '12rem' }}
          >
            <option value="">Select...</option>
            {dim.values.filter((v) => !forService.includes(v.id)).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => add(pendingValue[pendingKey] || '')} disabled={!pendingValue[pendingKey]}>+ Add</button>
        </div>
      </div>
    );
  };

  /**
   * What this package promises through one bundled service.
   *
   * Drawn inside the service's card, which is the whole point: the quantity and
   * spec are the package's to set, but the thing being quantified is produced by
   * this service and by nothing else in the bundle.
   */
  const renderVariables = (s: ServiceOption) => {
    const vars = allVariables.filter(v => v.serviceId === s.id);
    if (vars.length === 0) return null;
    return (
      <div className="q-stack q-stack-sm">
        {vars.map((v) => {
          const current = variableValues[v.id] ?? '';
          return (
            <div key={v.id} className="q-tile q-row q-row-between" style={{ flexWrap: 'wrap' }}>
              <div>
                <strong className="q-strong">{v.label}</strong>
                {current === '' && <span className="q-meta-sm"> &middot; asked at booking</span>}
              </div>
              <div className="q-row">
                {v.kind === 'number' && (
                  <>
                    <input
                      className="q-input q-num" type="number" value={current} disabled={isPending}
                      min={v.min ?? undefined} max={v.max ?? undefined}
                      onChange={(e) => setVariable(v.id, e.target.value)}
                      placeholder="&mdash;" style={{ width: '7rem' }}
                    />
                    {v.unit && <span className="q-meta-sm">{Number(current) === 1 ? v.unit : `${v.unit}s`}</span>}
                  </>
                )}
                {v.kind === 'choice' && (
                  <select className="q-select" value={current} disabled={isPending} onChange={(e) => setVariable(v.id, e.target.value)} style={{ minWidth: '10rem' }}>
                    <option value="">Ask the client</option>
                    {v.options.map((o: string) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
                {v.kind === 'boolean' && (
                  <select className="q-select" value={current} disabled={isPending} onChange={(e) => setVariable(v.id, e.target.value)} style={{ minWidth: '10rem' }}>
                    <option value="">Ask the client</option>
                    <option value="true">Included</option>
                    <option value="false">Not included</option>
                  </select>
                )}
                {v.kind === 'text' && (
                  <input className="q-input" value={current} disabled={isPending} onChange={(e) => setVariable(v.id, e.target.value)} placeholder="Ask the client" style={{ minWidth: '10rem' }} />
                )}
                {v.kind === 'textarea' && (
                  <textarea className="q-input" value={current} disabled={isPending} onChange={(e) => setVariable(v.id, e.target.value)} placeholder="Ask the client" style={{ minWidth: '10rem', minHeight: '3rem' }} />
                )}
                {v.kind === 'date' && (
                  <input className="q-input" type="date" value={current} disabled={isPending} onChange={(e) => setVariable(v.id, e.target.value)} style={{ minWidth: '10rem' }} />
                )}
                {v.kind === 'url' && (
                  <input className="q-input" type="url" value={current} disabled={isPending} onChange={(e) => setVariable(v.id, e.target.value)} placeholder="https://..." style={{ minWidth: '10rem' }} />
                )}
                {v.kind === 'multichoice' && (
                  <div className="q-stack q-stack-xs">
                    {v.options.map((o: string) => {
                      const selected = current.split(',').filter(Boolean);
                      const isOn = selected.includes(o);
                      return (
                        <label key={o} className="q-row" style={{ gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isOn}
                            disabled={isPending}
                            onChange={() => {
                              const next = isOn ? selected.filter((x: string) => x !== o) : [...selected, o];
                              setVariable(v.id, next.join(','));
                            }}
                          />
                          <span>{o}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {current !== '' && (
                  <button type="button" className="q-btn q-btn-secondary q-btn-xs" disabled={isPending} onClick={() => setVariable(v.id, '')}>Clear</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPromises = (s: ServiceOption) => {
    const mine = promisesFor(s.id);
    const produces = s.deliverables || [];
    const suggested = produces.filter((d) => !mine.some((p) => p.deliverableId === d.id));
    return (
      <div className="q-stack q-stack-sm">
        {mine.length === 0 && <p className="q-empty" style={{ margin: 0 }}>Nothing promised from this service yet.</p>}
        {mine.map((p) => {
          const dName = allDeliverables.find((d) => d.id === p.deliverableId)?.name || p.deliverableId;
          return (
            <div key={p.deliverableId} className="q-tile q-stack q-stack-sm">
              <div className="q-row q-row-between">
                <strong className="q-strong">{dName}</strong>
                <button type="button" className="q-btn-ghost" style={{ padding: '0 4px' }} onClick={() => removePromise(s.id, p.deliverableId)}>×</button>
              </div>
              <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <input
                  className="q-input q-input-sm" type="number" min={0} placeholder="Quantity"
                  value={p.quantity ?? ''}
                  onChange={(e) => patchPromise(s.id, p.deliverableId, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
                  style={{ maxWidth: '7rem' }}
                />
              </div>

              {/* Dynamic Deliverable Form */}
              {(() => {
                const def = (allDeliverables as any[]).find((d) => d.id === p.deliverableId);
                if (!def) return null;
                
                // If it's a baked instance, there is no form to show
                if (def.spec_values) {
                  return (
                    <div className="q-meta-sm q-banner q-banner-info">
                      <strong>Locked SKU:</strong> The details for this deliverable are predefined and locked by the studio.
                    </div>
                  );
                }

                // If it's a class with a schema, render the form
                const schema = def.spec_schema;
                if (!schema || !Array.isArray(schema) || schema.length === 0) return null;
                
                const currentVals = p.specValues || {};

                return (
                  <div className="q-stack q-stack-sm" style={{ paddingLeft: '16px', borderLeft: '2px solid var(--q-color-neutral-300)' }}>
                    {schema.map((field: any, i: number) => {
                      if (!field.key) return null;
                      
                      const setVal = (v: any) => patchPromise(s.id, p.deliverableId, { specValues: { ...currentVals, [field.key]: v } });
                      
                      return (
                        <div key={i} className="q-field">
                          <label className="q-label q-label-sm">{field.key}</label>
                          {field.type === 'select' && field.options ? (
                            <select 
                              className="q-select q-select-sm" 
                              value={(currentVals[field.key] as string) || ''} 
                              onChange={(e) => setVal(e.target.value)}
                            >
                              <option value="">Select...</option>
                              {field.options.map((opt: string) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input 
                              type="text" 
                              className="q-input q-input-sm" 
                              value={(currentVals[field.key] as string) || ''} 
                              onChange={(e) => setVal(e.target.value)} 
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <span className="q-meta-sm" style={{ opacity: 0.8 }}>
                Appears as: {formatDeliverable({ name: dName, quantity: p.quantity, spec_values: p.specValues || (allDeliverables as any[]).find((d) => d.id === p.deliverableId)?.spec_values })}
              </span>
            </div>
          );
        })}

        {suggested.length > 0 && (
          <div className="q-row" style={{ flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
            <span className="q-meta-sm">Also produces:</span>
            {suggested.map((d) => (
              <button key={d.id} type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => addPromise(s.id, d.id)}>
                + {d.name}
              </button>
            ))}
          </div>
        )}

        {suggested.length === 0 && mine.length > 0 && (
          <span className="q-meta-sm" style={{ opacity: 0.7 }}>All outputs produced by this service have been promised.</span>
        )}
      </div>
    );
  };

  /** The production sequences to run for this bundled service. */
  const renderWorkflows = (s: ServiceOption) => {
    const mine = workflowsFor(s.id);
    return (
      <div className="q-stack q-stack-sm">
        <div className="q-row" style={{ flexWrap: 'wrap', marginBottom: mine.length > 0 ? '8px' : '0' }}>
          {mine.map((w) => {
            const wName = allWorkflows.find((x) => x.id === w.blueprintId)?.name || w.blueprintId;
            return (
              <span key={w.blueprintId} className="q-badge q-badge-neutral">
                {wName} <button type="button" className="q-btn-ghost" style={{ padding: '0 0 0 6px' }} onClick={() => removeWorkflow(s.id, w.blueprintId)}>×</button>
              </span>
            );
          })}
        </div>
        <div className="q-row">
          <select
            className="q-select" value={newWorkflowId[s.id] || ''}
            onChange={(e) => setNewWorkflowId((prev) => ({ ...prev, [s.id]: e.target.value }))}
            style={{ minWidth: '12rem' }}
          >
            <option value="">Select a workflow...</option>
            {allWorkflows.filter((x) => !mine.some((w) => w.blueprintId === x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <button type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => addWorkflow(s.id, newWorkflowId[s.id] || '')} disabled={!newWorkflowId[s.id]}>+ Add</button>
        </div>
      </div>
    );
  };

  return (
    <div className="q-stack q-stack-lg">
      <div className="q-card q-section">
        <h2 className="q-section-title">1. Package Identity</h2>
        <div className="q-stack q-stack-md">
          <div className="q-field">
            <label className="q-label">Name</label>
            <input className="q-input" value={effectiveName}
              onFocus={() => { if (!nameTouched) setName(composed); }}
              onChange={(e) => { setNameTouched(true); setName(e.target.value); }} />
            <span className="q-meta-sm">{nameTouched ? 'Your own name.' : 'Composed from what you bundled above — type here to give it a name of your own.'}</span>
          </div>
          <div className="q-field">
            <label className="q-label">Description</label>
            <textarea className="q-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the client gets. Shown on the booking page." />
          </div>
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">2. What it bundles</h2>
        <p className="q-meta" style={{ marginBottom: '16px' }}>Pick the real Services this offering is built from. Once selected, configure their specifics below.</p>
        <div className="q-grid-cards">
          {allServices.map((s) => {
            const isSelected = serviceIds.includes(s.id);
            const allTags = (s.dimensions || []).flatMap((d) => d.values);
            const vars = allVariables.filter(v => v.serviceId === s.id);
            return (
              <div 
                key={s.id} 
                className={`q-card q-stack`} 
                style={{ 
                  borderColor: isSelected ? 'var(--q-color-primary)' : 'var(--q-color-ink-100)',
                  backgroundColor: isSelected ? 'var(--q-color-primary-light)' : undefined,
                  transition: 'all var(--q-ease) 0.2s',
                  padding: '16px',
                  cursor: 'pointer'
                }}
                onClick={() => toggleService(s.id)}
              >
                <div className="q-row q-row-between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <h3 className="q-section-title">{s.name}</h3>
                    <div className="q-meta-sm">{s.domain?.name || 'No domain'}</div>
                  </div>
                  <input type="checkbox" checked={isSelected} readOnly style={{ pointerEvents: 'none', marginTop: '4px' }} />
                </div>
                
                {s.description && <p className="q-meta-sm" style={{ marginTop: '4px' }}>{s.description}</p>}
                
                <div className="q-stack q-stack-sm" style={{ marginTop: '12px', opacity: isSelected ? 1 : 0.6, transition: 'opacity 0.2s' }}>
                  {allTags.length > 0 && (
                    <div className="q-row" style={{ flexWrap: 'wrap', gap: '4px' }}>
                      {allTags.map(t => (
                        <span key={t.id} className="q-badge q-badge-neutral" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{t.name}</span>
                      ))}
                    </div>
                  )}
                  {(s.deliverables || []).length > 0 && (
                    <div className="q-meta-sm">
                      <strong className="q-strong">Outputs: </strong>
                      {(s.deliverables || []).map(d => d.name).join(', ')}
                    </div>
                  )}
                  {vars.length > 0 && (
                    <div className="q-meta-sm">
                      <strong className="q-strong">Variables: </strong>
                      {vars.map(v => v.label).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {allServices.length === 0 && <p className="q-empty">No services yet — create one first.</p>}
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">3. Classifications</h2>
        <div className="q-stack q-stack-md">
          {(() => {
            const bundledServices = allServices.filter(s => serviceIds.includes(s.id));
            if (bundledServices.length === 0) return <p className="q-empty">Select services above to narrow their classifications.</p>;
            const withDims = bundledServices.filter(s => (s.domain?.name && (dimensionsByDomain[s.domain.name] || []).length > 0));
            if (withDims.length === 0) return <p className="q-meta-sm">None of the bundled services have classifications.</p>;
            return withDims.map((s) => {
              const domainDims = s.domain?.name ? dimensionsByDomain[s.domain.name] || [] : [];
              return (
                <div key={s.id} style={{ marginBottom: '16px' }}>
                  <h3 className="q-strong" style={{ marginBottom: '8px' }}>For {s.name}</h3>
                  <div className="q-grid-cards">
                    {domainDims.map((d: any) => renderDimension({ ...d, domainName: s.domain?.name || '' }, s.id))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">4. Variables</h2>
        
        <div className="q-stack q-stack-md">
          {(() => {
            const bundledServices = allServices.filter(s => serviceIds.includes(s.id));
            if (bundledServices.length === 0) return <p className="q-empty">Select services above to see their variables.</p>;
            const withVars = bundledServices.filter(s => allVariables.some(v => v.serviceId === s.id));
            if (withVars.length === 0) return <p className="q-meta-sm">None of the bundled services have variables.</p>;
            return withVars.map((s) => (
              <div key={s.id} style={{ marginBottom: '16px' }}>
                <h3 className="q-strong" style={{ marginBottom: '8px' }}>For {s.name}</h3>
                {renderVariables(s)}
              </div>
            ));
          })()}
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">5. Delivery</h2>
        
        <div className="q-stack q-stack-md">
          {(() => {
            const bundledServices = allServices.filter(s => serviceIds.includes(s.id));
            if (bundledServices.length === 0) return <p className="q-empty">Select services above to configure what they deliver.</p>;
            return bundledServices.map((s) => (
              <div key={s.id} style={{ marginBottom: '16px' }}>
                <h3 className="q-strong" style={{ marginBottom: '8px' }}>From {s.name}</h3>
                {renderPromises(s)}
              </div>
            ));
          })()}

          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--q-color-border)' }}>
            <h3 className="q-strong" style={{ marginBottom: '8px' }}>Delivery Vessels</h3>
            <span className="q-meta-sm" style={{ display: 'block', marginBottom: '16px', opacity: 0.7 }}>
              How the final outputs are delivered to the client.
            </span>
            <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
              {containers.map(id => {
                const c = allContainers.find(x => x.id === id);
                return (
                  <span key={id} className="q-badge q-badge-neutral" style={{ cursor: 'pointer' }} onClick={() => removeContainer(id)}>
                    {c?.name || id} &times;
                  </span>
                );
              })}
            </div>
            <div className="q-row" style={{ marginTop: '12px' }}>
              <select
                className="q-select"
                value={newContainerId}
                onChange={(e) => setNewContainerId(e.target.value)}
                style={{ minWidth: '12rem' }}
                disabled={isPending}
              >
                <option value="">Select a container...</option>
                {allContainers.filter(x => !containers.includes(x.id)).map(x => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="q-btn q-btn-secondary q-btn-xs"
                onClick={() => addContainer(newContainerId)}
                disabled={!newContainerId || isPending}
              >
                + Add
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="q-card q-section">
        <h2 className="q-section-title">6. Workflows</h2>
        
        <div className="q-stack q-stack-md">
          {(() => {
            const bundledServices = allServices.filter(s => serviceIds.includes(s.id));
            if (bundledServices.length === 0) return <p className="q-empty">Select services above to configure how they are produced.</p>;
            return bundledServices.map((s) => (
              <div key={s.id} style={{ marginBottom: '16px' }}>
                <h3 className="q-strong" style={{ marginBottom: '8px' }}>For {s.name}</h3>
                {renderWorkflows(s)}
              </div>
            ));
          })()}

        </div>
      </div>

      {!hideControls && (
        <>
          <div className="q-row">
            {mode === 'create' ? (
              <button className="q-btn q-btn-primary" disabled={isPending} onClick={submitCreate}>{isPending ? 'Creating…' : 'Create package'}</button>
            ) : (
              <>
                <button className="q-btn q-btn-primary" disabled={isPending} onClick={submit}>{isPending ? 'Saving…' : 'Save changes'}</button>
                <button className="q-btn q-btn-secondary" disabled={isPending} onClick={() => router.push(`/packages/${packageId}`)}>Cancel</button>
                <button type="button" className="q-btn q-btn-secondary" disabled={isPending}
                  onClick={() => startTransition(async () => {
                    try { const { packageId: copyId } = await duplicatePackage(packageId!); router.push(`/packages/${copyId}`); }
                    catch (e: any) { alert(e?.message || 'Failed to duplicate the package.'); }
                  })}>
                  Duplicate
                </button>
                <span className="q-spacer" />
                <button type="button" className="q-btn q-btn-secondary" disabled={isPending}
                  onClick={() => startTransition(async () => {
                    try { await setPackageStatus({ packageId: packageId!, status: retired ? 'active' : 'retired' }); router.refresh(); }
                    catch (e: any) { alert(e?.message || 'Something went wrong.'); }
                  })}>
                  {retired ? 'Make sellable again' : 'Retire this package'}
                </button>
              </>
            )}
          </div>
          {mode === 'edit' && (
            retired ? (
              <div className="q-note q-note-warn"><span className="q-meta-plain">Retired — it won&rsquo;t appear when adding services to a booking.</span></div>
            ) : (
              <span className="q-meta-sm">Retiring hides it from new bookings. Past bookings keep their line and price — nothing is deleted.</span>
            )
          )}
        </>
      )}
    </div>
  );
});
