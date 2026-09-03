'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  declareDeliverableVariable, removeDeliverableVariable,
} from '@/modules/deliverables/interface';
import { SERVICE_VARIABLE_KINDS, variableKindLabel } from '@/modules/services/variableTypes';
import { ConfirmButton } from '@/components/ConfirmButton';
import { toast, readableError } from '@/components/Toast';

/**
 * WHAT THIS KIND OF THING NEEDS SETTLING.
 *
 * "Edited photograph" needs nothing. "Framed print" has a size and a frame, and
 * every package promising one has to settle both — a fact about the KIND, not
 * about any package that sells it. Declared once here, every package inherits
 * the questions and every reader renders the answers the same way.
 *
 * A VARIABLE, NOT A SHAPE INVENTED FOR THIS SCREEN. The first version of this
 * page stored the fields in a jsonb column with a shape I made up: three field
 * types, no unit, no bounds, no default, and no share of the one parser. That
 * was a second variable system that only deliverables could use.
 *
 * The app already had the real one. A variable has an owner — a service (what
 * varies about the work), a classification (what follows from an answer), and
 * now a deliverable (what a kind of output needs specifying) — and everything
 * downstream already knows how to fix one on a package, ask a client for it, or
 * store the answer against a booking line. So this declares variables, and
 * nothing had to be taught a new idea.
 *
 * The kinds come from SERVICE_VARIABLE_KINDS rather than a list retyped here, so a kind
 * added to the domain appears in this dropdown without anybody remembering to
 * add it.
 */
export function DeliverableNeeds({
  deliverableId,
  variables,
}: {
  deliverableId: string;
  variables: { id: string; label: string; kind: string; unit: string | null; options: string[] }[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState('text');
  const [unit, setUnit] = useState('');
  const [options, setOptions] = useState('');

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      try { await fn(); after?.(); router.refresh(); }
      catch (e) { toast.bad(readableError(e, 'That could not be saved.')); }
    });

  const reset = () => { setLabel(''); setKind('text'); setUnit(''); setOptions(''); setAdding(false); };

  const submit = () => run(
    () => declareDeliverableVariable({
      deliverableId,
      variable: {
        label: label.trim(),
        kind,
        unit: unit.trim() || null,
        // Only a choice has answers to list; carrying them onto a text field
        // would leave them in the row saying nothing.
        options: (kind === 'choice' || kind === 'multichoice')
          ? options.split(',').map((o) => o.trim()).filter(Boolean)
          : [],
      },
    }),
    reset,
  );

  return (
    <div className="q-stack q-stack-sm">
      {variables.length === 0 && (
        <p className="q-meta-sm">
          Nothing yet. If this kind of thing has a size, a length, a material or anything else that
          changes from one package to the next, say so once and every package promising it is asked.
        </p>
      )}

      {variables.map((v) => (
        <div key={v.id} className="q-row q-row-between q-tile">
          <span>
            <span className="q-meta-plain">{v.label}</span>
            {v.unit && <span className="q-meta-sm" style={{ marginLeft: '6px' }}>({v.unit})</span>}
            {v.options.length > 0 && (
              <div className="q-meta-sm">{v.options.join(' · ')}</div>
            )}
          </span>
          <span className="q-row q-row-sm">
            <span className="q-meta-sm">{variableKindLabel(v.kind as any)}</span>
            <ConfirmButton
              className="q-btn-ghost q-btn-xs"
              disabled={isPending}
              confirmLabel={`Stop asking for ${v.label}?`}
              title={`No longer settle ${v.label} for this deliverable`}
              onConfirm={() => run(() => removeDeliverableVariable(v.id))}
            >
              &times;
            </ConfirmButton>
          </span>
        </div>
      ))}

      {adding ? (
        <div className="q-stack q-stack-sm q-tile">
          <div className="q-row" style={{ gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="q-field" style={{ flex: '1 1 12rem', marginBottom: 0 }}>
              <label className="q-label q-label-sm">What is it called?</label>
              <input
                autoFocus
                className="q-input q-input-sm"
                value={label}
                placeholder="e.g. Size"
                disabled={isPending}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') reset(); }}
              />
            </div>
            <div className="q-field" style={{ flex: '0 0 10rem', marginBottom: 0 }}>
              <label className="q-label q-label-sm">Answered with</label>
              <select
                className="q-select q-input-sm"
                value={kind}
                disabled={isPending}
                onChange={(e) => setKind(e.target.value)}
              >
                {SERVICE_VARIABLE_KINDS.map((k) => (
                  <option key={k} value={k}>{variableKindLabel(k)}</option>
                ))}
              </select>
            </div>
            <div className="q-field" style={{ flex: '0 0 8rem', marginBottom: 0 }}>
              <label className="q-label q-label-sm">Unit (optional)</label>
              <input
                className="q-input q-input-sm"
                value={unit}
                placeholder="inch, page"
                disabled={isPending}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>

          {(kind === 'choice' || kind === 'multichoice') && (
            <div className="q-field" style={{ marginBottom: 0 }}>
              <label className="q-label q-label-sm">The answers allowed</label>
              <input
                className="q-input q-input-sm"
                value={options}
                placeholder="20x30, 16x20, 8x10"
                disabled={isPending}
                onChange={(e) => setOptions(e.target.value)}
              />
              <span className="q-meta-sm">Separated by commas.</span>
            </div>
          )}

          <div className="q-row">
            <button
              className="q-btn q-btn-primary q-btn-sm"
              aria-busy={isPending}
              disabled={isPending || !label.trim()}
              onClick={submit}
            >
              Add
            </button>
            <button className="q-btn q-btn-secondary q-btn-sm" onClick={reset}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="q-btn q-btn-secondary q-btn-sm" disabled={isPending} onClick={() => setAdding(true)}>
          + Add something to settle
        </button>
      )}
    </div>
  );
}
