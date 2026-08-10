'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setServiceVariables } from '@/modules/services/interface';
import type { ServiceVariable, ServiceVariableKind } from '@/modules/services/interface';

/**
 * What may vary about this service — the other half of its configuration
 * schema. Dimensions are shared vocabulary (Occasion, Context); these are the
 * quantities that scope this particular service: outfits, coverage hours,
 * rounds of revision.
 *
 * Declaring one here does not commit the studio to anything. A package may fix
 * it, and whatever a package leaves alone becomes a question for the client —
 * which is why nothing here is marked required.
 */

type Row = {
  id?: string;
  key: string;
  label: string;
  kind: ServiceVariableKind;
  unit: string;
  optionsText: string;
  min: string;
  max: string;
};

const KIND_LABEL: Record<ServiceVariableKind, string> = {
  number: 'A number',
  choice: 'One of a list',
  boolean: 'Yes / no',
  text: 'Free text',
};

function toRow(v: ServiceVariable): Row {
  return {
    id: v.id,
    key: v.key,
    label: v.label,
    kind: v.kind,
    unit: v.unit ?? '',
    optionsText: (v.options || []).join(', '),
    min: v.min == null ? '' : String(v.min),
    max: v.max == null ? '' : String(v.max),
  };
}

const blank = (): Row => ({ key: '', label: '', kind: 'number', unit: '', optionsText: '', min: '', max: '' });

/** "Number of outfits" → "number_of_outfits". Shown so the studio can see the name it will be stored under. */
function deriveKey(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function ServiceVariablesEditor({
  serviceId,
  initial,
}: {
  serviceId: string;
  initial: ServiceVariable[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<Row[]>(initial.map(toRow));
  const [saved, setSaved] = useState(false);

  const original = JSON.stringify(initial.map(toRow));
  const dirty = JSON.stringify(rows) !== original;

  const patch = (i: number, updates: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...updates } : r)));

  const remove = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));
  const move = (i: number, delta: number) =>
    setRows((rs) => {
      const next = [...rs];
      const j = i + delta;
      if (j < 0 || j >= next.length) return rs;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = () =>
    startTransition(async () => {
      try {
        await setServiceVariables({
          serviceId,
          variables: rows
            .filter((r) => r.label.trim())
            .map((r) => ({
              id: r.id,
              key: r.key.trim() || deriveKey(r.label),
              label: r.label.trim(),
              kind: r.kind,
              unit: r.kind === 'number' ? r.unit.trim() || null : null,
              options: r.kind === 'choice' ? r.optionsText.split(',').map((o) => o.trim()).filter(Boolean) : [],
              min: r.kind === 'number' && r.min !== '' ? Number(r.min) : null,
              max: r.kind === 'number' && r.max !== '' ? Number(r.max) : null,
            })),
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        router.refresh();
      } catch (e: any) {
        alert(e?.message || 'Failed to save.');
      }
    });

  return (
    <div className="q-card q-section">
      <div className="q-row q-row-between">
        <div>
          <h2 className="q-section-title">What can vary</h2>
          <p className="q-meta" style={{ marginBottom: 0 }}>
            Outfits, coverage hours, rounds of revision. A package fixes these; anything left open becomes a question for the client.
          </p>
        </div>
        {saved && <span className="q-badge q-badge-success">Saved</span>}
      </div>

      {rows.length === 0 ? (
        <p className="q-empty" style={{ marginTop: '16px' }}>
          Nothing declared yet — this service can only be sold as a flat offer.
        </p>
      ) : (
        <div className="q-stack q-stack-sm" style={{ marginTop: '16px' }}>
          {rows.map((r, i) => (
            <div key={i} className="q-tile q-stack q-stack-sm">
              <div className="q-row" style={{ flexWrap: 'wrap' }}>
                <input
                  className="q-input q-fill"
                  value={r.label}
                  placeholder="e.g. Number of outfits"
                  disabled={isPending}
                  onChange={(e) =>
                    patch(i, {
                      label: e.target.value,
                      // The key follows the label until the variable is saved;
                      // after that it is fixed, because packages point at it.
                      key: r.id ? r.key : deriveKey(e.target.value),
                    })
                  }
                  style={{ minWidth: '12rem' }}
                />
                <select
                  className="q-select"
                  value={r.kind}
                  disabled={isPending}
                  onChange={(e) => patch(i, { kind: e.target.value as ServiceVariableKind })}
                  style={{ width: '10rem' }}
                >
                  {(Object.keys(KIND_LABEL) as ServiceVariableKind[]).map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </select>
                <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending || i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending || i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending} onClick={() => remove(i)}>Remove</button>
              </div>

              {r.kind === 'number' && (
                <div className="q-row" style={{ flexWrap: 'wrap' }}>
                  <input
                    className="q-input" value={r.unit} disabled={isPending}
                    onChange={(e) => patch(i, { unit: e.target.value })}
                    placeholder="unit — e.g. outfit" style={{ width: '11rem' }}
                  />
                  <input
                    className="q-input" type="number" value={r.min} disabled={isPending}
                    onChange={(e) => patch(i, { min: e.target.value })}
                    placeholder="min" style={{ width: '6rem' }}
                  />
                  <input
                    className="q-input" type="number" value={r.max} disabled={isPending}
                    onChange={(e) => patch(i, { max: e.target.value })}
                    placeholder="max" style={{ width: '6rem' }}
                  />
                  <span className="q-meta-sm">
                    {r.unit.trim() ? `reads as "2 ${r.unit.trim()}s"` : 'a unit makes it read as "2 outfits" rather than "2"'}
                  </span>
                </div>
              )}

              {r.kind === 'choice' && (
                <input
                  className="q-input" value={r.optionsText} disabled={isPending}
                  onChange={(e) => patch(i, { optionsText: e.target.value })}
                  placeholder="Options, comma separated — e.g. 8x10, 11x14, 16x20"
                />
              )}

              {r.key && <span className="q-meta-sm">stored as <code>{r.key}</code></span>}
            </div>
          ))}
        </div>
      )}

      <div className="q-row" style={{ marginTop: '16px' }}>
        <button className="q-btn q-btn-secondary q-btn-sm" disabled={isPending} onClick={() => setRows((rs) => [...rs, blank()])}>
          + Add something that varies
        </button>
        <span className="q-spacer" />
        {dirty && (
          <>
            <button className="q-btn q-btn-secondary q-btn-sm" disabled={isPending} onClick={() => setRows(initial.map(toRow))}>
              Cancel
            </button>
            <button className="q-btn q-btn-primary q-btn-sm" disabled={isPending} onClick={save}>
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
