'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { stageBadgeClass } from '@/components/stageBadge';

type Item =
  | { kind: 'booking'; at: string; bookingId: string; title: string; stage: string | null; stageKind: string | null; client: string | null; services: string[] }
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
      <header className="q-page-header">
        <div>
          <h1 className="q-page-title">Calendar</h1>
          <p className="q-page-subtitle">What's coming. Turn layers on and off; pick a day for the detail.</p>
        </div>
        <div className="q-row">
          <Link href={prevHref} className="q-btn q-btn-secondary q-btn-sm">←</Link>
          <span className="q-strong q-center-text" style={{ minWidth: '10rem' }}>{monthLabel}</span>
          <Link href={nextHref} className="q-btn q-btn-secondary q-btn-sm">→</Link>
        </div>
      </header>

      {/* Layers */}
      <div className="q-row" style={{ marginBottom: '20px' }}>
        {LAYERS.map((l) => {
          const active = on[l.key];
          const count = items.filter((i) => i.kind === l.key).length;
          return (
            <button
              key={l.key}
              onClick={() => setOn((s) => ({ ...s, [l.key]: !s[l.key] }))}
              className="q-btn q-btn-secondary"
              style={{ opacity: active ? 1 : 0.45 }}
              aria-pressed={active}
            >
              <span className="q-dot" style={{ ['--dot' as any]: l.dot }} />
              {l.label}
              <span className="q-muted q-num">{count}</span>
            </button>
          );
        })}
      </div>

      <div className={`q-cal-layout ${selected ? 'q-cal-layout-split' : ''}`}>
        {/* Month grid */}
        <div className="q-card">
          <div className="q-cal-grid q-cal-head">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="q-cal-dow">
                {d}
              </div>
            ))}
          </div>
          <div className="q-cal-grid">
            {cells.map((c, i) => {
              if (!c.key) return <div key={`pad-${i}`} />;
              const dayItems = byDay[c.key] || [];
              const isToday = c.key === todayKey;
              const isSel = c.key === selected;
              return (
                <button
                  key={c.key}
                  onClick={() => setSelected(isSel ? null : c.key)}
                  className={`q-cal-day ${isSel ? 'q-cal-day-selected' : ''}`}
                >
                  <span className={`q-cal-daynum ${isToday ? 'q-cal-daynum-today' : ''}`}>
                    {c.day}
                  </span>
                  {dayItems.slice(0, 3).map((it, k) => (
                    <span
                      key={k}
                      className="q-cal-chip"
                    >
                      <span className="q-dot q-dot-sm" style={{ ['--dot' as any]: LAYERS.find((l) => l.key === it.kind)!.dot }} />
                      {it.kind === 'money' ? money((it as any).amount, (it as any).currency) : it.title}
                    </span>
                  ))}
                  {dayItems.length > 3 && (
                    <span className="q-cal-more">+{dayItems.length - 3} more</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day detail — the depth, on demand */}
        {selected && (
          <div className="q-card q-cal-panel">
            <div className="q-row q-row-between" style={{ alignItems: 'baseline', marginBottom: '14px' }}>
              <h2 className="q-section-title" style={{ marginBottom: 0 }}>
                {new Date(selected + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
              </h2>
              <button onClick={() => setSelected(null)} className="q-btn q-btn-secondary q-btn-xs">Close</button>
            </div>

            {selectedItems.length === 0 ? (
              <p className="q-meta" style={{ margin: 0 }}>Nothing on this day.</p>
            ) : (
              <div className="q-stack">
                {selectedItems.map((it, i) => (
                  <div key={i} className="q-tile">
                    <div className="q-row" style={{ marginBottom: '5px' }}>
                      <span className="q-dot q-dot-sm" style={{ ['--dot' as any]: LAYERS.find((l) => l.key === it.kind)!.dot }} />
                      <span className="q-cal-kind">
                        {LAYERS.find((l) => l.key === it.kind)!.label}
                      </span>
                    </div>

                    {it.kind === 'booking' && (
                      <>
                        <strong className="q-block">{it.title}</strong>
                        <div className="q-meta">
                          {it.client || 'No client yet'}
                          {it.services.length > 0 && <> · {it.services.join(', ')}</>}
                        </div>
                        <div className="q-row" style={{ marginTop: '9px' }}>
                          <span className={`q-badge ${stageBadgeClass(it.stageKind)}`}>{it.stage}</span>
                          <Link href={`/bookings/${it.bookingId}`} className="q-btn q-btn-secondary q-btn-xs">Open</Link>
                        </div>
                      </>
                    )}

                    {it.kind === 'deadline' && (
                      <>
                        <strong className="q-block">{it.title}</strong>
                        <div className="q-meta">{it.bookingTitle} · {it.lineTitle}</div>
                        <div className="q-row" style={{ marginTop: '9px' }}>
                          <span className="q-badge q-badge-neutral">{it.status.replace('_', ' ')}</span>
                          <Link href={`/bookings/${it.bookingId}`} className="q-btn q-btn-secondary q-btn-xs">Open</Link>
                        </div>
                      </>
                    )}

                    {it.kind === 'money' && (
                      <>
                        <strong className="q-block q-cap">
                          {money(it.amount, it.currency)} · {it.title}
                        </strong>
                        {it.bookingTitle && <div className="q-meta">{it.bookingTitle}</div>}
                        <div className="q-row" style={{ marginTop: '9px' }}>
                          <span className={`q-badge ${it.status === 'settled' ? 'q-badge-success' : 'q-badge-warning'}`}>{it.status}</span>
                          <Link href={`/finances/${it.transactionId}`} className="q-btn q-btn-secondary q-btn-xs">Open</Link>
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
