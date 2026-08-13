'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  listDimensionsForDomain, createDimension, setDimensionActive,
  deleteDimension, addDimensionValue, removeDimensionValue, setValueParent,
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
/** One level of nesting is offered at a time — a value with children of its own
 *  can't also be tucked inside a third, which keeps the tree readable. */
const hasChildren = (values: { id: string; parentId: string | null }[], id: string) =>
  values.some((v) => v.parentId === id);

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
  /** The half-built "X is a kind of Y" sentence, per dimension. */
  const [nesting, setNesting] = useState<Record<string, { child: string; parent: string }>>({});

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

              {/*
                * The answers. Chips, because that is what they are — a short
                * list of words, read at a glance.
                *
                * The first version of this gave every value its own "put
                * inside…" dropdown, which made a control nobody touches most
                * days the loudest thing in the section and shrank the actual
                * answers to captions. Nesting is one line, below, and only
                * appears once there are two things to relate.
                */}
              <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                {d.values.filter((v) => !v.parentId).map((parent) => (
                  <React.Fragment key={parent.id}>
                    <span className="q-badge q-badge-neutral">
                      {parent.name}
                      <button className="q-btn-ghost" style={{ padding: '0 0 0 6px' }} title={`Remove ${parent.name}`}
                        onClick={() => run(() => removeDimensionValue(parent.id))}>&times;</button>
                    </span>
                    {d.values.filter((v) => v.parentId === parent.id).map((child) => (
                      <span key={child.id} className="q-badge q-badge-neutral" style={{ opacity: 0.8 }}
                        title={`${child.name} is a kind of ${parent.name}`}>
                        &#8627; {child.name}
                        <button className="q-btn-ghost" style={{ padding: '0 0 0 6px' }}
                          title={`Take ${child.name} back out of ${parent.name}`}
                          onClick={() => run(() => setValueParent({ valueId: child.id, parentId: null }))}>&uarr;</button>
                        <button className="q-btn-ghost" style={{ padding: '0 0 0 4px' }} title={`Remove ${child.name}`}
                          onClick={() => run(() => removeDimensionValue(child.id))}>&times;</button>
                      </span>
                    ))}
                  </React.Fragment>
                ))}
                {d.values.length === 0 && <span className="q-meta-sm">No answers yet.</span>}
              </div>

              <div className="q-row">
                <input
                  className="q-input q-input-sm"
                  placeholder={d.example ? `Another answer — e.g. ${d.example.split(',')[0].trim()}` : 'Another answer'}
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
                  Add answer
                </button>
              </div>

              {/*
                * Nesting, as one sentence that reads like what it does.
                *
                * Hidden until there are two answers to relate, because with one
                * there is nothing to say. Saying Beach is a kind of Outdoor is
                * not filing — asking the Lens what this studio does outdoors
                * starts including its beach work, with no service tagged twice.
                */}
              {d.values.length > 1 && (
                <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  <span className="q-meta-sm">Is one of these a kind of another?</span>
                  <select className="q-select q-input-sm" style={{ maxWidth: '9rem' }}
                    value={nesting[d.id]?.child || ''}
                    onChange={(e) => setNesting((s) => ({ ...s, [d.id]: { ...s[d.id], child: e.target.value } }))}>
                    <option value="">Which one…</option>
                    {d.values.filter((v) => !hasChildren(d.values, v.id))
                      .map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <span className="q-meta-sm">is a kind of</span>
                  <select className="q-select q-input-sm" style={{ maxWidth: '9rem' }}
                    value={nesting[d.id]?.parent || ''}
                    onChange={(e) => setNesting((s) => ({ ...s, [d.id]: { ...s[d.id], parent: e.target.value } }))}>
                    <option value="">…this one</option>
                    {d.values.filter((v) => v.id !== nesting[d.id]?.child)
                      .map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <button className="q-btn q-btn-secondary q-btn-xs"
                    disabled={isPending || !nesting[d.id]?.child || !nesting[d.id]?.parent}
                    onClick={() => run(
                      () => setValueParent({ valueId: nesting[d.id].child, parentId: nesting[d.id].parent }),
                      () => setNesting((s) => ({ ...s, [d.id]: { child: '', parent: '' } }))
                    )}>
                    Say so
                  </button>
                </div>
              )}
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
