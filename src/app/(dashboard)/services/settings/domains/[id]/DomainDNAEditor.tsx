'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateServiceDomainDNA, renameServiceDomain } from '@/modules/services/interface';

export function DomainDNAEditor({
  domain,
  allDeliverables,
  allOccasions,
  allContexts,
  allSubjects,
  allPurposes,
  allClientTypes,
}: {
  domain: any;
  allDeliverables: any[];
  allOccasions: any[];
  allContexts: any[];
  allSubjects: any[];
  allPurposes: any[];
  allClientTypes: any[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(domain.name);
  const [deliverables, setDeliverables] = useState<Set<string>>(new Set((domain.deliverables || []).map((d: any) => d.id)));
  const [occasions, setOccasions] = useState<Set<string>>(new Set((domain.occasions || []).map((d: any) => d.id)));
  const [contexts, setContexts] = useState<Set<string>>(new Set((domain.contexts || []).map((d: any) => d.id)));
  const [subjects, setSubjects] = useState<Set<string>>(new Set((domain.subjects || []).map((d: any) => d.id)));
  const [purposes, setPurposes] = useState<Set<string>>(new Set((domain.purposes || []).map((d: any) => d.id)));
  const [clientTypes, setClientTypes] = useState<Set<string>>(new Set((domain.clientTypes || []).map((d: any) => d.id)));

  const toggle = (set: Set<string>, id: string, updater: (val: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updater(next);
  };

  const handleSave = () => {
    startTransition(async () => {
      try {
        if (name !== domain.name) {
          await renameServiceDomain(domain.id, name);
        }
        await updateServiceDomainDNA(domain.id, {
          deliverables: Array.from(deliverables),
          occasions: Array.from(occasions),
          contexts: Array.from(contexts),
          subjects: Array.from(subjects),
          purposes: Array.from(purposes),
          clientTypes: Array.from(clientTypes),
        });
        router.refresh();
        alert('Domain DNA saved successfully.');
      } catch (err: any) {
        alert(err.message || 'Failed to save.');
      }
    });
  };

  const renderChecklist = (title: string, subtitle: string, items: any[], selected: Set<string>, setter: (s: Set<string>) => void) => (
    <div className="q-card q-section" style={{ backgroundColor: 'var(--q-color-paper)' }}>
      <h3 className="q-section-title">{title}</h3>
      <p className="q-meta-sm" style={{ marginBottom: '16px' }}>{subtitle}</p>
      {items.length === 0 ? (
        <p className="q-meta-sm">No items defined in settings.</p>
      ) : (
        <div className="q-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
          {items.map(item => {
            const active = selected.has(item.id);
            return (
              <label key={item.id} className="q-row" style={{
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '999px',
                border: `1px solid ${active ? 'var(--q-color-primary)' : 'var(--q-color-border)'}`,
                backgroundColor: active ? 'var(--q-color-primary-light)' : 'transparent',
                color: active ? 'var(--q-color-primary)' : 'inherit',
                transition: 'all var(--q-dur-2) var(--q-ease)',
                userSelect: 'none'
              }}>
                <input
                  type="checkbox"
                  style={{ display: 'none' }}
                  checked={active}
                  onChange={() => toggle(selected, item.id, setter)}
                  disabled={isPending}
                />
                <span className="q-meta-sm" style={{ fontWeight: active ? 600 : 400 }}>{item.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="q-stack q-stack-lg">
      <div className="q-card q-section">
        <label className="q-label">
          Domain Name
          <input className="q-input" value={name} onChange={(e) => setName(e.target.value)} disabled={isPending} />
        </label>
      </div>

      <div className="q-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        {renderChecklist('Deliverables', 'What kinds of assets can this domain produce?', allDeliverables, deliverables, setDeliverables)}
        {renderChecklist('Subjects', 'Who or what is this domain typically about?', allSubjects, subjects, setSubjects)}
        {renderChecklist('Occasions', 'What events trigger this domain?', allOccasions, occasions, setOccasions)}
        {renderChecklist('Contexts', 'Where does this domain typically happen?', allContexts, contexts, setContexts)}
        {renderChecklist('Purposes', 'Why do clients need this?', allPurposes, purposes, setPurposes)}
        {renderChecklist('Client Types', 'Who buys this?', allClientTypes, clientTypes, setClientTypes)}
      </div>

      <div className="q-row" style={{ marginTop: '32px' }}>
        <button className="q-btn q-btn-primary" onClick={handleSave} disabled={isPending}>
          {isPending ? 'Saving...' : 'Save Domain DNA'}
        </button>
      </div>
    </div>
  );
}
