'use client';

import React from 'react';
import { variableIsNumeric } from '@/modules/services/variableTypes';
import type { ServiceVariableKind } from '@/modules/services/variableTypes';

/**
 * One widget for one variable, whatever shape it is.
 *
 * There were four of these — the package editor, the operator's new-booking
 * form, line configuration, and the public booking page — each with its own
 * `kind === 'number' && …` ladder over the same four shapes. Four copies meant
 * four chances to disagree, and they already did: a boolean was `'true'` on one
 * and `'yes'` on another.
 *
 * It also meant the shapes could never grow. Adding `date` to the registry
 * would have rendered nothing on all four surfaces, silently — the field would
 * simply be absent, which looks like a variable that was never declared.
 *
 * So: one component, driven by the kind. A shape added to the registry appears
 * everywhere, or nowhere, and the mistake is impossible to make in only three
 * of the four places.
 *
 * `emptyLabel` is what an unset value means on this surface, and it genuinely
 * differs: to a package, unset means "ask the client"; to a client answering,
 * unset is just blank.
 */
export function VariableField({
  kind,
  value,
  onChange,
  options = [],
  unit,
  min,
  max,
  disabled,
  emptyLabel,
  width,
}: {
  kind: ServiceVariableKind;
  /** Always the raw form value — the caller parses on submit, never per keystroke. */
  value: string | string[];
  onChange: (v: string | string[]) => void;
  options?: string[];
  unit?: string | null;
  min?: number | null;
  max?: number | null;
  disabled?: boolean;
  /** Shown as the blank option where one exists — "Ask the client", say. */
  emptyLabel?: string;
  width?: string;
}) {
  const single = Array.isArray(value) ? (value[0] ?? '') : value;

  if (kind === 'choice') {
    return (
      <select className="q-select" value={single} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} style={{ minWidth: width || '10rem' }}>
        <option value="">{emptyLabel ?? '—'}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  if (kind === 'multichoice') {
    // Chips rather than a multi-select, which is unusable on touch and hides
    // what is chosen behind a scroll.
    const chosen = Array.isArray(value) ? value : (value ? [value] : []);
    const toggle = (o: string) =>
      onChange(chosen.includes(o) ? chosen.filter((x) => x !== o) : [...chosen, o]);
    return (
      <div className="q-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            disabled={disabled}
            className={`q-badge ${chosen.includes(o) ? 'q-badge-accent' : 'q-badge-neutral'}`}
            style={{ cursor: 'pointer' }}
            onClick={() => toggle(o)}
          >
            {o}
          </button>
        ))}
        {options.length === 0 && <span className="q-meta-sm">No answers declared for this yet.</span>}
      </div>
    );
  }

  if (kind === 'boolean') {
    return (
      <select className="q-select" value={single} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} style={{ minWidth: width || '10rem' }}>
        <option value="">{emptyLabel ?? '—'}</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  if (kind === 'textarea') {
    return (
      <textarea className="q-textarea" value={single} disabled={disabled} rows={3}
        onChange={(e) => onChange(e.target.value)} placeholder={emptyLabel}
        style={{ minWidth: width || '16rem' }} />
    );
  }

  if (variableIsNumeric(kind)) {
    return (
      <span className="q-row" style={{ gap: '6px', alignItems: 'center' }}>
        <input className="q-input q-num" type="number" value={single} disabled={disabled}
          min={min ?? undefined} max={max ?? undefined}
          onChange={(e) => onChange(e.target.value)} placeholder={emptyLabel ?? '—'}
          style={{ width: width || '7rem' }} />
        {unit && <span className="q-meta-sm">{Number(single) === 1 ? unit : `${unit}s`}</span>}
      </span>
    );
  }

  // text, date, url — a plain input, typed by the registry.
  return (
    <input
      className="q-input"
      type={kind === 'date' ? 'date' : kind === 'url' ? 'url' : 'text'}
      value={single}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={kind === 'url' ? 'https://…' : emptyLabel}
      style={{ minWidth: width || '10rem' }}
    />
  );
}
