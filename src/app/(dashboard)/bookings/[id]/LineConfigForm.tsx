'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setLineConfiguration } from '@/modules/bookings/interface';
import { formatVariableValue } from '@/modules/services/variableTypes';

export type LineConfigField = {
  serviceVariableId: string;
  key: string;
  label: string;
  kind: string;
  unit: string | null;
  options: string[];
  min: number | null;
  max: number | null;
  serviceName: string;
  value: unknown;
  source: 'package' | 'client' | 'studio' | null;
};

const SOURCE_LABEL: Record<string, string> = {
  package: 'from the package',
  client: 'asked for',
  studio: 'agreed with the studio',
};

/**
 * What this client is actually getting on this line — and the studio's way to
 * change it. A client who emails asking for two more hours after booking has
 * to land somewhere, and it isn't the package: the package is the offer, this
 * is the agreement.
 *
 * Editing here never re-reads the package, so a package re-scoped next month
 * leaves this line exactly as it was sold.
 */
export function LineConfigForm({
  bookingId,
  lineId,
  fields,
}: {
  bookingId: string;
  lineId: string;
  fields: LineConfigField[];
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const initial = () => {
    const d: Record<string, string> = {};
    for (const f of fields) d[f.serviceVariableId] = f.value == null ? '' : String(f.value);
    return d;
  };
  const [draft, setDraft] = useState<Record<string, string>>(initial);

  const set = (id: string, v: string) => setDraft((d) => ({ ...d, [id]: v }));

  const save = () =>
    startTransition(async () => {
      const answers: { serviceVariableId: string; value: unknown }[] = [];
      const clear: string[] = [];
      for (const f of fields) {
        const raw = (draft[f.serviceVariableId] ?? '').trim();
        const before = f.value == null ? '' : String(f.value);
        if (raw === before) continue;
        if (raw === '') { clear.push(f.serviceVariableId); continue; }
        let value: unknown = raw;
        if (f.kind === 'number') {
          const n = parseFloat(raw);
          if (Number.isNaN(n)) { alert(`${f.label} has to be a number.`); return; }
          if (f.min != null && n < f.min) { alert(`${f.label} can't be below ${f.min}.`); return; }
          if (f.max != null && n > f.max) { alert(`${f.label} can't be above ${f.max}.`); return; }
          value = n;
        } else if (f.kind === 'boolean') {
          value = raw === 'yes';
        }
        answers.push({ serviceVariableId: f.serviceVariableId, value });
      }
      if (answers.length === 0 && clear.length === 0) { setEditing(false); return; }
      try {
        await setLineConfiguration({ bookingId, lineId, answers, clear, source: 'studio' });
        setEditing(false);
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Something went wrong.');
      }
    });

  if (fields.length === 0) return null;

  if (!editing) {
    const held = fields.filter((f) => f.value != null);
    return (
      <div className="q-row" style={{ marginTop: '6px' }}>
        {held.length > 0 ? (
          <span className="q-meta">
            {held
              .map((f) => `${f.label}: ${formatVariableValue({ value: f.value, unit: f.unit })}${f.source && f.source !== 'package' ? ` (${SOURCE_LABEL[f.source]})` : ''}`)
              .join(' · ')}
          </span>
        ) : (
          <span className="q-meta-sm">Nothing agreed yet</span>
        )}
        <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => { setDraft(initial()); setEditing(true); }}>
          {held.length > 0 ? 'Change' : 'Set'}
        </button>
      </div>
    );
  }

  return (
    <div className="q-note q-stack q-stack-sm" style={{ marginTop: '10px' }}>
      <span className="q-meta-sm">What this client is getting</span>
      {fields.map((f) => (
        <div key={f.serviceVariableId} className="q-row">
          <label className="q-meta-plain" style={{ minWidth: '12rem' }}>
            {f.label}
            {f.serviceName && <span className="q-meta-sm">{' · '}{f.serviceName}</span>}
          </label>
          {f.kind === 'choice' && f.options.length > 0 ? (
            <select className="q-input" value={draft[f.serviceVariableId] ?? ''} onChange={(e) => set(f.serviceVariableId, e.target.value)} style={{ minWidth: '10rem' }}>
              <option value="">Not agreed</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : f.kind === 'boolean' ? (
            <select className="q-input" value={draft[f.serviceVariableId] ?? ''} onChange={(e) => set(f.serviceVariableId, e.target.value)} style={{ minWidth: '10rem' }}>
              <option value="">Not agreed</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          ) : (
            <input
              className="q-input"
              type={f.kind === 'number' ? 'number' : 'text'}
              min={f.min ?? undefined}
              max={f.max ?? undefined}
              value={draft[f.serviceVariableId] ?? ''}
              onChange={(e) => set(f.serviceVariableId, e.target.value)}
              placeholder="Not agreed"
              style={{ width: f.kind === 'number' ? '8rem' : '14rem' }}
            />
          )}
          {f.unit && <span className="q-meta-sm">{f.unit}</span>}
          {f.source === 'package' && <span className="q-meta-sm">· from the package</span>}
        </div>
      ))}
      <div className="q-row">
        <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending} onClick={save}>Save</button>
        <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => { setEditing(false); setDraft(initial()); }}>Cancel</button>
      </div>
    </div>
  );
}
