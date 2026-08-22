'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPackage, updatePackage, setPackageStatus, duplicatePackage } from '@/modules/packages/interface';
import type { PaymentPolicy, PricingVariant } from '@/modules/packages/interface';
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
};

/** A dimension a package can be classified by, and the domain that owns it. */
type DimensionOption = {
  id: string;
  name: string;
  domainName: string;
  values: { id: string; name: string }[];
};
type Tier = { label: string; price: string };
type Stage = { name: string; roleName: string; frontStage: boolean };

/**
 * One thing this package promises, and the bundled service that produces it.
 *
 * The service is part of the promise rather than looked up from it. A package
 * bundling Photography and Framing promises prints through Framing; without the
 * pairing, "20 prints" floats free of anything that makes them.
 */
type Promise_ = { serviceId: string; deliverableId: string; quantity: number | null; unit: string | null; spec: string | null };

import type { ServiceVariable } from '@/modules/services/interface';

/**
 * A Package is a commercial construct — it bundles one or more real
 * Services (asked of the Services module, never invented here) into a
 * single priced offering. Its routing is the union of every bundled
 * Service's Process, plus whatever this specific offering adds on its own.
 */
export function PackageFieldsEditor({
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
    basePrice?: number | null;
    priceUnit?: string | null;
    paymentPolicy?: PaymentPolicy | null;
    depositPercentage?: number | null;
    durationMinutes?: number | null;
    serviceIds?: string[];
    /** What the package promises, each on the bundled service that produces it. */
    deliverables?: Promise_[];
    containerIds?: string[];
    /** The production sequences to run, each on the bundled service it belongs to. */
    workflows?: { serviceId: string; blueprintId: string }[];
    /** Each value paired with the bundled service this package narrows to it. */
    narrowings?: { serviceId: string; valueId: string }[];
    pricingVariant?: PricingVariant | null;
    extraStages?: Stage[];
    variableValues?: { serviceVariableId: string; value: unknown }[];
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [nameTouched, setNameTouched] = useState(!!initial.name);
  const [name, setName] = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [serviceIds, setServiceIds] = useState<string[]>(initial.serviceIds || []);
  const [hasPrice, setHasPrice] = useState(initial.basePrice != null);
  const [price, setPrice] = useState(String(initial.basePrice ?? ''));
  const [unit, setUnit] = useState(initial.priceUnit ?? '');
  const [hasPolicy, setHasPolicy] = useState(!!initial.paymentPolicy);
  const [policy, setPolicy] = useState<PaymentPolicy>(initial.paymentPolicy ?? 'deposit');
  const [deposit, setDeposit] = useState(String(initial.depositPercentage ?? 0));
  const [duration, setDuration] = useState(initial.durationMinutes ?? 0);
  
  /*
   * What this package promises, and how much of it, in what unit, to what spec.
   *
   * A service says the KIND — edited photographs. Only a package says six of
   * them, or thirty seconds, or 20x30. Held against the service that produces
   * it, so a package promising prints has to bundle something that prints.
   */
  const [promises, setPromises] = useState<Promise_[]>(initial.deliverables || []);
  const [newDeliverableId, setNewDeliverableId] = useState<Record<string, string>>({});

  const promisesFor = (sid: string) => promises.filter((p) => p.serviceId === sid);
  const addPromise = (sid: string, deliverableId: string) => {
    if (!deliverableId) return;
    setPromises((prev) => prev.some((p) => p.serviceId === sid && p.deliverableId === deliverableId)
      ? prev
      : [...prev, { serviceId: sid, deliverableId, quantity: null, unit: null, spec: null }]);
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

  const [hasVariant, setHasVariant] = useState(!!initial.pricingVariant);
  const [axisLabel, setAxisLabel] = useState(initial.pricingVariant?.axisLabel ?? '');
  const [tiers, setTiers] = useState<Tier[]>((initial.pricingVariant?.tiers || []).map((t) => ({ label: t.label, price: String(t.price) })));
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
        const produces = addedService?.deliverables || [];
        if (produces.length > 0) {
          setPromises((prev) => [
            ...prev,
            ...produces
              .filter((d) => !prev.some((p) => p.serviceId === id && p.deliverableId === d.id))
              .map((d) => ({ serviceId: id, deliverableId: d.id, quantity: null, unit: null, spec: null })),
          ]);
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

  const addTier = () => setTiers((t) => [...t, { label: '', price: '' }]);
  const patchTier = (i: number, updates: Partial<Tier>) => setTiers((t) => t.map((row, idx) => (idx === i ? { ...row, ...updates } : row)));
  const removeTier = (i: number) => setTiers((t) => t.filter((_, idx) => idx !== i));

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
      basePrice: hasPrice ? (price === '' ? 0 : parseFloat(price)) : null,
      priceUnit: unit.trim() || null,
      paymentPolicy: hasPolicy ? policy : null,
      depositPercentage: policy === 'deposit' ? (deposit === '' ? 0 : parseInt(deposit, 10)) : null,
      durationMinutes: duration > 0 ? duration : null,
      serviceIds,
      // Everything below is filtered to services still bundled, so deselecting
      // one cannot leave a link behind that the server would then reject.
      deliverables: promises.filter((p) => serviceIds.includes(p.serviceId)),
      containerIds: containers,
      workflows: workflows.filter((w) => serviceIds.includes(w.serviceId)),
      narrowings: serviceIds.flatMap((sid) =>
        (narrowings[sid] || []).map((valueId) => ({ serviceId: sid, valueId }))
      ),
      pricingVariant: (hasVariant && axisLabel.trim() && tiers.some((t) => t.label.trim()))
        ? { axisLabel: axisLabel.trim(), tiers: tiers.filter((t) => t.label.trim()).map((t) => ({ label: t.label.trim(), price: parseFloat(t.price) || 0 })) }
        : null,
      extraStages: extraStages.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), roleName: s.roleName.trim() || null, frontStage: s.frontStage })),
      variableValues: payloadVariableValues,
    };
  };

  const submit = () => {
    if (packageId) startTransition(async () => {
      try { 
        await updatePackage({ packageId, ...buildPayload() }); 
        router.refresh(); 
        router.push(`/packages/${packageId}`);
      }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });
  };
  const submitCreate = () => startTransition(async () => {
    try { const { packageId: newId } = await createPackage(buildPayload()); router.push(`/packages/${newId}`); }
    catch (e: any) { alert(e?.message || 'Failed to create the package.'); }
  });

  const retired = status === 'retired';

  const renderDimension = (dim: DimensionOption, serviceId: string) => {
    const forService = narrowings[serviceId] || [];
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
        <span className="q-meta-sm" style={{ display: 'block', opacity: 0.7 }}>{dim.domainName}</span>
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
  const renderPromises = (s: ServiceOption) => {
    const mine = promisesFor(s.id);
    const produces = s.deliverables || [];
    const suggested = produces.filter((d) => !mine.some((p) => p.deliverableId === d.id));
    return (
      <div className="q-stack q-stack-sm">
        <h4 className="q-strong">Promises</h4>
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
                <input
                  className="q-input q-input-sm" placeholder="Unit — image, second, page"
                  value={p.unit ?? ''}
                  onChange={(e) => patchPromise(s.id, p.deliverableId, { unit: e.target.value || null })}
                  style={{ maxWidth: '13rem' }}
                />
                <input
                  className="q-input q-input-sm" placeholder="Specification — 20x30, matte"
                  value={p.spec ?? ''}
                  onChange={(e) => patchPromise(s.id, p.deliverableId, { spec: e.target.value || null })}
                  style={{ minWidth: '12rem', flex: 1 }}
                />
              </div>
              <span className="q-meta-sm" style={{ opacity: 0.8 }}>
                Appears as: {formatDeliverable({ name: dName, quantity: p.quantity, unit: p.unit, spec: p.spec })}
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

        <div className="q-row">
          <select
            className="q-select" value={newDeliverableId[s.id] || ''}
            onChange={(e) => setNewDeliverableId((prev) => ({ ...prev, [s.id]: e.target.value }))}
            style={{ minWidth: '12rem' }}
          >
            <option value="">Select an output type</option>
            {allDeliverables.filter((d) => !mine.some((p) => p.deliverableId === d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => addPromise(s.id, newDeliverableId[s.id] || '')} disabled={!newDeliverableId[s.id]}>+ Add</button>
        </div>
      </div>
    );
  };

  /** The production sequences to run for this bundled service. */
  const renderWorkflows = (s: ServiceOption) => {
    const mine = workflowsFor(s.id);
    return (
      <div className="q-stack q-stack-sm">
        <h4 className="q-strong">Production</h4>
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
        <h2 className="q-section-title">1. What it bundles</h2>
        <p className="q-meta" style={{ marginBottom: '12px' }}>Pick the real Services this offering is built from. Once selected, configure their specifics below.</p>
        <div className="q-stack q-stack-md">
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
                  padding: '16px'
                }}
              >
                <div className="q-row q-row-between" style={{ alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => toggleService(s.id)}>
                  <div>
                    <h3 className="q-section-title">{s.name}</h3>
                    <div className="q-meta-sm">{s.domain?.name || 'No domain'}</div>
                    {s.description && !isSelected && <p className="q-meta-sm" style={{ marginTop: '4px' }}>{s.description}</p>}
                    {!isSelected && allTags.length > 0 && (
                      <div className="q-row" style={{ flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                        {allTags.map(t => (
                          <span key={t.id} className="q-badge q-badge-neutral" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{t.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <input type="checkbox" checked={isSelected} readOnly style={{ pointerEvents: 'none', marginTop: '4px' }} />
                </div>
                
                {isSelected && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--q-color-ink-100)' }}>
                    {s.description && <p className="q-meta-sm" style={{ marginBottom: '16px' }}>{s.description}</p>}
                    <div className="q-grid-cards">
                      {s.dimensions && s.dimensions.length > 0 && (
                        <div className="q-stack q-stack-sm">
                          <h4 className="q-strong">Classifications</h4>
                          {s.dimensions.map(d => renderDimension({ ...d, domainName: s.domain?.name || '' }, s.id))}
                        </div>
                      )}
                      
                      {vars.length > 0 && (
                        <div className="q-stack q-stack-sm">
                          <h4 className="q-strong">Variables to fix</h4>
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
                                      {v.options.map((o) => <option key={o} value={o}>{o}</option>)}
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
                                  {current !== '' && (
                                    <button type="button" className="q-btn q-btn-secondary q-btn-xs" disabled={isPending} onClick={() => setVariable(v.id, '')}>Clear</button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {renderPromises(s)}
                      {renderWorkflows(s)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {allServices.length === 0 && <p className="q-empty">No services yet — create one first.</p>}
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">2. Package Identity</h2>
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
        <h2 className="q-section-title">3. Price</h2>
        <label className="q-row q-meta-plain" style={{ gap: '8px', marginBottom: '12px' }}>
          <input type="checkbox" checked={hasPrice} onChange={(e) => setHasPrice(e.target.checked)} />
          This package has a price
        </label>
        {hasPrice && (
          <div className="q-stack q-stack-md">
            <div className="q-grid-3">
              <div className="q-field">
                <label className="q-label">Base price ({currencyCode})</label>
                <input className="q-input" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="q-field">
                <label className="q-label">Priced per</label>
                <input className="q-input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="flat price" list="unit-suggestions" />
                <datalist id="unit-suggestions"><option value="hour" /><option value="day" /><option value="person" /></datalist>
              </div>
            </div>
            <label className="q-row q-meta-plain" style={{ gap: '8px' }}>
              <input type="checkbox" checked={hasPolicy} onChange={(e) => setHasPolicy(e.target.checked)} />
              Decide payment policy now (deposit or full)
            </label>
            {hasPolicy && (
               <div className="q-grid-3">
                 <div className="q-field">
                   <label className="q-label">Payment</label>
                   <select className="q-select" value={policy} onChange={(e) => setPolicy(e.target.value as PaymentPolicy)}>
                     <option value="deposit">Deposit required</option>
                     <option value="full">Full payment required</option>
                   </select>
                 </div>
                 {policy === 'deposit' && (
                   <div className="q-field">
                     <label className="q-label">Deposit (%)</label>
                     <input className="q-input" type="number" min="0" max="100" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
                   </div>
                 )}
               </div>
            )}
          </div>
        )}

        <div className="q-stack q-stack-md" style={{ marginTop: '16px' }}>
          <label className="q-row q-meta-plain" style={{ gap: '8px' }}>
            <input type="checkbox" checked={hasVariant} onChange={(e) => setHasVariant(e.target.checked)} />
            Price varies by scope (outfits, hours, locations…)
          </label>
          {hasVariant && (
            <div className="q-stack q-stack-sm">
              <div className="q-field" style={{ maxWidth: '16rem' }}>
                <label className="q-label">What varies</label>
                <input className="q-input" value={axisLabel} onChange={(e) => setAxisLabel(e.target.value)} placeholder="e.g. Outfits" />
              </div>
              {tiers.map((t, i) => (
                <div key={i} className="q-row">
                  <input className="q-input q-fill" placeholder="e.g. 2 outfits" value={t.label} onChange={(e) => patchTier(i, { label: e.target.value })} />
                  <span className="q-meta-sm">{currencyCode}</span>
                  <input className="q-input" type="number" min="0" step="0.01" style={{ width: '8rem' }} value={t.price} onChange={(e) => patchTier(i, { price: e.target.value })} />
                  <button type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => removeTier(i)}>Remove</button>
                </div>
              ))}
              <button type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={addTier} style={{ alignSelf: 'flex-start' }}>+ Add tier</button>
            </div>
          )}
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">4. Delivery & Workflows</h2>
        
        <div className="q-stack q-stack-md">
          {/*
            * What the package promises, and how it is produced, are edited on
            * the service cards above — each is a fact about one bundled service,
            * so there is nothing to say about them at package level.
            *
            * A container is different, and stays here: it transports outputs
            * without transforming them, so it belongs to no single service.
            */}
          <div>
            <label className="q-label">Delivery Containers</label>
            <span className="q-meta-sm">How these deliverables are handed to the client (e.g. Online Gallery, USB Drive)</span>
            <div className="q-row" style={{ flexWrap: 'wrap', marginBottom: containers.length > 0 ? '8px' : '0', marginTop: '4px' }}>
              {containers.map((dId) => {
                const dName = allContainers.find(d => d.id === dId)?.name || dId;
                return (
                  <span key={dId} className="q-badge q-badge-neutral">
                    {dName} <button type="button" className="q-btn-ghost" style={{ padding: '0 0 0 6px' }} onClick={() => removeContainer(dId)}>×</button>
                  </span>
                );
              })}
            </div>
            <div className="q-row">
              <select className="q-select" value={newContainerId} onChange={(e) => setNewContainerId(e.target.value)} style={{ minWidth: '12rem' }}>
                <option value="">Select a container...</option>
                {allContainers.filter(d => !containers.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => addContainer(newContainerId)} disabled={!newContainerId}>+ Add</button>
            </div>
          </div>
          
          <div className="q-field">
            <label className="q-label">Usually takes</label>
            <select className="q-select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATION_CHOICES.map((d) => <option key={d.minutes} value={d.minutes}>{d.label}</option>)}
            </select>
          </div>
          
          <div>
            <label className="q-label">Ad-hoc stages</label>
            <p className="q-meta" style={{ marginBottom: '8px' }}>
              Add anything specific to this package on top of its standard workflows — a second photographer, drone coverage, etc.
            </p>
            <div className="q-stack q-stack-sm">
              {extraStages.map((s, i) => (
                <div key={i} className="q-row">
                  <input className="q-input q-fill" placeholder="Stage — e.g. Drone Coverage" value={s.name} onChange={(e) => patchStage(i, { name: e.target.value })} />
                  <input className="q-input" list="role-options" placeholder="Role (optional)" value={s.roleName} onChange={(e) => patchStage(i, { roleName: e.target.value })} style={{ width: '11rem' }} />
                  <label className="q-row q-meta-plain" style={{ gap: '4px' }}>
                    <input type="checkbox" checked={s.frontStage} onChange={(e) => patchStage(i, { frontStage: e.target.checked })} />
                    Front-stage
                  </label>
                  <button type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => removeStage(i)}>Remove</button>
                </div>
              ))}
              <datalist id="role-options">{roleOptions.map((r) => <option key={r} value={r} />)}</datalist>
              <button type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={addStage} style={{ alignSelf: 'flex-start' }}>+ Add stage</button>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
}
