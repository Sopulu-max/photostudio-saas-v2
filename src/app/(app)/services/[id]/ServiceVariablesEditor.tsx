'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setServiceVariables } from '@/modules/services/interface';
import {
  SERVICE_VARIABLE_KINDS, variableKindLabel, variableKindHint,
  variableNeedsOptions, variableIsNumeric, narrowFor,
} from '@/modules/services/interface';
import type { ServiceVariable, ServiceVariableKind, VariableSuggestions } from '@/modules/services/interface';
import { PickOne, PickMany } from '@/components/Pick';
import { toast, readableError } from '@/components/Toast';

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
  /**
   * A list, not a comma-separated string.
   *
   * It used to be text split on commas, which meant an answer containing a
   * comma was unsayable, and that the answers could never be suggested or
   * reused — they were a blob rather than values.
   */
  options: string[];
  min: string;
  max: string;
};

function toRow(v: ServiceVariable): Row {
  return {
    id: v.id,
    key: v.key,
    label: v.label,
    kind: v.kind,
    unit: v.unit ?? '',
    options: v.options || [],
    min: v.min == null ? '' : String(v.min),
    max: v.max == null ? '' : String(v.max),
  };
}

const blank = (): Row => ({ key: '', label: '', kind: 'number', unit: '', options: [], min: '', max: '' });

/** "Number of outfits" → "number_of_outfits". Shown so the studio can see the name it will be stored under. */
function deriveKey(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function ServiceVariablesEditor({
  serviceId,
  mode = 'edit',
  onChange,
  initial,
  suggestions,
  domainName = '',
  serviceName = '',
}: {
  serviceId?: string;
  mode?: 'create' | 'edit';
  onChange?: (variables: any[]) => void;
  initial: ServiceVariable[];
  /** What the library and this studio's own services say varies about work like this. */
  suggestions?: VariableSuggestions;
  domainName?: string;
  serviceName?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<Row[]>(initial.map(toRow));
  const [saved, setSaved] = useState(false);

  // When rows change, if we have an onChange handler, bubble them up in the API format
  React.useEffect(() => {
    if (onChange) {
      onChange(rows
        .filter((r) => r.label.trim())
        .map((r) => ({
          id: r.id,
          key: r.key.trim() || deriveKey(r.label),
          label: r.label.trim(),
          kind: r.kind,
          unit: variableIsNumeric(r.kind) ? r.unit.trim() || null : null,
          options: variableNeedsOptions(r.kind) ? r.options : [],
          min: variableIsNumeric(r.kind) && r.min !== '' ? Number(r.min) : null,
          max: variableIsNumeric(r.kind) && r.max !== '' ? Number(r.max) : null,
        })));
    }
  }, [rows]);

  const original = JSON.stringify(initial.map(toRow));
  const dirty = JSON.stringify(rows) !== original;

  /*
   * What the app already knows varies about work like this — the library's own
   * services first where the name is recognised, the domain's union otherwise.
   */
  const labelOptions = narrowFor(suggestions?.labels, domainName || '', serviceName || '')
    .filter((l) => !rows.some((r) => r.label.trim().toLowerCase() === l.toLowerCase()));
  const unitOptions = suggestions?.units || [];

  /**
   * Naming a variable the app recognises brings its shape with it: "Hours of
   * coverage" is a number measured in hours, and that is one fact rather than
   * three fields to fill in. Only ever fills what is still empty — a studio
   * that has already said something is not overruled by the library.
   */
  const applyLabel = (r: Row, label: string): Partial<Row> => {
    const known = suggestions?.shapeFor[label.trim().toLowerCase()];
    return {
      label,
      // The key follows the label until the variable is saved; after that it is
      // fixed, because packages point at it.
      key: r.id ? r.key : deriveKey(label),
      ...(known?.kind && !r.id ? { kind: known.kind as any } : {}),
      ...(known?.unit && !r.unit.trim() ? { unit: known.unit } : {}),
      ...(known?.options?.length && r.options.length === 0 ? { options: known.options } : {}),
    };
  };

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
          serviceId: serviceId!,
          variables: rows
            .filter((r) => r.label.trim())
            .map((r) => ({
              id: r.id,
              key: r.key.trim() || deriveKey(r.label),
              label: r.label.trim(),
              kind: r.kind,
              unit: variableIsNumeric(r.kind) ? r.unit.trim() || null : null,
              options: variableNeedsOptions(r.kind) ? r.options : [],
              min: variableIsNumeric(r.kind) && r.min !== '' ? Number(r.min) : null,
              max: variableIsNumeric(r.kind) && r.max !== '' ? Number(r.max) : null,
            })),
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        router.refresh();
      } catch (e: any) {
        toast.bad(readableError(e, 'Failed to save.'));
      }
    });

  return (
    <div className="q-card q-section">
      <div className="q-row q-row-between">
        <div>
          <h2 className="q-section-title">Variables</h2>
          <p className="q-meta" style={{ marginBottom: 0 }}>
            What can vary about this service — outfits, coverage hours, revision rounds. A package sets a
            value; anything left unset becomes a question for the client at booking.
          </p>
        </div>
        {saved && <span className="q-badge q-badge-success">Saved</span>}
      </div>

      {rows.length === 0 ? (
        <p className="q-empty" style={{ marginTop: '16px' }}>
          None defined. This service can only be sold as a fixed offering.
        </p>
      ) : (
        <div className="q-stack q-stack-sm" style={{ marginTop: '16px' }}>
          {rows.map((r, i) => (
            <div key={i} className="q-tile q-stack q-stack-sm">
              <div className="q-row" style={{ flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '12rem' }}>
                  <PickOne
                    value={r.label}
                    onChange={(v) => patch(i, applyLabel(r, v))}
                    options={labelOptions}
                    placeholder="e.g. Number of outfits"
                    disabled={isPending}
                  />
                </div>
                <select
                  className="q-select"
                  value={r.kind}
                  disabled={isPending}
                  title={variableKindHint(r.kind)}
                  onChange={(e) => patch(i, { kind: e.target.value as ServiceVariableKind })}
                  style={{ width: '10rem' }}
                >
                  {SERVICE_VARIABLE_KINDS.map((k) => (
                    <option key={k} value={k}>{variableKindLabel(k)}</option>
                  ))}
                </select>
                <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending || i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending || i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button className="q-btn q-btn-secondary q-btn-xs" disabled={isPending} onClick={() => remove(i)}>Remove</button>
              </div>

              {variableIsNumeric(r.kind) && (
                <div className="q-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ width: '11rem' }}>
                    <PickOne
                      value={r.unit}
                      onChange={(v) => patch(i, { unit: v })}
                      options={unitOptions}
                      placeholder="unit — e.g. outfit"
                      disabled={isPending}
                    />
                  </div>
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

              {variableNeedsOptions(r.kind) && (
                <div>
                  <PickMany
                    values={r.options}
                    onChange={(v) => patch(i, { options: v })}
                    options={(suggestions?.shapeFor[r.label.trim().toLowerCase()]?.options || [])
                      .filter((o) => !r.options.includes(o))}
                    placeholder="Add an option"
                    disabled={isPending}
                  />
                  <span className="q-meta-sm" style={{ opacity: 0.7 }}>
                    {r.kind === 'multichoice'
                      ? 'The client may select more than one.'
                      : 'The client selects exactly one.'}
                  </span>
                </div>
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
        {mode !== 'create' && dirty && (
          <>
            <button className="q-btn q-btn-secondary q-btn-sm" disabled={isPending} onClick={() => setRows(initial.map(toRow))}>
              Cancel
            </button>
            <button className="q-btn q-btn-primary q-btn-sm" aria-busy={isPending} disabled={isPending || !serviceId} onClick={save}>
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
