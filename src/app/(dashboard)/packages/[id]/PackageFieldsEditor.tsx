'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPackage, updatePackage, setPackageStatus, duplicatePackage } from '@/modules/packages/interface';
import type { PaymentPolicy, PricingVariant } from '@/modules/packages/interface';
import { DURATION_CHOICES } from '@/kernel/currency';

type ServiceOption = { id: string; name: string; domain?: { name: string } | null };
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
  enabledDimensions,
  occasionOptions,
  contextOptions,
  subjectOptions,
  purposeOptions,
  clientTypeOptions,
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
  enabledDimensions: string[];
  occasionOptions: { id: string; name: string }[];
  contextOptions: { id: string; name: string }[];
  subjectOptions: { id: string; name: string }[];
  purposeOptions: { id: string; name: string }[];
  clientTypeOptions: { id: string; name: string }[];
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
    occasions?: string[];
    contexts?: string[];
    subjects?: string[];
    purposes?: string[];
    clientTypes?: string[];
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

  // Configuration schemas
  const [occasions, setOccasions] = useState<string[]>(initial.occasions || []);
  const [newOccasionId, setNewOccasionId] = useState('');
  const [contexts, setContexts] = useState<string[]>(initial.contexts || []);
  const [newContextId, setNewContextId] = useState('');
  const [subjects, setSubjects] = useState<string[]>(initial.subjects || []);
  const [newSubjectId, setNewSubjectId] = useState('');
  const [purposes, setPurposes] = useState<string[]>(initial.purposes || []);
  const [newPurposeId, setNewPurposeId] = useState('');
  const [clientTypes, setClientTypes] = useState<string[]>(initial.clientTypes || []);
  const [newClientTypeId, setNewClientTypeId] = useState('');

  const [hasVariant, setHasVariant] = useState(!!initial.pricingVariant);
  const [axisLabel, setAxisLabel] = useState(initial.pricingVariant?.axisLabel ?? '');
  const [tiers, setTiers] = useState<Tier[]>((initial.pricingVariant?.tiers || []).map((t) => ({ label: t.label, price: String(t.price) })));
  const [extraStages, setExtraStages] = useState<Stage[]>(initial.extraStages || []);

  const bundledNames = allServices.filter((s) => serviceIds.includes(s.id)).map((s) => s.name);
  const composed = bundledNames.join(' + ') || 'Untitled package';
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
    occasions,
    contexts,
    subjects,
    purposes,
    clientTypes,
    pricingVariant: (hasVariant && axisLabel.trim() && tiers.some((t) => t.label.trim()))
      ? { axisLabel: axisLabel.trim(), tiers: tiers.filter((t) => t.label.trim()).map((t) => ({ label: t.label.trim(), price: parseFloat(t.price) || 0 })) }
      : null,
    extraStages: extraStages.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), roleName: s.roleName.trim() || null, frontStage: s.frontStage })),
  });

  const submit = () => {
    if (packageId) startTransition(async () => {
      try { await updatePackage({ packageId, ...buildPayload() }); router.refresh(); }
      catch (e: any) { alert(e?.message || 'Something went wrong.'); }
    });
  };
  const submitCreate = () => startTransition(async () => {
    try { const { packageId: newId } = await createPackage(buildPayload()); router.push(`/packages/${newId}`); }
    catch (e: any) { alert(e?.message || 'Failed to create the package.'); }
  });

  const retired = status === 'retired';

  const renderMultiDim = (
    label: string, 
    items: string[], 
    setItems: React.Dispatch<React.SetStateAction<string[]>>, 
    newItemId: string, 
    setNewItemId: React.Dispatch<React.SetStateAction<string>>, 
    options: { id: string, name: string }[]
  ) => {
    const addItem = (id: string) => { if (id && !items.includes(id)) setItems(prev => [...prev, id]); setNewItemId(''); };
    return (
      <div className="q-field">
        <label className="q-label">{label}</label>
        <div className="q-row" style={{ flexWrap: 'wrap', marginBottom: items.length > 0 ? '8px' : '0' }}>
          {items.map((item) => {
            const dName = options.find(o => o.id === item)?.name || item;
            return (
              <span key={item} className="q-badge q-badge-neutral">
                {dName} <button className="q-btn-ghost" style={{ padding: '0 0 0 6px' }} onClick={() => setItems(prev => prev.filter(x => x !== item))}>×</button>
              </span>
            );
          })}
        </div>
        <div className="q-row">
          <select className="q-select" value={newItemId} onChange={(e) => setNewItemId(e.target.value)} style={{ minWidth: '12rem' }}>
            <option value="">Select...</option>
            {options.filter(o => !items.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => addItem(newItemId)} disabled={!newItemId}>+ Add</button>
        </div>
      </div>
    );
  };

  return (
    <div className="q-stack q-stack-lg">
      <div className="q-card q-section">
        <h2 className="q-section-title">What it bundles</h2>
        <p className="q-meta" style={{ marginBottom: '12px' }}>Pick the real Services this offering is built from — one, or several.</p>
        <div className="q-stack q-stack-sm">
          {allServices.map((s) => (
            <label key={s.id} className="q-row q-meta-plain" style={{ gap: '8px' }}>
              <input type="checkbox" checked={serviceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
              {s.name}{s.domain?.name ? ` (${s.domain.name})` : ''}
            </label>
          ))}
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
          
          {(enabledDimensions.length > 0) && (
            <div className="q-grid-2">
              {enabledDimensions.includes('subject') && renderMultiDim('Subjects', subjects, setSubjects, newSubjectId, setNewSubjectId, subjectOptions)}
              {enabledDimensions.includes('occasion') && renderMultiDim('Occasions', occasions, setOccasions, newOccasionId, setNewOccasionId, occasionOptions)}
              {enabledDimensions.includes('context') && renderMultiDim('Contexts', contexts, setContexts, newContextId, setNewContextId, contextOptions)}
              {enabledDimensions.includes('purpose') && renderMultiDim('Purposes', purposes, setPurposes, newPurposeId, setNewPurposeId, purposeOptions)}
              {enabledDimensions.includes('client') && renderMultiDim('Client Types', clientTypes, setClientTypes, newClientTypeId, setNewClientTypeId, clientTypeOptions)}
            </div>
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
