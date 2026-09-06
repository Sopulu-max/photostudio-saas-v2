'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { stageBadgeClass } from '@/components/stageBadge';
import { formatMoney, formatDuration } from '@/kernel/currency';

type Item =
  | { kind: 'booking'; at: string; durationMinutes: number | null; bookingId: string; title: string; stage: string | null; stageKind: string | null; stageColor: string | null; client: string | null; lines: string[] }
  /* When the agreement was made. Carries the shoot so the day panel can say
     what became of it without a second read. */
  | { kind: 'placed'; at: string; bookingId: string; title: string; client: string | null; stage: string | null; stageKind: string | null; stageColor: string | null; scheduledFor: string | null }
  /* When the thing the work is about happens — a bare YYYY-MM-DD, because that
     is what a date input records and it is a day, not an instant. */
  | { kind: 'occasion'; at: string; bookingId: string; bookingTitle: string; client: string | null; dimensionName: string; title: string; scheduledFor: string | null }
  | { kind: 'deadline'; at: string; taskId: string; title: string; status: string; bookingId: string; bookingTitle: string; lineTitle: string }
  | { kind: 'money'; at: string; transactionId: string; title: string; amount: number; currency: string; status: string; bookingId: string | null; bookingTitle: string | null };

/*
 * A booking now shows up on three of these, and the order is the order of the
 * story: it was taken, it will be worked, and it is about something that has
 * its own day.
 */
const layersFor = (occasionLabel: string) => [
  { key: 'booking', label: 'Shoots', dot: 'var(--q-color-accent)' },
  /*
   * "Booked on", not "Booked" — a stage is called that.
   *
   * A booking's stage badge sits in this same panel, so a layer named Booked
   * put the word inches from itself meaning something else entirely: one is a
   * day, the other is where the work has got to. "Booked on" can only be read
   * as a date.
   */
  { key: 'placed', label: 'Booked on', dot: 'var(--q-color-ink-400)' },
  { key: 'occasion', label: occasionLabel, dot: 'var(--q-color-warm-deep, var(--q-color-warm))' },
  { key: 'deadline', label: 'Deadlines', dot: 'var(--q-color-warm)' },
  { key: 'money', label: 'Money', dot: 'var(--q-color-success)' },
] as const;

/*
 * A day, from whatever kind of when this is.
 *
 * A shoot is an instant and gets converted; a classification's date is already
 * a bare day, and putting it through a Date would shift it across midnight for
 * anybody west of UTC — the same class of fault that moved every Lagos booking
 * an hour earlier. So a value that is already a day is left as one.
 */
const dayKey = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date(value).toISOString().slice(0, 10);

/** How far apart two days are, said the way an operator would say it. */
function apartFrom(day: string, instant: string | null): string | null {
  if (!instant) return null;
  const other = new Date(instant).toISOString().slice(0, 10);
  if (other === day) return 'same day';
  const days = Math.round(
    (Date.parse(day + 'T00:00:00Z') - Date.parse(other + 'T00:00:00Z')) / 86400000,
  );
  const n = Math.abs(days);
  return days > 0 ? `${n} day${n === 1 ? '' : 's'} after the shoot` : `${n} day${n === 1 ? '' : 's'} before the shoot`;
}


export function CalendarClient({
  items,
  occasionLayerLabel = 'Occasions',
  year,
  month,
  monthLabel,
  prevHref,
  nextHref,
  todayKey,
}: {
  items: Item[];
  /** The studio's own name for the question its dated classification asks. */
  occasionLayerLabel?: string;
  year: number;
  month: number; // 1-12
  monthLabel: string;
  prevHref: string;
  nextHref: string;
  todayKey: string;
}) {
  const LAYERS = useMemo(() => layersFor(occasionLayerLabel), [occasionLayerLabel]);
  const [on, setOn] = useState<Record<string, boolean>>({
    booking: true, placed: true, occasion: true, deadline: true, money: true,
  });
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
                      {it.kind === 'money' ? formatMoney((it as any).amount, (it as any).currency) : it.title}
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
                          {new Date(it.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          {it.durationMinutes ? (
                            <> – {new Date(new Date(it.at).getTime() + it.durationMinutes * 60000)
                              .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                              {' '}<span className="q-meta-sm">({formatDuration(it.durationMinutes)})</span></>
                          ) : null}
                        </div>
                        <div className="q-meta">
                          {it.client || 'No client yet'}
                          {it.lines.length > 0 && <> · {it.lines.join(', ')}</>}
                        </div>
                        <div className="q-row" style={{ marginTop: '9px' }}>
                          <span className={`q-badge ${stageBadgeClass({ kind: it.stageKind, color: it.stageColor })}`}>{it.stage}</span>
                          <Link href={`/bookings/${it.bookingId}`} className="q-btn q-btn-secondary q-btn-xs">Open</Link>
                        </div>
                      </>
                    )}

                    {/*
                      * WHEN IT CAME IN. Retrospective, and paired with what
                      * became of it — a booking taken on the 3rd for a shoot
                      * on the 20th is a different fact from one taken the
                      * morning of.
                      */}
                    {it.kind === 'placed' && (
                      <>
                        <strong className="q-block">{it.title}</strong>
                        <div className="q-meta">
                          {new Date(it.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          {it.client && <> · {it.client}</>}
                        </div>
                        <div className="q-meta">
                          {it.scheduledFor
                            ? <>Shoot {new Date(it.scheduledFor).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</>
                            : 'No date agreed yet'}
                        </div>
                        <div className="q-row" style={{ marginTop: '9px' }}>
                          {it.stage && <span className={`q-badge ${stageBadgeClass({ kind: it.stageKind, color: it.stageColor })}`}>{it.stage}</span>}
                          <Link href={`/bookings/${it.bookingId}`} className="q-btn q-btn-secondary q-btn-xs">Open</Link>
                        </div>
                      </>
                    )}

                    {/*
                      * THE DAY THE WORK IS ABOUT.
                      *
                      * Said with its distance from the shoot, because that gap
                      * is the operational fact: a portrait for the 14th taken
                      * on the 7th has to be delivered in the week between, and
                      * a wedding shot on the wedding day has no such window.
                      */}
                    {it.kind === 'occasion' && (
                      <>
                        <strong className="q-block">{it.title}</strong>
                        <div className="q-meta">
                          {it.bookingTitle}
                          {it.client && <> · {it.client}</>}
                        </div>
                        <div className="q-meta">
                          {apartFrom(it.at, it.scheduledFor) ?? 'No shoot date agreed yet'}
                        </div>
                        <div className="q-row" style={{ marginTop: '9px' }}>
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
                          {formatMoney(it.amount, it.currency)} · {it.title}
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
