'use client';

import React from 'react';
import { fitSizes, describeSize } from '@/modules/services/sizes';

/**
 * Every size the studio offers, drawn at its true proportion beside the
 * others, and one of them chosen.
 *
 * A <select> listing '8×10', '11×14', '16×20' tells a client three pairs of
 * numbers. Drawing them tells them that the largest is four times the area of
 * the smallest, which is the thing they are actually deciding. The same
 * control serves the studio fixing a size on a package and the client picking
 * one on the public form — one idea of what a size looks like, everywhere a
 * size is picked.
 *
 * An option the engine cannot read as a size — a word like 'A4' or 'Poster'
 * that a studio typed — is still offered, as a plain pick. The studio wrote
 * it; hiding it would make the form lie about what is on offer.
 */
export function SizePicker({
  options,
  value,
  onChange,
  unit,
  disabled,
  max = 112,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  unit?: string | null;
  disabled?: boolean;
  /** The longest edge in the set, in pixels. Everything else scales to it. */
  max?: number;
}) {
  const fitted = fitSizes(options, max);

  if (options.length === 0) {
    return <span className="q-meta-sm">No sizes declared for this yet.</span>;
  }

  return (
    <div className="q-sizes" role="radiogroup">
      {fitted.map((f) => {
        const on = value === f.option;
        if (!f.size) {
          return (
            <button
              key={f.option}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              className={on ? 'q-fact q-fact-pick q-fact-on' : 'q-fact q-fact-pick'}
              onClick={() => onChange(on ? '' : f.option)}
            >
              {f.option}
            </button>
          );
        }
        return (
          <button
            key={f.option}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={describeSize(f.option, unit)}
            disabled={disabled}
            className={on ? 'q-size q-size-on' : 'q-size'}
            onClick={() => onChange(on ? '' : f.option)}
          >
            <span
              className="q-size-box"
              style={{ '--q-w': `${f.w}px`, '--q-h': `${f.h}px` } as unknown as React.CSSProperties}
            />
            <span className="q-size-label">{describeSize(f.option, unit)}</span>
          </button>
        );
      })}
    </div>
  );
}
