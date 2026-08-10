'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createService, updateService, setServiceStatus, duplicateService } from '@/modules/services/interface';
import type { Dimension } from '@/modules/services/interface';
import { CheckCircle2, ChevronRight, Settings } from 'lucide-react';

export function ServiceFieldsEditor({
  mode, serviceId, status, domainOptions, outputOptions, enabledDimensions,
  occasionOptions, contextOptions, subjectOptions, purposeOptions, clientTypeOptions,
  initial,
}: {
  mode: 'create' | 'edit'; serviceId?: string; status?: string;
  domainOptions: string[]; outputOptions: string[]; enabledDimensions: Dimension[];
  occasionOptions: string[]; contextOptions: string[]; subjectOptions: string[];
  purposeOptions: string[]; clientTypeOptions: string[];
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
  
  // Dimensional Restrictions
  const [occasions, setOccasions] = useState<string[]>(initial.occasions || []);
  const [newOccasion, setNewOccasion] = useState('');
  const [subjects, setSubjects] = useState<string[]>(initial.subjects || []);
  const [newSubject, setNewSubject] = useState('');

  const handleSave = () => {
    if (!name.trim()) return alert('Name is required.');
    if (!domain.trim()) return alert('Service Domain is required.');

    startTransition(async () => {
      try {
        const payload = {
          name, description, serviceDomain: domain,
          primaryDeliverable: primaryDeliverable || null,
          deliverables, occasions, subjects, 
          contexts: initial.contexts || [], 
          purposes: initial.purposes || [], 
          clientTypes: initial.clientTypes || []
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
          <input className="q-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wedding Photography" disabled={isPending} />
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
            <span className="q-meta-sm" style={{ fontStyle: 'italic', opacity: 0.6 }}>No dimensional DNA inherited from the selected domain.</span>
          ) : (
            <>
              {enabledDimensions.includes('subject') && (
                <div className="q-panel" style={{ padding: '16px', backgroundColor: 'var(--q-color-ground)' }}>
                  <label className="q-label">Restrict Subjects</label>
                  <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                    {subjects.map((s: string) => (
                      <span key={s} className="q-badge q-badge-neutral" style={{ cursor: 'pointer' }} onClick={() => toggleArray(subjects, s, setSubjects)}>
                        {s} &times;
                      </span>
                    ))}
                    <div className="q-row q-gap-sm">
                      <input className="q-input" style={{ width: '160px', padding: '4px 12px', fontSize: '0.85rem' }} list="subjects-list" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addArray(newSubject, subjects, setSubjects, () => setNewSubject('')); }} placeholder="+ Add constraint" />
                      <datalist id="subjects-list">{subjectOptions.map((o: string) => <option key={o} value={o} />)}</datalist>
                    </div>
                  </div>
                </div>
              )}

              {enabledDimensions.includes('occasion') && (
                <div className="q-panel" style={{ padding: '16px', backgroundColor: 'var(--q-color-ground)' }}>
                  <label className="q-label">Restrict Occasions</label>
                  <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                    {occasions.map((s: string) => (
                      <span key={s} className="q-badge q-badge-neutral" style={{ cursor: 'pointer' }} onClick={() => toggleArray(occasions, s, setOccasions)}>
                        {s} &times;
                      </span>
                    ))}
                    <div className="q-row q-gap-sm">
                      <input className="q-input" style={{ width: '160px', padding: '4px 12px', fontSize: '0.85rem' }} list="occasions-list" value={newOccasion} onChange={(e) => setNewOccasion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addArray(newOccasion, occasions, setOccasions, () => setNewOccasion('')); }} placeholder="+ Add constraint" />
                      <datalist id="occasions-list">{occasionOptions.map((o: string) => <option key={o} value={o} />)}</datalist>
                    </div>
                  </div>
                </div>
              )}
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
