'use client';

import React, { useState, useTransition } from 'react';
import { createPackageExtra, updatePackageExtra, deletePackageExtra } from '@/modules/packages/interface';
import { formatMoney } from '@/kernel/currency';
import { toast, readableError } from '@/components/Toast';
import type { PackageExtra } from '@/lib/types/engine';

type Props = {
  packageId: string;
  extras: PackageExtra[];
  services: { id: string; name: string }[];
  deliverables: { id: string; name: string }[];
  packages: { id: string; name: string }[];
  currency: string;
};

export function PackageExtrasEditor({ packageId, extras, services, deliverables, packages, currency }: Props) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  
  const [draft, setDraft] = useState<Partial<PackageExtra>>({
    name: '',
    description: '',
    target_type: 'custom',
    price: { amount: 0, currency },
  });

  const handleSave = () => {
    startTransition(async () => {
      try {
        await createPackageExtra(packageId, draft);
        setAdding(false);
        setDraft({ name: '', description: '', target_type: 'custom', price: { amount: 0, currency } });
        toast('Extra added successfully');
      } catch (err) {
        toast(readableError(err));
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Are you sure you want to remove this extra?')) return;
    startTransition(async () => {
      try {
        await deletePackageExtra(id);
        toast('Extra removed');
      } catch (err) {
        toast(readableError(err));
      }
    });
  };

  return (
    <div className="q-sheet">
      {extras.map((ex) => (
        <div key={ex.id} className="q-sheet-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>{ex.name}</strong>
            <div style={{ fontSize: '0.9em', color: 'var(--q-ink-soft)' }}>
              {ex.target_type === 'deliverable' && <span>Adds Deliverable</span>}
              {ex.target_type === 'service' && <span>Adds Service</span>}
              {ex.target_type === 'package' && <span>Adds Package</span>}
              {ex.target_type === 'custom' && <span>Custom Add-on</span>}
            </div>
            {ex.description && <p style={{ margin: 0, fontSize: '0.9em' }}>{ex.description}</p>}
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <span>{formatMoney(Number((ex.price as any)?.amount || 0), (ex.price as any)?.currency || currency)}</span>
            <button onClick={() => handleDelete(ex.id)} className="q-btn q-btn-danger" disabled={isPending}>Remove</button>
          </div>
        </div>
      ))}

      {adding ? (
        <div className="q-sheet-row">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input 
              className="q-input" 
              placeholder="Name (e.g. Extra Outfit)" 
              value={draft.name || ''} 
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} 
            />
            <input 
              className="q-input" 
              placeholder="Price" 
              type="number"
              value={(draft.price as any)?.amount || 0} 
              onChange={e => setDraft(d => ({ ...d, price: { amount: Number(e.target.value), currency } }))} 
            />
            <select 
              className="q-select"
              value={draft.target_type}
              onChange={e => setDraft(d => ({ ...d, target_type: e.target.value as any, target_deliverable_id: null, target_service_id: null, target_package_id: null }))}
            >
              <option value="custom">Custom Add-on</option>
              <option value="deliverable">Add Deliverable</option>
              <option value="service">Add Service</option>
              <option value="package">Add Package</option>
            </select>
            
            {draft.target_type === 'deliverable' && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <select className="q-select" value={draft.target_deliverable_id || ''} onChange={e => setDraft(d => ({ ...d, target_deliverable_id: e.target.value }))}>
                  <option value="">Select Deliverable...</option>
                  {deliverables.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <input className="q-input" type="number" placeholder="Qty" value={draft.target_deliverable_quantity || ''} onChange={e => setDraft(d => ({ ...d, target_deliverable_quantity: Number(e.target.value) }))} />
              </div>
            )}
            
            {draft.target_type === 'service' && (
              <select className="q-select" value={draft.target_service_id || ''} onChange={e => setDraft(d => ({ ...d, target_service_id: e.target.value }))}>
                <option value="">Select Service...</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}

            {draft.target_type === 'package' && (
              <select className="q-select" value={draft.target_package_id || ''} onChange={e => setDraft(d => ({ ...d, target_package_id: e.target.value }))}>
                <option value="">Select Package...</option>
                {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="q-btn q-btn-primary" onClick={handleSave} disabled={isPending || !draft.name}>Save</button>
              <button className="q-btn q-btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="q-sheet-row" style={{ justifyContent: 'center' }}>
          <button className="q-btn q-btn-secondary" onClick={() => setAdding(true)}>+ Add Extra</button>
        </div>
      )}
    </div>
  );
}

