'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';

type Item =
  | { kind: 'booking'; at: string; bookingId: string; title: string; status: string; client: string | null; services: string[] }
  | { kind: 'deadline'; at: string; taskId: string; title: string; status: string; bookingId: string; bookingTitle: string; lineTitle: string }
  | { kind: 'money'; at: string; transactionId: string; title: string; amount: number; currency: string; status: string; bookingId: string | null; bookingTitle: string | null };

const LAYERS = [
  { key: 'booking', label: 'Shoots', dot: 'var(--q-color-accent)' },
  { key: 'deadline', label: 'Deadlines', dot: 'var(--q-color-warm)' },
  { key: 'money', label: 'Money', dot: 'var(--q-color-success)' },
] as const;

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const money = (a: number, c: string) => `${c === 'USD' ? '$' : ''}${a.toLocaleString()}${c === 'USD' ? '' : ' ' + c}`;

export function CalendarClient({
  items,
  year,
  month,
  monthLabel,
  prevHref,
  nextHref,
  todayKey,
}: {
  items: Item[];
  year: number;
  month: number; // 1-12
  monthLabel: string;
  prevHref: string;
  nextHref: string;
  todayKey: string;
}) {
  const [on, setOn] = useState<Record<string, boolean>>({ booking: true, deadline: true, money: true });
  const [selected, setSelected] = useState<string | null>(null);

  const visible = useMemo(() => items.filter((i) => on[i.kind]), [items, on]);

  const byDay = useMemo(() => {
    const m: Record<string, Item[]> = {};
    for (const i of visible) (m[dayKey(i.at)] ??= []).push(i);
    return m;
  }, [visible]);

  // Month grid, padded to whole weeks (Mon-first).
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const startPad = (first.getUTCDay() + 6) % 7; // Mon = 0
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const out: { key: string | null; day: number | null }[] = [];
    for (let i = 0; i < startPad; i++) out.push({ key: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const key = new Date(Date.UTC(year, month - 1, d)).toISOString().slice(0, 10);
      out.push({ key, day: d });
    }
    while (out.length % 7 !== 0) out.push({ key: null, day: null });
    return out;
  }, [year, month]);

  const selectedItems = selected ? byDay[selected] || [] : [];

  return (
    <div>
      <header className="q-page-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="q-page-title">Calendar</h1>
          <p className="q-page-subtitle">What's coming. Turn layers on and off; pick a day for the detail.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Link href={prevHref} className="q-btn q-btn-secondary" style={{ padding: '6px 12px' }}>←</Link>
          <span style={{ minWidth: '10rem', textAlign: 'center', fontWeight: 600 }}>{monthLabel}</span>
          <Link href={nextHref} className="q-btn q-btn-secondary" style={{ padding: '6px 12px' }}>→</Link>
        </div>
      </header>

      {/* Layers */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
        {LAYERS.map((l) => {
          const active = on[l.key];
          const count = items.filter((i) => i.kind === l.key).length;
          return (
            <button
              key={l.key}
              onClick={() => setOn((s) => ({ ...s, [l.key]: !s[l.key] }))}
              className="q-btn q-btn-secondary"
              style={{
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: active ? 1 : 0.45,
                borderColor: active ? 'var(--q-color-ink-300)' : undefined,
              }}
              aria-pressed={active}
            >
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: l.dot, flexShrink: 0 }} />
              {l.label}
              <span style={{ color: 'var(--q-color-ink-500)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(0, 1fr) 320px' : '1fr', gap: '20px', alignItems: 'start' }}>
        {/* Month grid */}
        <div className="q-card" style={{ padding: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '8px' }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} style={{ fontFamily: 'var(--q-font-mono)', fontSize: '0.64rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--q-color-ink-400)', textAlign: 'center' }}>
                {d}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
            {cells.map((c, i) => {
              if (!c.key) return <div key={`pad-${i}`} />;
              const dayItems = byDay[c.key] || [];
              const isToday = c.key === todayKey;
              const isSel = c.key === selected;
              return (
                <button
                  key={c.key}
                  onClick={() => setSelected(isSel ? null : c.key)}
                  style={{
                    minHeight: '84px',
                    textAlign: 'left',
                    padding: '7px 8px',
                    borderRadius: '9px',
                    border: `1px solid ${isSel ? 'var(--q-color-accent)' : 'var(--q-color-ink-100)'}`,
                    background: isSel ? 'var(--q-color-accent-soft)' : 'var(--q-color-paper-base)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <span style={{
                    fontSize: '0.78rem',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? 'var(--q-color-accent)' : 'var(--q-color-ink-600)',
                  }}>
                    {c.day}
                  </span>
                  {dayItems.slice(0, 3).map((it, k) => (
                    <span
                      key={k}
                      style={{
                        fontSize: '0.68rem',
                        lineHeight: 1.25,
                        color: 'var(--q-color-ink-700)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: LAYERS.find((l) => l.key === it.kind)!.dot }} />
                      {it.kind === 'money' ? money((it as any).amount, (it as any).currency) : it.title}
                    </span>
                  ))}
                  {dayItems.length > 3 && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--q-color-ink-400)' }}>+{dayItems.length - 3} more</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day detail — the depth, on demand */}
        {selected && (
          <div className="q-card" style={{ padding: '20px', position: 'sticky', top: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '1rem', margin: 0, fontWeight: 640 }}>
                {new Date(selected + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
              </h2>
              <button onClick={() => setSelected(null)} className="q-btn q-btn-secondary" style={{ fontSize: '0.7rem', padding: '3px 8px' }}>Close</button>
            </div>

            {selectedItems.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--q-color-ink-500)', fontSize: '0.88rem' }}>Nothing on this day.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {selectedItems.map((it, i) => (
                  <div key={i} style={{ padding: '12px 13px', border: '1px solid var(--q-color-ink-100)', borderRadius: '9px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: LAYERS.find((l) => l.key === it.kind)!.dot }} />
                      <span style={{ fontFamily: 'var(--q-font-mono)', fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--q-color-ink-500)' }}>
                        {LAYERS.find((l) => l.key === it.kind)!.label}
                      </span>
                    </div>

                    {it.kind === 'booking' && (
                      <>
                        <strong style={{ display: 'block', fontSize: '0.92rem', marginBottom: '3px' }}>{it.title}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-500)' }}>
                          {it.client || 'No client yet'}
                          {it.services.length > 0 && <> · {it.services.join(', ')}</>}
                        </div>
                        <div style={{ marginTop: '9px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="q-badge q-badge-neutral">{it.status}</span>
                          <Link href={`/bookings/${it.bookingId}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.75rem', padding: '3px 9px' }}>Open</Link>
                        </div>
                      </>
                    )}

                    {it.kind === 'deadline' && (
                      <>
                        <strong style={{ display: 'block', fontSize: '0.92rem', marginBottom: '3px' }}>{it.title}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-500)' }}>{it.bookingTitle} · {it.lineTitle}</div>
                        <div style={{ marginTop: '9px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="q-badge q-badge-neutral">{it.status.replace('_', ' ')}</span>
                          <Link href={`/bookings/${it.bookingId}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.75rem', padding: '3px 9px' }}>Open</Link>
                        </div>
                      </>
                    )}

                    {it.kind === 'money' && (
                      <>
                        <strong style={{ display: 'block', fontSize: '0.92rem', marginBottom: '3px', textTransform: 'capitalize' }}>
                          {money(it.amount, it.currency)} · {it.title}
                        </strong>
                        {it.bookingTitle && <div style={{ fontSize: '0.8rem', color: 'var(--q-color-ink-500)' }}>{it.bookingTitle}</div>}
                        <div style={{ marginTop: '9px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`q-badge ${it.status === 'settled' ? 'q-badge-success' : 'q-badge-warning'}`}>{it.status}</span>
                          <Link href={`/finances/${it.transactionId}`} className="q-btn q-btn-secondary" style={{ fontSize: '0.75rem', padding: '3px 9px' }}>Open</Link>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
