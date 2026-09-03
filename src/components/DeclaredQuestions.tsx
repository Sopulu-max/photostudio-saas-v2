'use client';

import React, { useState } from 'react';
import { SERVICE_VARIABLE_KINDS, variableKindLabel } from '@/modules/services/variableTypes';
import { ConfirmButton } from '@/components/ConfirmButton';

export type DeclaredQuestion = {
  /** Present once saved; absent while a new deliverable is still being named. */
  id?: string;
  label: string;
  kind: string;
  unit: string | null;
  options: string[];
};

/**
 * WHAT A THING NEEDS SETTLING, EDITED THE SAME WAY WHEREVER IT IS EDITED.
 *
 * "Edited photographs" may be softcopy or hardcopy. "Framed print" has a size
 * and a frame. Declared once on the kind, inherited by every package promising
 * it — which is the whole point, and which is worth nothing if a studio can
 * only declare them on a page they reach AFTER creating the thing.
 *
 * CONTROLLED, SO THERE IS ONE OF THESE AND NOT TWO. The two places that need it
 * have opposite lifecycles: creating a deliverable has no id yet, so the
 * questions are collected and written after it exists; editing one saves each
 * change as it is made. That is a difference about WHO OWNS THE STATE, not
 * about what the control looks like — so this owns neither. It renders a list
 * and reports the list it would like next, and each caller decides what that
 * means.
 *
 * Building it twice is exactly the drift this module has spent its history
 * paying for: two spellings of one idea, agreeing on the day they were written.
 */
export function DeclaredQuestions({
  questions,
  onChange,
  disabled,
  emptyHint,
}: {
  questions: DeclaredQuestion[];
  onChange: (next: DeclaredQuestion[]) => void;
  disabled?: boolean;
  emptyHint?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState('text');
  const [unit, setUnit] = useState('');
  const [options, setOptions] = useState('');

  const reset = () => {
    setLabel(''); setKind('text'); setUnit(''); setOptions(''); setAdding(false);
  };

  const add = () => {
    const clean = label.trim();
    if (!clean) return;
    onChange([...questions, {
      label: clean,
      kind,
      unit: unit.trim() || null,
      // Only a choice has answers to list; carrying them onto a text field
      // would leave them in the row saying nothing.
      options: (kind === 'choice' || kind === 'multichoice')
        ? options.split(',').map((o) => o.trim()).filter(Boolean)
        : [],
    }]);
    reset();
  };

  const remove = (i: number) => onChange(questions.filter((_, idx) => idx !== i));

  const wantsOptions = kind === 'choice' || kind === 'multichoice';

  return (
    <div className="q-stack q-stack-sm">
      {questions.length === 0 && (
        <p className="q-meta-sm">
          {emptyHint ?? 'Nothing yet. If this has a size, a length, a material or anything else that changes from one package to the next, say so once and every package promising it is asked.'}
        </p>
      )}

      {questions.map((q, i) => (
        <div key={q.id ?? `${q.label}-${i}`} className="q-row q-row-between q-tile">
          <span>
            <span className="q-meta-plain">{q.label}</span>
            {q.unit && <span className="q-meta-sm" style={{ marginLeft: '6px' }}>({q.unit})</span>}
            {q.options.length > 0 && <div className="q-meta-sm">{q.options.join(' · ')}</div>}
          </span>
          <span className="q-row q-row-sm">
            <span className="q-meta-sm">{variableKindLabel(q.kind as any)}</span>
            <ConfirmButton
              className="q-btn-ghost q-btn-xs"
              disabled={disabled}
              confirmLabel={`Stop asking for ${q.label}?`}
              title={`No longer settle ${q.label}`}
              onConfirm={() => remove(i)}
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
                placeholder="e.g. Type"
                disabled={disabled}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') reset();
                  // Enter adds the question rather than submitting the form
                  // around it, which would create the thing half-declared.
                  if (e.key === 'Enter') { e.preventDefault(); add(); }
                }}
              />
            </div>
            <div className="q-field" style={{ flex: '0 0 10rem', marginBottom: 0 }}>
              <label className="q-label q-label-sm">Answered with</label>
              <select
                className="q-select q-input-sm"
                value={kind}
                disabled={disabled}
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
                disabled={disabled}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>

          {wantsOptions && (
            <div className="q-field" style={{ marginBottom: 0 }}>
              <label className="q-label q-label-sm">The answers allowed</label>
              <input
                className="q-input q-input-sm"
                value={options}
                placeholder="Softcopy, Hardcopy"
                disabled={disabled}
                onChange={(e) => setOptions(e.target.value)}
              />
              <span className="q-meta-sm">
                Separated by commas. A service can later say it only does some of them.
              </span>
            </div>
          )}

          <div className="q-row">
            <button
              type="button"
              className="q-btn q-btn-primary q-btn-sm"
              disabled={disabled || !label.trim()}
              onClick={add}
            >
              Add
            </button>
            <button type="button" className="q-btn q-btn-secondary q-btn-sm" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="q-btn q-btn-secondary q-btn-sm"
          disabled={disabled}
          onClick={() => setAdding(true)}
        >
          + Add something to settle
        </button>
      )}
    </div>
  );
}
