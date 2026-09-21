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

/**
 * A monotone cubic through the points: tangents from the neighbours,
 * flattened at local extremes, so a month with nothing reads as nothing
 * and the curve never overshoots. Returns the line, and the area under it.
 */
function curve(points: number[], W: number, H: number, PAD: number) {
  const max = Math.max(...points, 1);
  const n = points.length;
  const x = (i: number) => (n > 1 ? PAD + (i / (n - 1)) * (W - PAD * 2) : W / 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const pts = points.map((v, i) => [x(i), y(v)] as const);
  let d = '';
  if (pts.length > 0) {
    d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const dx = (x1 - x0) / 3;
      const prev = pts[i - 1], next = pts[i + 2];
      const t0 = prev && Math.sign(y0 - prev[1]) === Math.sign(y1 - y0) ? (y1 - prev[1]) / 6 : 0;
      const t1 = next && Math.sign(next[1] - y1) === Math.sign(y1 - y0) ? (next[1] - y0) / 6 : 0;
      d += ` C${x0 + dx},${y0 + t0} ${x1 - dx},${y1 - t1} ${x1},${y1}`;
    }
  }
  const area = pts.length > 0 ? `${d} L${pts[pts.length - 1][0]},${H - PAD} L${pts[0][0]},${H - PAD} Z` : '';
  return { pts, d, area, max, y };
}

/**
 * A sparkline: the same measure's shape, small, beside a figure - the
 * trend at a glance, with the last point marked. `tone` colours it after
 * the figure's delta (up, down, flat) so line and number agree.
 */
export function Sparkline({ points, tone = 'flat' }: { points: number[]; tone?: 'up' | 'down' | 'flat' }) {
  const W = 120, H = 36, PAD = 3;
  const { pts, d, area } = curve(points, W, H, PAD);
  const id = `q-spark-${tone}`;
  const last = pts[pts.length - 1];
  return (
    <svg className={`q-spark q-spark-${tone}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="q-spark-stop-a" />
          <stop offset="1" className="q-spark-stop-b" />
        </linearGradient>
      </defs>
      {area && <path className="q-spark-area" d={area} fill={`url(#${id})`} />}
      {d && <path className="q-spark-line" d={d} />}
      {last && <circle className="q-spark-dot" cx={last[0]} cy={last[1]} r="2.5" />}
    </svg>
  );
}

/**
 * A series over time: one line with the area under it fading down, labels
 * beneath. Points are numbers; the caller formats.
 */
export function Series({ points, labels, format }: { points: number[]; labels: string[]; format?: (n: number) => string }) {
  const W = 600, H = 160, PAD = 8;
  const { pts, d, area, max, y } = curve(points, W, H, PAD);
  const id = `q-series-fill-${React.useId().replace(/[^a-z0-9]/gi, '')}`;
  const fmt = format ?? ((v: number) => String(v));
  return (
    <div className="q-series">
      <svg className="q-series-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="q-series-stop-a" />
            <stop offset="1" className="q-series-stop-b" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} className="q-series-grid" x1={0} x2={W} y1={y(max * f)} y2={y(max * f)} />)}
        {area && <path className="q-series-area" d={area} fill={`url(#${id})`} />}
        {d && <path className="q-series-line" d={d} />}
      </svg>
      <div className="q-series-points" aria-hidden="true">
        {pts.map(([px], i) => (
          <span key={i} className="q-series-point" style={{ '--q-x': px / W, '--q-y': y(points[i]) / H } as unknown as React.CSSProperties} title={`${labels[i]}: ${fmt(points[i])}`} />
        ))}
      </div>
      <div className="q-series-labels">
        {labels.map((l, i) => <span key={i} className="q-series-label" title={fmt(points[i])}>{l}</span>)}
      </div>
    </div>
  );
}
