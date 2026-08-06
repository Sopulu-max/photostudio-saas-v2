'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPackage, updatePackage, setPackageStatus, duplicatePackage } from '@/modules/packages/interface';
import type { PaymentPolicy, PricingVariant, PackageDimension } from '@/modules/packages/interface';
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
  suggestedDeliverablesByService,
  roleOptions,
  initial,
}: {
  mode: 'create' | 'edit';
  packageId?: string;
  status?: string;
  currencyCode: string;
  allServices: ServiceOption[];
  allDeliverables: { id: string; name: string }[];
  suggestedDeliverablesByService: Record<string, string[]>;
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
        <h2 className="q-section-title">Deliverables</h2>
        <p className="q-meta" style={{ marginBottom: '12px' }}>What this Package explicitly promises to the client (e.g., 50 Edited Photos).</p>
        <div className="q-row" style={{ flexWrap: 'wrap' }}>
          {deliverables.map((dId) => {
            const dName = allDeliverables.find(d => d.id === dId)?.name || dId;
            return (
              <span key={dId} className="q-badge q-badge-neutral">
                {dName} <button className="q-btn-ghost" style={{ padding: '0 0 0 6px' }} onClick={() => removeDeliverable(dId)}>×</button>
              </span>
            );
          })}
        </div>
        <div className="q-row" style={{ marginTop: '8px' }}>
          <select className="q-select" value={newDeliverableId} onChange={(e) => setNewDeliverableId(e.target.value)} style={{ minWidth: '12rem' }}>
            <option value="">Select a deliverable...</option>
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

      <div className="q-card q-section">
        <h2 className="q-section-title">Timing &amp; extra stages</h2>
        <div className="q-field">
          <label className="q-label">Usually takes</label>
          <select className="q-select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATION_CHOICES.map((d) => <option key={d.minutes} value={d.minutes}>{d.label}</option>)}
          </select>
        </div>
        <p className="q-meta" style={{ margin: '16px 0 8px' }}>
          This offering&rsquo;s routing already includes every bundled service&rsquo;s process. Add anything specific to this
          package on top — a second photographer, drone coverage.
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
