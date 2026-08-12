'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  listDimensionsForDomain, createDimension, setDimensionActive,
  deleteDimension, addDimensionValue, removeDimensionValue,
} from '@/modules/services/interface';
import type { StudioDimension } from '@/modules/services/interface';

/**
 * How this domain classifies its own work.
 *
 * Dimensions belong to a domain, so this asks for one first. Photography
 * classifying by Style says nothing about Printing, which is what lets a studio
 * expand into a domain as far as it wants without dragging the others along.
 *
 * The five that ship are ordinary rows here — no badge, no lock. A studio can
 * rename Occasion, switch it off, or delete it, exactly as it can with one it
 * invents. The engine seeds knowledge; it doesn't own the ceiling.
 */
export function DimensionManager({ domains }: { domains: { id: string; name: string }[] }) {
  const [domainId, setDomainId] = useState(domains[0]?.id || '');
  const [dims, setDims] = useState<StudioDimension[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [valueDraft, setValueDraft] = useState<Record<string, string>>({});

  const load = React.useCallback(async (id: string) => {
    if (!id) return setDims([]);
    setLoading(true);
    try { setDims(await listDimensionsForDomain(id)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(domainId); }, [domainId, load]);

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); await load(domainId); after?.(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'That didn’t work.'); }
    });

  if (domains.length === 0) {
    return (
      <p className="q-empty">
        Add a service domain first — dimensions belong to one, so there&rsquo;s nothing to classify yet.
      </p>
    );
  }

  return (
    <div className="q-stack q-stack-md">
      <div className="q-field">
        <label className="q-label">Which domain?</label>
        <select className="q-select" value={domainId} onChange={(e) => setDomainId(e.target.value)}>
          {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <span className="q-meta-sm">
          Each domain classifies its work its own way. What you add here stays here.
        </span>
      </div>

      {loading ? (
        <p className="q-meta">Loading…</p>
      ) : (
        <div className="q-stack q-stack-sm">
          {dims.map((d) => (
            <div key={d.id} className="q-tile q-stack q-stack-sm">
              <div className="q-row q-row-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <strong className="q-strong">{d.name}</strong>
                  {!d.isActive && <span className="q-badge q-badge-neutral" style={{ marginLeft: '8px' }}>off</span>}
                  {d.question && <div className="q-meta-sm">{d.question}</div>}
                </div>
                <div className="q-row">
                  <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending}
                    onClick={() => run(() => setDimensionActive({ dimensionId: d.id, isActive: !d.isActive }))}>
                    {d.isActive ? 'Turn off' : 'Turn on'}
                  </button>
                  <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending}
                    onClick={() => {
                      if (!confirm(`Delete ${d.name} and everything filed under it? Turning it off keeps the record.`)) return;
                      run(() => deleteDimension(d.id));
                    }}>
                    Delete
                  </button>
                </div>
              </div>

              <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                {d.values.map((v) => (
                  <span key={v.id} className="q-badge q-badge-neutral" style={{ cursor: 'pointer' }}
                    title="Remove"
                    onClick={() => run(() => removeDimensionValue(v.id))}>
                    {v.name} &times;
                  </span>
                ))}
                {d.values.length === 0 && <span className="q-meta-sm">No values yet.</span>}
              </div>

              <div className="q-row">
                <input
                  className="q-input q-input-sm"
                  placeholder={d.example ? `e.g. ${d.example.split(',')[0].trim()}` : 'Add a value'}
                  value={valueDraft[d.id] || ''}
                  onChange={(e) => setValueDraft((s) => ({ ...s, [d.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const v = (valueDraft[d.id] || '').trim();
                    if (v) run(() => addDimensionValue({ dimensionId: d.id, name: v }),
                                () => setValueDraft((s) => ({ ...s, [d.id]: '' })));
                  }}
                  style={{ minWidth: '10rem' }}
                />
                <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending}
                  onClick={() => {
                    const v = (valueDraft[d.id] || '').trim();
                    if (v) run(() => addDimensionValue({ dimensionId: d.id, name: v }),
                                () => setValueDraft((s) => ({ ...s, [d.id]: '' })));
                  }}>
                  Add value
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="q-note q-stack q-stack-sm">
          <div className="q-field">
            <label className="q-label">What do you call it?</label>
            <input className="q-input" autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Style, Season, Turnaround" />
          </div>
          <div className="q-field">
            <label className="q-label">What question does it answer?</label>
            <input className="q-input" value={question} onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What visual style is it?" />
            <span className="q-meta-sm">
              Worth writing — a dimension is a question you ask about your own work, and one without it
              is a heading nobody can read back in six months.
            </span>
          </div>
          <div className="q-row">
            <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending || !name.trim()}
              onClick={() => run(
                () => createDimension({ serviceDomainId: domainId, name, question }),
                () => { setName(''); setQuestion(''); setAdding(false); }
              )}>
              {isPending ? 'Adding…' : 'Add dimension'}
            </button>
            <button className="q-btn q-btn-secondary q-btn-sm"
              onClick={() => { setAdding(false); setName(''); setQuestion(''); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="q-btn q-btn-secondary" onClick={() => setAdding(true)} disabled={!domainId}>
          + New dimension for {domains.find((d) => d.id === domainId)?.name || 'this domain'}
        </button>
      )}
    </div>
  );
}
