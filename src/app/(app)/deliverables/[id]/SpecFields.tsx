'use client';

import React from 'react';

/**
 * WHAT THIS KIND OF THING NEEDS SETTLING, DECLARED ONCE.
 *
 * A deliverable ranges from a name and nothing else — "Edited photograph" — to
 * something with a shape: a framed print has a size and a frame; a video has a
 * length; an album has a page count and a cover material. The point of
 * declaring that shape HERE is that it is declared once. Every package that
 * ever promises a framed print is then asked for the size automatically, and
 * every place that renders one says it the same way, because they all go
 * through one formatter.
 *
 * THE CAPABILITY ALREADY EXISTED AND COULD NOT BE REACHED. Three things stood
 * in the way, and all three had to be true at once for it to look like a
 * feature that was simply unused:
 *
 *   1. listDeliverables mapped spec_schema onto every row while the query never
 *      selected the column, so it arrived undefined — the package editor's
 *      `if (!schema) return null` meant the form could never draw, for any
 *      deliverable, ever.
 *   2. The only way to declare a schema was to type raw JSON into a textarea
 *      — `[{"key": "size", "type": "select", "options": ["8x8"]}]` — which no
 *      studio was ever going to do. Nought of eleven rows had one.
 *   3. spec_values on the kind meant two things at once: defaults, and "this is
 *      a locked SKU, show no form".
 *
 * This is the second of those. A field has a name, a kind, and — when it is a
 * choice — the answers permitted. That is all a schema is; it never needed to
 * be JSON.
 */

export type SpecField = {
  /** Stored key. Derived from the label, because two names for one field is one too many. */
  key: string;
  type: 'text' | 'number' | 'select';
  options?: string[];
};

/** A label a person typed, as a key a database can hold. */
export function keyOf(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function SpecFields({
  fields,
  onChange,
  disabled,
}: {
  fields: SpecField[];
  onChange: (next: SpecField[]) => void;
  disabled?: boolean;
}) {
  const patch = (i: number, updates: Partial<SpecField>) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...updates } : f)));

  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));

  const add = () => onChange([...fields, { key: '', type: 'text' }]);

  return (
    <div className="q-stack q-stack-sm">
      {fields.length === 0 && (
        <p className="q-meta-sm">
          Nothing yet. If this kind of thing has a size, a length, a material or anything else that
          changes from one package to the next, say so here once and every package promising it will
          be asked.
        </p>
      )}

      {fields.map((f, i) => (
        <div key={i} className="q-tile q-stack q-stack-sm">
          <div className="q-row" style={{ gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="q-field" style={{ flex: '1 1 12rem', marginBottom: 0 }}>
              <label className="q-label q-label-sm">What is it called?</label>
              <input
                className="q-input q-input-sm"
                value={f.key}
                disabled={disabled}
                placeholder="e.g. Size"
                onChange={(e) => patch(i, { key: e.target.value })}
              />
            </div>
            <div className="q-field" style={{ flex: '0 0 9rem', marginBottom: 0 }}>
              <label className="q-label q-label-sm">Answered with</label>
              <select
                className="q-select q-input-sm"
                value={f.type}
                disabled={disabled}
                onChange={(e) => patch(i, {
                  type: e.target.value as SpecField['type'],
                  // Options belong to a choice. Carrying them onto a text field
                  // would leave them in the row saying nothing.
                  options: e.target.value === 'select' ? (f.options || []) : undefined,
                })}
              >
                <option value="text">Words</option>
                <option value="number">A number</option>
                <option value="select">One of a list</option>
              </select>
            </div>
            <button
              type="button"
              className="q-btn q-btn-secondary q-btn-xs"
              disabled={disabled}
              onClick={() => remove(i)}
            >
              Remove
            </button>
          </div>

          {f.type === 'select' && (
            <div className="q-field" style={{ marginBottom: 0 }}>
              <label className="q-label q-label-sm">The answers allowed</label>
              <input
                className="q-input q-input-sm"
                value={(f.options || []).join(', ')}
                disabled={disabled}
                placeholder="20x30, 16x20, 8x10"
                onChange={(e) => patch(i, {
                  options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean),
                })}
              />
              <span className="q-meta-sm">Separated by commas.</span>
            </div>
          )}
        </div>
      ))}

      <button type="button" className="q-btn q-btn-secondary q-btn-sm" disabled={disabled} onClick={add}>
        + Add something to settle
      </button>
    </div>
  );
}
