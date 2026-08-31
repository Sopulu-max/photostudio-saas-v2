'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { VariableField } from '@/components/VariableField';
import { parseVariableValue } from '@/modules/services/variableTypes';
import { setLineConfiguration } from '@/modules/bookings/interface';
import { formatVariableValue } from '@/modules/services/variableTypes';
import { toast, readableError } from '@/components/Toast';

export type LineConfigField = {
  serviceVariableId: string;
  serviceId: string;
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
  package: 'Fixed by package',
  client: 'Asked for',
  studio: 'Agreed',
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
        // Parsed the one way every surface parses, then bounds-checked here
        // because only this surface can tell the operator what went wrong.
        const value = parseVariableValue(f.kind as any, raw);
        if (f.kind === 'number') {
          if (typeof value !== 'number') { toast.bad(`${f.label} has to be a number.`); return; }
          if (f.min != null && value < f.min) { toast.bad(`${f.label} can't be below ${f.min}.`); return; }
          if (f.max != null && value > f.max) { toast.bad(`${f.label} can't be above ${f.max}.`); return; }
        }
        answers.push({ serviceVariableId: f.serviceVariableId, value });
      }
      if (answers.length === 0 && clear.length === 0) { setEditing(false); return; }
      try {
        await setLineConfiguration({ bookingId, lineId, answers, clear, source: 'studio' });
        setEditing(false);
        router.refresh();
      } catch (e: any) {
        toast.bad(readableError(e, 'Something went wrong.'));
      }
    });

  if (fields.length === 0) return null;

  // Group by service
  const byService = new Map<string, { serviceName: string; fields: LineConfigField[] }>();
  for (const f of fields) {
    const s = byService.get(f.serviceId) || { serviceName: f.serviceName, fields: [] };
    s.fields.push(f);
    byService.set(f.serviceId, s);
  }

  if (!editing) {
    const held = fields.filter((f) => f.value != null);
    return (
      <div className="q-stack q-stack-sm" style={{ marginTop: '12px' }}>
        {held.length === 0 ? (
          <div className="q-row">
            <span className="q-meta-sm">Nothing agreed yet</span>
            <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => { setDraft(initial()); setEditing(true); }}>Set</button>
          </div>
        ) : (
          <div className="q-stack q-stack-sm">
            {Array.from(byService.values()).map(({ serviceName, fields: sFields }) => {
              const sHeld = sFields.filter((f) => f.value != null);
              if (sHeld.length === 0) return null;
              return (
                <div key={serviceName} className="q-note q-stack q-stack-sm">
                  <div className="q-label" style={{ fontSize: '0.8rem' }}>{serviceName}</div>
                  <div className="q-stack q-stack-xs" style={{ paddingLeft: '8px' }}>
                    {sHeld.map((f) => (
                      <div key={f.serviceVariableId} className="q-row q-row-between q-meta-sm">
                        <span>{f.label}</span>
                        <div className="q-row q-row-sm">
                          <strong className="q-strong" style={{ color: 'var(--q-color-ink-700)' }}>
                            {formatVariableValue({ value: f.value, unit: f.unit })}
                          </strong>
                          {f.source && f.source !== 'package' && (
                            <span style={{ fontSize: '0.75rem', padding: '2px 6px', background: 'var(--q-color-ink-100)', borderRadius: '12px', color: 'var(--q-color-ink-500)' }}>
                              {SOURCE_LABEL[f.source]}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div>
              <button className="q-btn q-btn-secondary q-btn-xs" onClick={() => { setDraft(initial()); setEditing(true); }}>Change</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="q-stack q-stack-md" style={{ marginTop: '12px', padding: '16px', background: 'var(--q-color-paper-subtle)', borderRadius: '12px', border: '1px solid var(--q-color-ink-100)' }}>
      <div>
        <h4 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 600 }}>What this client is getting</h4>
        <p className="q-meta-sm" style={{ margin: 0 }}>Configure the exact details for this booking line.</p>
      </div>

      <div className="q-stack q-stack-md">
        {Array.from(byService.values()).map(({ serviceName, fields: sFields }) => (
          <div key={serviceName} className="q-stack q-stack-sm">
            <div className="q-label">{serviceName}</div>
            <div className="q-stack q-stack-sm" style={{ paddingLeft: '12px', borderLeft: '2px solid var(--q-color-ink-100)' }}>
              {sFields.map((f) => (
                <div key={f.serviceVariableId} className="q-field">
                  <div className="q-row q-row-between">
                    <label className="q-meta-plain" style={{ minWidth: '12rem', marginBottom: '4px' }}>
                      {f.label}
                    </label>
                    {f.source === 'package' && <span className="q-meta-sm" style={{ fontStyle: 'italic' }}>from package</span>}
                  </div>
                  <div className="q-row">
                    <VariableField
                      kind={f.kind as any}
                      value={draft[f.serviceVariableId] ?? ''}
                      onChange={(next) => set(f.serviceVariableId, Array.isArray(next) ? next.join(', ') : next)}
                      options={f.options}
                      unit={f.unit}
                      min={f.min}
                      max={f.max}
                      emptyLabel="Not agreed"
                      width="16rem"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      <div className="q-row" style={{ paddingTop: '8px', borderTop: '1px solid var(--q-color-ink-100)' }}>
        <button className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending} onClick={save}>Save</button>
        <button className="q-btn q-btn-secondary q-btn-sm" onClick={() => { setEditing(false); setDraft(initial()); }}>Cancel</button>
      </div>
    </div>
  );
}
