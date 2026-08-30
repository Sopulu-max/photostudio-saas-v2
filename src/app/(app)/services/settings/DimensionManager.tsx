'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  listDimensionsForDomain, createDimension, setDimensionActive,
  deleteDimension, addDimensionValue, removeDimensionValue, setValueParent,
  listVariablesForDimensions, declareDimensionVariable, removeDimensionVariable,
} from '@/modules/services/interface';
import type { StudioDimension, StudioQuestion, DimensionSuggestions } from '@/modules/services/interface';
import { dimensionKey, narrowFor } from '@/modules/services/interface';
import { PickOne, PickToAdd } from '@/components/Pick';

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

export function DimensionManager({
  domains, suggestions, studioQuestions,
}: {
  domains: { id: string; name: string }[];
  /**
   * What the app already knows this kind of question gets answered with, keyed
   * by dimension name. Defining a vocabulary shouldn't mean typing into the
   * dark any more than defining a service does — same rule, same control.
   */
  suggestions?: DimensionSuggestions;
  /**
   * Every question this studio already has, with its answers and the domains
   * asking it. Adding one by a name already in this list adopts it rather than
   * making a second — so the form has to be able to say what that brings.
   */
  studioQuestions?: StudioQuestion[];
}) {
  const [domainId, setDomainId] = useState(domains[0]?.id || '');
  /*
   * What each question says follows from its answers, keyed by dimension.
   *
   * Loaded beside the dimensions rather than with them: listDimensionsForDomain
   * answers a different question, and widening it to carry variables would make
   * every screen that only wants the vocabulary pay for them.
   */
  const [vars, setVars] = useState<Record<string, any[]>>({});
  const [newVar, setNewVar] = useState<Record<string, { label: string; kind: string }>>({});
  const [dims, setDims] = useState<StudioDimension[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  /** The half-built "X is a kind of Y" sentence, per dimension. */
  const [nesting, setNesting] = useState<Record<string, { child: string; parent: string }>>({});

  const load = React.useCallback(async (id: string) => {
    if (!id) return setDims([]);
    setLoading(true);
    try { setDims(await listDimensionsForDomain(id)); }
    finally { setLoading(false); }
  }, []);

  const loadVars = React.useCallback(async (list: { id: string }[]) => {
    if (list.length === 0) { setVars({}); return; }
    const all = await listVariablesForDimensions(list.map((d) => d.id));
    const by: Record<string, any[]> = {};
    for (const v of all as any[]) (by[v.dimensionId] ||= []).push(v);
    setVars(by);
  }, []);

  useEffect(() => { load(domainId); }, [domainId, load]);
  useEffect(() => { loadVars(dims); }, [dims, loadVars]);

  const domainName = domains.find((d) => d.id === domainId)?.name || '';

  /**
   * What to offer under one question: everything the library and this studio's
   * own services associate with it, minus what this domain already has. An
   * answer already on screen as a chip is not a suggestion.
   */
  const answerOptions = (d: StudioDimension) => {
    const known = narrowFor(suggestions?.[dimensionKey(d.name)], domainName, '');
    const fromExample = (d.example || '').split(',').map((x) => x.trim()).filter(Boolean);
    const have = new Set(d.values.map((v) => v.name.toLowerCase()));
    return [...new Set([...known, ...fromExample])].filter((o) => !have.has(o.toLowerCase()));
  };

  /**
   * The studio question the typed name would resolve to, if any.
   *
   * Matched the same way the server does — trimmed and lowercased — so what the
   * form promises and what createDimension actually does cannot drift. A match
   * means this is an adoption, not an invention: the question already exists,
   * with a wording and a set of answers, and adding it here points this domain
   * at that one rather than starting a second of the same name.
   */
  const matched = (studioQuestions || []).find((q) => dimensionKey(q.name) === dimensionKey(name));
  /** Already asked here — nothing to add, and the unique index would refuse it. */
  const alreadyHere = !!matched && dims.some((d) => d.id === matched.id);

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); await load(domainId); after?.(); router.refresh(); }
      catch (e: any) { alert(e?.message || 'The change could not be saved.'); }
    });

  if (domains.length === 0) {
    return (
      <p className="q-empty">
        Add a service domain first. Classifications belong to a domain.
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
          Each domain chooses which classifications it uses. The classifications themselves belong to
          the studio, so renaming one, or adding an answer to it, applies everywhere it is used.
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
                    onClick={() => run(() => setDimensionActive({ dimensionId: d.id, isActive: !d.isActive, serviceDomainId: domainId }))}>
                    {d.isActive ? 'Turn off' : 'Turn on'}
                  </button>
                  <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending}
                    onClick={() => {
                      // Says what it does: this domain stops asking. The
                      // question survives wherever else it is asked, and goes
                      // altogether only when nobody asks it and nothing is
                      // filed under it.
                      if (!confirm(`Stop ${domainName} classifying by ${d.name}? Other kinds of work that ask it keep it.`)) return;
                      run(() => deleteDimension(d.id, domainId));
                    }}>
                    Remove
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
                {d.values.length === 0 && <span className="q-meta-sm">No values yet.</span>}
              </div>

              {/* Choose from what the app knows this question gets answered
                  with, or type something it has never heard of — which then
                  becomes part of this domain's vocabulary. */}
              <PickToAdd
                options={answerOptions(d)}
                placeholder={d.example ? `Add a value — e.g. ${d.example.split(',')[0].trim()}` : 'Add a value'}
                disabled={isPending}
                onAdd={(v) => run(() => addDimensionValue({ dimensionId: d.id, name: v }))}
              />

              {/*
                * Nesting, as one sentence that reads like what it does.
                *
                * Hidden until there are two answers to relate, because with one
                * there is nothing to say. Saying Beach is a kind of Outdoor is
                * not filing — asking what this studio does outdoors
                * starts including its beach work, with no service tagged twice.
                */}
              {d.values.length > 1 && (
                <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  <span className="q-meta-sm">Group values:</span>
                  <select className="q-select q-input-sm" style={{ maxWidth: '9rem' }}
                    value={nesting[d.id]?.child || ''}
                    onChange={(e) => setNesting((s) => ({ ...s, [d.id]: { ...s[d.id], child: e.target.value } }))}>
                    <option value="">Select a value</option>
                    {d.values.filter((v) => !hasChildren(d.values, v.id))
                      .map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <span className="q-meta-sm">belongs under</span>
                  <select className="q-select q-input-sm" style={{ maxWidth: '9rem' }}
                    value={nesting[d.id]?.parent || ''}
                    onChange={(e) => setNesting((s) => ({ ...s, [d.id]: { ...s[d.id], parent: e.target.value } }))}>
                    <option value="">Select a parent</option>
                    {d.values.filter((v) => v.id !== nesting[d.id]?.child)
                      .map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <button className="q-btn q-btn-secondary q-btn-xs"
                    disabled={isPending || !nesting[d.id]?.child || !nesting[d.id]?.parent}
                    onClick={() => run(
                      () => setValueParent({ valueId: nesting[d.id].child, parentId: nesting[d.id].parent }),
                      () => setNesting((s) => ({ ...s, [d.id]: { child: '', parent: '' } }))
                    )}>
                    Apply
                  </button>
                </div>
              )}

              {/*
                * WHAT YOU NEED TO KNOW ONCE THIS IS ANSWERED.
                *
                * A question could only ever carry its list of acceptable
                * answers. It could ask "what occasion is it for?" and accept
                * "Birthday", and then have nothing further to say — even though
                * a birthday obviously has a date.
                *
                * Declared here, once for the studio, it becomes a field on the
                * booking form of every package classified this way. The
                * alternative was a free-text "occasion date" invented inside
                * one package, re-invented in the next, connected to Occasion in
                * neither.
                *
                * The same shape as a service's variables on purpose — a kind, a
                * unit, options — because it is the same thing hanging off a
                * different owner, and a package decides who answers it by the
                * same rule.
                */}
              <div className="q-stack q-stack-sm q-tile-sub">
                <span className="q-eyebrow">What you need to know</span>
                {(vars[d.id] || []).length === 0 && (
                  <span className="q-meta-sm">
                    Nothing yet. If knowing {d.name.toLowerCase()} means you also need something —
                    a date, a place — say so here and every package classified this way will ask for it.
                  </span>
                )}
                {(vars[d.id] || []).map((v: any) => (
                  <div key={v.id} className="q-row q-row-between q-tile">
                    <span className="q-meta-plain">{v.label}</span>
                    <span className="q-row q-row-sm">
                      <span className="q-meta-sm">{v.kind}</span>
                      <button className="q-btn-ghost q-btn-xs" disabled={isPending}
                        title={`Remove ${v.label}`}
                        onClick={() => run(() => removeDimensionVariable(v.id), () => loadVars(dims))}>
                        &times;
                      </button>
                    </span>
                  </div>
                ))}
                <div className="q-row q-row-sm">
                  <input
                    className="q-input q-input-sm"
                    placeholder={`e.g. the date of the ${d.name.toLowerCase()}`}
                    value={newVar[d.id]?.label || ''}
                    onChange={(e) => setNewVar((n) => ({ ...n, [d.id]: { ...(n[d.id] || { kind: 'date' }), label: e.target.value } }))}
                  />
                  <select
                    className="q-select q-input-sm"
                    value={newVar[d.id]?.kind || 'date'}
                    onChange={(e) => setNewVar((n) => ({ ...n, [d.id]: { ...(n[d.id] || { label: '' }), kind: e.target.value } }))}
                  >
                    <option value="date">Date</option>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Yes or no</option>
                  </select>
                  <button
                    className="q-btn q-btn-secondary q-btn-xs"
                    disabled={isPending || !(newVar[d.id]?.label || '').trim()}
                    onClick={() => run(
                      () => declareDimensionVariable({
                        dimensionId: d.id,
                        variable: {
                          key: newVar[d.id].label,
                          label: newVar[d.id].label,
                          kind: (newVar[d.id].kind || 'date') as any,
                        } as any,
                      }),
                      () => { setNewVar((n) => ({ ...n, [d.id]: { label: '', kind: 'date' } })); loadVars(dims); },
                    )}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="q-note q-stack q-stack-sm">
          <div className="q-field">
            <label className="q-label">Name</label>
            {/* Questions are as suggestible as answers — including ones this
                studio's other domains already ask, which is usually where a
                good one comes from. Offered whether or not any domain currently
                asks them: a question every domain has switched off is still the
                studio's, and typing its name would adopt it either way. */}
            <PickOne
              value={name}
              onChange={setName}
              options={(studioQuestions || [])
                .filter((q) => !dims.some((d) => d.id === q.id))
                .map((q) => q.name)}
              placeholder="e.g. Style, Season, Turnaround"
              disabled={isPending}
            />
          </div>

          {/*
            * What adopting brings with it.
            *
            * A classification belongs to the studio, so a name already in use
            * doesn't make a second one — it points this domain at the existing
            * question, wording and answers included. That used to happen in
            * silence, and the Question field below stayed on screen offering to
            * set something that would be discarded. Both are now said out loud.
            */}
          {alreadyHere ? (
            <div className="q-note q-note-warn">
              <p className="q-meta">{domainName} already classifies by {matched!.name}.</p>
            </div>
          ) : matched ? (
            <div className="q-tile q-stack q-stack-sm">
              <p className="q-meta">
                {matched.name} is an existing classification. Adding it here means {domainName} asks the
                same question, so its answers stay in step wherever it is used.
              </p>
              {matched.question && <p className="q-meta-sm">Question: {matched.question}</p>}
              <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                {matched.values.length > 0
                  ? matched.values.map((v) => <span key={v} className="q-badge q-badge-neutral">{v}</span>)
                  : <span className="q-meta-sm">No values yet.</span>}
              </div>
              <span className="q-meta-sm">
                {matched.domains.length > 0
                  ? `Currently asked by ${matched.domains.join(', ')}.`
                  : 'No domain currently asks it.'}
              </span>
            </div>
          ) : (
            <div className="q-field">
              <label className="q-label">Question</label>
              <input className="q-input" value={question} onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What visual style is it?" />
              <span className="q-meta-sm">
                Recommended. Records what this classification is asking, so its purpose remains clear later.
              </span>
            </div>
          )}

          <div className="q-row">
            <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending || !name.trim() || alreadyHere}
              onClick={() => run(
                () => createDimension({ serviceDomainId: domainId, name, question: matched ? '' : question }),
                () => { setName(''); setQuestion(''); setAdding(false); }
              )}>
              {isPending ? 'Adding…' : matched ? `Use ${matched.name} here` : 'Add classification'}
            </button>
            <button className="q-btn q-btn-secondary q-btn-sm"
              onClick={() => { setAdding(false); setName(''); setQuestion(''); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="q-btn q-btn-secondary" onClick={() => setAdding(true)} disabled={!domainId}>
          + New classification for {domains.find((d) => d.id === domainId)?.name || 'this domain'}
        </button>
      )}
    </div>
  );
}
