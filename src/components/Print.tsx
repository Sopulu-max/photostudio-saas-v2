import React from 'react';

/**
 * THE PRINT.                                                     (D1, D2, D3)
 *
 * A screen that shows one thing. The photograph leads (whoever owns the
 * page draws that - a banner, slides, an avatar); then this: what it is made
 * of as a stamp, its name at the size of a name, the controls that act on it,
 * and the facts on hairlines underneath, the way a label sits under a print.
 *
 * One implementation for every single-thing page, so a package, a booking, a
 * client and an invoice are recognisably the same object at the same weight.
 *
 * A fact is a key and a value. A value may be a figure - set in the mono face
 * at tabular width, and in the warm colour only when it needs the operator
 * (D3) - or an absence, said quietly and naming only what is absent.
 */

export type PrintFact = {
  key: string;
  value?: React.ReactNode;
  /** Set in the mono face; `due` takes the warm colour. */
  figure?: { text: string; due?: boolean };
  /** Shown when there is no value: names what is missing. */
  absent?: React.ReactNode;
  /** A quiet trailer after the value - a count, a unit, an address. */
  more?: React.ReactNode;
};

export function PrintHead({
  stamp,
  name,
  badge,
  actions,
}: {
  stamp?: React.ReactNode;
  name: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="q-print-head">
      <div>
        {stamp && <span className="q-print-stamp">{stamp}</span>}
        {badge ? (
          <div className="q-row" style={{ alignItems: 'center', gap: '12px' }}>
            <h1 className="q-print-name">{name}</h1>
            {badge}
          </div>
        ) : (
          <h1 className="q-print-name">{name}</h1>
        )}
      </div>
      {actions && <div className="q-row">{actions}</div>}
    </div>
  );
}

export function PrintFacts({ facts }: { facts: PrintFact[] }) {
  return (
    <div className="q-print-facts">
      {facts.map((f) => (
        <div key={f.key} className="q-print-fact">
          <span className="q-print-key">{f.key}</span>
          <span className="q-print-val">
            {f.figure
              ? <span className={f.figure.due ? 'q-print-fig q-warm' : 'q-print-fig'}>{f.figure.text}</span>
              : f.value != null && f.value !== '' && f.value !== false
                ? f.value
                : <span className="q-absent">{f.absent ?? 'Not set'}</span>}
            {f.more && <span className="q-print-more">{f.more}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
