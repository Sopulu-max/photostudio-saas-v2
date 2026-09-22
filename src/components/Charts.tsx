import React from 'react';

/**
 * CHARTS - pure drawings, no state, renderable on the server. Colour is a
 * palette name (the stage palette, or 'none' for what takes no value);
 * every fill and stroke is a .q- class over a --q- token, so both themes
 * hold. Widths and arcs are numbers on a custom property, as FramePreview
 * sizes itself - the one kind of value a class cannot carry.
 */

export type ChartSlice = { key: string; label: string; value: number; color: string; on?: boolean };

const shareVar = (n: number) => ({ '--q-share': n } as unknown as React.CSSProperties);

/** A donut: the shape of the whole, with the total in the middle. */
export function Donut({ slices, noun }: { slices: ChartSlice[]; noun: string }) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  const r = 38, circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = slices.map((s) => { const dash = total > 0 ? (s.value / total) * circ : 0; const a = { ...s, dash, offset }; offset += dash; return a; });
  return (
    <svg className="q-donut" viewBox="0 0 100 100" aria-hidden="true">
      <circle className="q-donut-track" cx="50" cy="50" r={r} fill="none" strokeWidth="14" />
      {arcs.map((a) => (
        <circle key={a.key} className={`q-donut-arc q-donut-c-${a.color}`} cx="50" cy="50" r={r} fill="none" strokeWidth="14"
          strokeDasharray={`${a.dash} ${circ}`} strokeDashoffset={-a.offset} transform="rotate(-90 50 50)" />
      ))}
      <text className="q-donut-total" x="50" y="48" textAnchor="middle">{total}</text>
      <text className="q-donut-word" x="50" y="60" textAnchor="middle">{noun}{total === 1 ? '' : 's'}</text>
    </svg>
  );
}

/**
 * Horizontal bars: the values by name - horizontal because the names are
 * a studio's people, packages and bookings, which a vertical bar's label
 * cannot hold. Bars scale to the largest; the share is of the whole.
 * `press` makes each a button; `href` a link; neither, a row.
 */
export function HBars({ slices, press, href }: { slices: ChartSlice[]; press?: (key: string, on: boolean) => void; href?: (key: string, on: boolean) => string }) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  const max = Math.max(...slices.map((s) => s.value), 1);
  const share = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return (
    <div className="q-hbars">
      {slices.map((s) => {
        const on = Boolean(s.on);
        const body = (
          <>
            <span className="q-hbar-label"><i className={`q-dist-dot q-dist-c-${s.color}`} />{s.label}</span>
            <span className="q-hbar-track"><i className={`q-dist-c-${s.color}`} style={shareVar(Math.round((s.value / max) * 100))} /></span>
            <b>{s.value}</b>
            <span className="q-hbar-share">{share(s.value)}%</span>
          </>
        );
        const cls = on ? 'q-hbar q-hbar-on' : 'q-hbar';
        if (press) return <button key={s.key} type="button" className={cls} aria-pressed={on} onClick={() => press(s.key, on)}>{body}</button>;
        if (href) return <a key={s.key} className={cls} aria-current={on ? 'true' : undefined} href={href(s.key, on)}>{body}</a>;
        return <span key={s.key} className={cls}>{body}</span>;
      })}
    </div>
  );
}
