'use client';

import React from 'react';
import Link from 'next/link';
import type { LensGroup } from '@/kernel/lenses';

/**
 * THE CUT, which every view shares.
 *
 * One page, five presentations, one cut: the axes set in the URL narrow the
 * rows before any view draws them, so moving from the register to the calendar
 * or the distribution keeps the question and changes only the reading. This bar
 * owns the cut and nothing else - grouping and sorting belong to the view that
 * has them.
 *
 * The saved cuts are derivations rather than presets: each is a value of an
 * axis read off the rows, carrying its own count.
 */

export function CutBar({ lenses, q, saved, shown, total }: {
  lenses: LensGroup[];
  q: Record<string, string | undefined>;
  saved: { key: string; label: string; count: number; href: string; on: boolean }[];
  shown: number;
  total: number;
}) {
  const [open, setOpen] = React.useState(false);

  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    const s = p.toString();
    return `/bookings${s ? `?${s}` : ''}`;
  };

  const set = lenses
    .map((g) => ({ g, value: q[g.key] }))
    .filter((x): x is { g: LensGroup; value: string } => Boolean(x.value));

  return (
    <div className="q-cut">
      <div className="q-cut-saved">
        {saved.map((v) => (
          <Link key={v.key} href={v.href} className={v.on ? 'q-cut-view q-cut-view-on' : 'q-cut-view'}>
            {v.label}<b>{v.count}</b>
          </Link>
        ))}
      </div>

      <div className="q-cut-bar">
        {set.map(({ g, value }) => (
          <Link key={g.key} href={href({ [g.key]: null })} className="q-cut-chip" title={`Remove this from the cut`}>
            <span>{g.label}</span>
            <b>{value === '__none__' ? g.none ?? 'None'
              : value === '__any__' ? 'Any'
              : g.items.find((i) => i.key === value)?.label ?? value}</b>
            <i aria-hidden="true">×</i>
          </Link>
        ))}

        <span className="q-reg-menu">
          <button type="button" className={open ? 'q-reg-btn q-reg-btn-open' : 'q-reg-btn'} onClick={() => setOpen(!open)} aria-expanded={open}>
            Narrow<i className="q-reg-caret" aria-hidden="true">▾</i>
          </button>
          {open && (
            <span className="q-reg-pop">
              {lenses.flatMap((g) => [
                ...g.items.map((it) => (
                  <Link key={`${g.key}:${it.key}`} href={href({ [g.key]: it.key })}
                        className={q[g.key] === it.key ? 'q-reg-pop-item q-reg-pop-on' : 'q-reg-pop-item'}
                        onClick={() => setOpen(false)}>
                    {g.label}: {it.label} ({it.count})
                  </Link>
                )),
                ...(g.none ? [(
                  <Link key={`${g.key}:none`} href={href({ [g.key]: '__none__' })}
                        className={q[g.key] === '__none__' ? 'q-reg-pop-item q-reg-pop-on' : 'q-reg-pop-item'}
                        onClick={() => setOpen(false)}>
                    {g.label}: {g.none}
                  </Link>
                )] : []),
              ])}
            </span>
          )}
        </span>

        {set.length > 0 && (
          <Link href={href(Object.fromEntries(set.map(({ g }) => [g.key, null])))} className="q-cut-clear">Clear</Link>
        )}

        <span className="q-cut-count">{shown === total ? `${total} bookings` : `${shown} of ${total} bookings`}</span>
      </div>
    </div>
  );
}
