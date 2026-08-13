'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPackage, updatePackage, setPackageStatus, duplicatePackage } from '@/modules/packages/interface';
import type { PaymentPolicy, PricingVariant } from '@/modules/packages/interface';
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
  allDeliverables,
  allContainers,
  allWorkflows,
  suggestedDeliverablesByService,
  dimensionsByDomain,
  roleOptions,
  initial,
}: {
  mode: 'create' | 'edit';
  packageId?: string;
  status?: string;
  currencyCode: string;
  allServices: ServiceOption[];
  allDeliverables: { id: string; name: string }[];
  allContainers: { id: string; name: string }[];
  allWorkflows: { id: string; name: string }[];
  suggestedDeliverablesByService: Record<string, string[]>;
  /** Domain name → the dimensions it classifies by. A package may draw on several. */
  dimensionsByDomain: Record<string, { id: string; name: string; values: { id: string; name: string }[] }[]>;
  roleOptions: string[];
  initial: {
    name?: string;
    description?: string | null;
    basePrice?: number | null;
    priceUnit?: string | null;
    paymentPolicy?: PaymentPolicy | null;
    depositPercentage?: number | null;
    durationMinutes?: number | null;
    serviceIds?: string[];
    deliverableIds?: string[];
    containerIds?: string[];
    workflowIds?: string[];
    dimensionValueIds?: string[];
    pricingVariant?: PricingVariant | null;
    extraStages?: Stage[];
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
  
  const [deliverables, setDeliverables] = useState<string[]>(initial.deliverableIds || []);
  const [newDeliverableId, setNewDeliverableId] = useState('');
  
  const [containers, setContainers] = useState<string[]>(initial.containerIds || []);
  const [newContainerId, setNewContainerId] = useState('');
  
  const [workflows, setWorkflows] = useState<string[]>(initial.workflowIds || []);
  const [newWorkflowId, setNewWorkflowId] = useState('');

  /*
   * How this package is classified — dimension_value ids, flat.
   *
   * A package selects; it never redefines. There is no free-text escape here on
   * purpose: inventing a value is an act on a domain's vocabulary, which
   * belongs to the service layer. What a package can say is drawn from what it
   * bundles.
   */
  const [dimensionValueIds, setDimensionValueIds] = useState<string[]>(initial.dimensionValueIds || []);
  const [pendingValue, setPendingValue] = useState<Record<string, string>>({});

  const [hasVariant, setHasVariant] = useState(!!initial.pricingVariant);
  const [axisLabel, setAxisLabel] = useState(initial.pricingVariant?.axisLabel ?? '');
  const [tiers, setTiers] = useState<Tier[]>((initial.pricingVariant?.tiers || []).map((t) => ({ label: t.label, price: String(t.price) })));
  const [extraStages, setExtraStages] = useState<Stage[]>(initial.extraStages || []);

  const bundledNames = allServices.filter((s) => serviceIds.includes(s.id)).map((s) => s.name);
  const composed = bundledNames.join(' + ') || 'Untitled package';

  /*
   * What this package can be classified by, derived from what it bundles.
   *
   * Not a separate setting: a package's vocabulary is the union of its bundled
   * services' domains. Bundle Photography and it can be filed under
   * Photography's questions; bundle Photography and Printing and it gets both,
   * which is exactly what a cross-domain package means. Before anything is
   * bundled there is nothing to narrow by, so everything is offered.
   */
  const bundledDomains = [...new Set(
    allServices.filter((s) => serviceIds.includes(s.id)).map((s) => s.domain?.name).filter(Boolean)
  )] as string[];
  const availableDimensions: DimensionOption[] = Object.entries(dimensionsByDomain)
    .filter(([domainName]) => bundledDomains.length === 0 || bundledDomains.includes(domainName))
    .flatMap(([domainName, dims]) => dims.map((d) => ({ ...d, domainName })));
  const effectiveName = nameTouched ? name : composed;

  // The union of Deliverables that the currently selected Services typically produce.
  const suggestedDeliverables = [...new Set(serviceIds.flatMap(sid => suggestedDeliverablesByService[sid] || []))]
    .filter(d => !deliverables.includes(d));

  const toggleService = (id: string) => setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const addDeliverable = (id: string) => { if (id && !deliverables.includes(id)) setDeliverables(d => [...d, id]); setNewDeliverableId(''); };
  const removeDeliverable = (id: string) => setDeliverables(d => d.filter(x => x !== id));
  
  const addContainer = (id: string) => { if (id && !containers.includes(id)) setContainers(d => [...d, id]); setNewContainerId(''); };
  const removeContainer = (id: string) => setContainers(d => d.filter(x => x !== id));
  
  const addWorkflow = (id: string) => { if (id && !workflows.includes(id)) setWorkflows(d => [...d, id]); setNewWorkflowId(''); };
  const removeWorkflow = (id: string) => setWorkflows(d => d.filter(x => x !== id));

  const addTier = () => setTiers((t) => [...t, { label: '', price: '' }]);
  const patchTier = (i: number, updates: Partial<Tier>) => setTiers((t) => t.map((row, idx) => (idx === i ? { ...row, ...updates } : row)));
  const removeTier = (i: number) => setTiers((t) => t.filter((_, idx) => idx !== i));

  const addStage = () => setExtraStages((s) => [...s, { name: '', roleName: '', frontStage: true }]);
  const patchStage = (i: number, updates: Partial<Stage>) => setExtraStages((s) => s.map((row, idx) => (idx === i ? { ...row, ...updates } : row)));
  const removeStage = (i: number) => setExtraStages((s) => s.filter((_, idx) => idx !== i));

  const buildPayload = () => ({
    name: effectiveName,
    description: description.trim() || null,
    basePrice: hasPrice ? (price === '' ? 0 : parseFloat(price)) : null,
    priceUnit: unit.trim() || null,
    paymentPolicy: hasPolicy ? policy : null,
    depositPercentage: policy === 'deposit' ? (deposit === '' ? 0 : parseInt(deposit, 10)) : null,
    durationMinutes: duration > 0 ? duration : null,
    serviceIds,
    deliverableIds: deliverables,
    containerIds: containers,
    workflowIds: workflows,
    dimensionValueIds,
    pricingVariant: (hasVariant && axisLabel.trim() && tiers.some((t) => t.label.trim()))
      ? { axisLabel: axisLabel.trim(), tiers: tiers.filter((t) => t.label.trim()).map((t) => ({ label: t.label.trim(), price: parseFloat(t.price) || 0 })) }
      : null,
    extraStages: extraStages.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), roleName: s.roleName.trim() || null, frontStage: s.frontStage })),
  });

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

  const renderDimension = (dim: DimensionOption) => {
    const chosen = dimensionValueIds.filter((id) => dim.values.some((v) => v.id === id));
    const add = (id: string) => {
      if (id && !dimensionValueIds.includes(id)) setDimensionValueIds((prev) => [...prev, id]);
      setPendingValue((prev) => ({ ...prev, [dim.id]: '' }));
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
                {name} <button className="q-btn-ghost" style={{ padding: '0 0 0 6px' }} onClick={() => setDimensionValueIds((prev) => prev.filter((x) => x !== id))}>×</button>
              </span>
            );
          })}
        </div>
        <div className="q-row">
          <select
            className="q-select"
            value={pendingValue[dim.id] || ''}
            onChange={(e) => setPendingValue((prev) => ({ ...prev, [dim.id]: e.target.value }))}
            style={{ minWidth: '12rem' }}
          >
            <option value="">Select...</option>
            {dim.values.filter((v) => !dimensionValueIds.includes(v.id)).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => add(pendingValue[dim.id] || '')} disabled={!pendingValue[dim.id]}>+ Add</button>
        </div>
      </div>
    );
  };

  return (
    <div className="q-stack q-stack-lg">
      <div className="q-card q-section">
        <h2 className="q-section-title">What it bundles</h2>
        <p className="q-meta" style={{ marginBottom: '12px' }}>Pick the real Services this offering is built from — one, or several.</p>
        <div className="q-grid-cards">
          {allServices.map((s) => {
            const isSelected = serviceIds.includes(s.id);
            const allTags = (s.dimensions || []).flatMap((d) => d.values);
            return (
              <div 
                key={s.id} 
                className={`q-card q-stack`} 
                onClick={() => toggleService(s.id)} 
                style={{ 
                  cursor: 'pointer', 
                  borderColor: isSelected ? 'var(--q-color-primary)' : 'var(--q-color-ink-100)',
                  backgroundColor: isSelected ? 'var(--q-color-primary-light)' : undefined,
                  transition: 'all var(--q-ease) 0.2s'
                }}
              >
                <div className="q-row q-row-between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <h3 className="q-section-title">{s.name}</h3>
                    <div className="q-meta-sm">{s.domain?.name || 'No domain'}</div>
                  </div>
                  <input type="checkbox" checked={isSelected} readOnly style={{ pointerEvents: 'none', marginTop: '4px' }} />
                </div>
                {s.description && <p className="q-meta-sm" style={{ marginTop: '4px' }}>{s.description}</p>}
                
                <div style={{ marginTop: '8px' }}>
                  {s.deliverables && s.deliverables.length > 0 && (
                    <div className="q-meta-sm" style={{ marginBottom: '4px' }}>
                      <strong>Produces:</strong> {s.deliverables.map(d => d.name).join(', ')}
                    </div>
                  )}
                  {allTags.length > 0 && (
                    <div className="q-row" style={{ flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                      {allTags.map(t => (
                        <span key={t.id} className="q-badge q-badge-neutral" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{t.name}</span>
                      ))}
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
        <h2 className="q-section-title">What it is</h2>
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
          
          {availableDimensions.length > 0 && (
            <>
              <span className="q-meta-sm" style={{ opacity: 0.7 }}>
                {bundledDomains.length > 0
                  ? `Classified in the vocabulary of ${bundledDomains.join(' and ')} — what this package bundles is what it can be filed under.`
                  : 'Bundle a service above and this narrows to that domain’s own vocabulary.'}
              </span>
              <div className="q-grid-2">
                {availableDimensions.map(renderDimension)}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">Price</h2>
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
                  <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => removeTier(i)}>Remove</button>
                </div>
              ))}
              <button className="q-btn q-btn-secondary q-btn-xs" onClick={addTier} style={{ alignSelf: 'flex-start' }}>+ Add tier</button>
            </div>
          )}
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">Delivery & Deliverables</h2>
        <p className="q-meta" style={{ marginBottom: '12px' }}>What this Package explicitly promises to deliver to the client.</p>
        
        <div className="q-stack q-stack-md">
          <div>
            <label className="q-label">Deliverables (Assets)</label>
            <div className="q-row" style={{ flexWrap: 'wrap', marginBottom: deliverables.length > 0 ? '8px' : '0' }}>
              {deliverables.map((dId) => {
                const dName = allDeliverables.find(d => d.id === dId)?.name || dId;
                return (
                  <span key={dId} className="q-badge q-badge-neutral">
                    {dName} <button className="q-btn-ghost" style={{ padding: '0 0 0 6px' }} onClick={() => removeDeliverable(dId)}>×</button>
                  </span>
                );
              })}
            </div>
            <div className="q-row">
              <select className="q-select" value={newDeliverableId} onChange={(e) => setNewDeliverableId(e.target.value)} style={{ minWidth: '12rem' }}>
                <option value="">Select an output...</option>
                {allDeliverables.filter(d => !deliverables.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => addDeliverable(newDeliverableId)} disabled={!newDeliverableId}>+ Add</button>
            </div>
            {suggestedDeliverables.length > 0 && (
              <div className="q-row" style={{ flexWrap: 'wrap', marginTop: '8px', alignItems: 'center' }}>
                <span className="q-meta-sm">Suggested from bundled services:</span>
                {suggestedDeliverables.map((dId) => {
                  const dName = allDeliverables.find(d => d.id === dId)?.name || dId;
                  return (
                    <button key={dId} type="button" className="q-btn q-btn-secondary q-btn-xs" onClick={() => addDeliverable(dId)}>+ {dName}</button>
                  );
                })}
              </div>
            )}
          </div>
          
          <div>
            <label className="q-label">Delivery Containers</label>
            <span className="q-meta-sm">How these deliverables are handed to the client (e.g. Online Gallery, USB Drive)</span>
            <div className="q-row" style={{ flexWrap: 'wrap', marginBottom: containers.length > 0 ? '8px' : '0', marginTop: '4px' }}>
              {containers.map((dId) => {
                const dName = allContainers.find(d => d.id === dId)?.name || dId;
                return (
                  <span key={dId} className="q-badge q-badge-neutral">
                    {dName} <button className="q-btn-ghost" style={{ padding: '0 0 0 6px' }} onClick={() => removeContainer(dId)}>×</button>
                  </span>
                );
              })}
            </div>
            <div className="q-row">
              <select className="q-select" value={newContainerId} onChange={(e) => setNewContainerId(e.target.value)} style={{ minWidth: '12rem' }}>
                <option value="">Select a container...</option>
                {allContainers.filter(d => !containers.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => addContainer(newContainerId)} disabled={!newContainerId}>+ Add</button>
            </div>
          </div>
        </div>
      </div>

      <div className="q-card q-section">
        <h2 className="q-section-title">Timing &amp; Workflows</h2>
        <div className="q-field">
          <label className="q-label">Usually takes</label>
          <select className="q-select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATION_CHOICES.map((d) => <option key={d.minutes} value={d.minutes}>{d.label}</option>)}
          </select>
        </div>
        
        <div className="q-stack q-stack-md" style={{ marginTop: '16px' }}>
          <div>
            <label className="q-label">Production Workflows (Blueprints)</label>
            <p className="q-meta" style={{ marginBottom: '8px' }}>
              The standard sequences of stages to run for this package. (e.g., Post-Production Workflow)
            </p>
            <div className="q-row" style={{ flexWrap: 'wrap', marginBottom: workflows.length > 0 ? '8px' : '0' }}>
              {workflows.map((dId) => {
                const dName = allWorkflows.find(d => d.id === dId)?.name || dId;
                return (
                  <span key={dId} className="q-badge q-badge-neutral">
                    {dName} <button className="q-btn-ghost" style={{ padding: '0 0 0 6px' }} onClick={() => removeWorkflow(dId)}>×</button>
                  </span>
                );
              })}
            </div>
            <div className="q-row">
              <select className="q-select" value={newWorkflowId} onChange={(e) => setNewWorkflowId(e.target.value)} style={{ minWidth: '12rem' }}>
                <option value="">Select a workflow...</option>
                {allWorkflows.filter(d => !workflows.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => addWorkflow(newWorkflowId)} disabled={!newWorkflowId}>+ Add</button>
            </div>
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
                  <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => removeStage(i)}>Remove</button>
                </div>
              ))}
              <datalist id="role-options">{roleOptions.map((r) => <option key={r} value={r} />)}</datalist>
              <button className="q-btn q-btn-secondary q-btn-xs" onClick={addStage} style={{ alignSelf: 'flex-start' }}>+ Add stage</button>
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
            <button className="q-btn q-btn-secondary" disabled={isPending}
              onClick={() => startTransition(async () => {
                try { const { packageId: copyId } = await duplicatePackage(packageId!); router.push(`/packages/${copyId}`); }
                catch (e: any) { alert(e?.message || 'Failed to duplicate the package.'); }
              })}>
              Duplicate
            </button>
            <span className="q-spacer" />
            <button className="q-btn q-btn-secondary" disabled={isPending}
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
