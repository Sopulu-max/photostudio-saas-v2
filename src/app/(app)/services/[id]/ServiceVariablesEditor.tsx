'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setServiceVariables } from '@/modules/services/interface';
import {
  SERVICE_VARIABLE_KINDS, variableKindLabel, variableKindHint,
  variableNeedsOptions, variableIsNumeric, variableHasUnit, narrowFor,
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
  /*
   * THE RATE. What one more costs above what a package fixes (a number), or
   * per option (a choice). Typed as a figure in the studio's currency, kept
   * as text while editing like min and max. Empty: no extra of this can be
   * taken. See 02-ONTOLOGY, Rates.
   */
  rate: string;
  optionRates: Record<string, string>;
};

const moneyText = (m: any) => (m && m.base_price != null ? String(m.base_price) : '');

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
    rate: moneyText(v.rate),
    optionRates: Object.fromEntries(Object.entries(v.optionRates || {}).map(([o, m]) => [o, moneyText(m)])),
  };
}

const blank = (): Row => ({ key: '', label: '', kind: 'number', unit: '', options: [], min: '', max: '', rate: '', optionRates: {} });

/* A rate as money, in the shape every price here uses; null when blank. */
function moneyOf(text: string, currency: string | undefined) {
  const n = Number(String(text).trim());
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? { base_price: n, currency: currency || 'USD' } : null;
}
let currencyForRates: string | undefined;
const rateOf = (r: Row) => (variableIsNumeric(r.kind) || r.kind === 'boolean') ? moneyOf(r.rate, currencyForRates) : null;
const optionRatesOf = (r: Row) => {
  if (!variableNeedsOptions(r.kind)) return null;
  const out: Record<string, Record<string, unknown>> = {};
  for (const o of r.options) { const m = moneyOf(r.optionRates[o] ?? '', currencyForRates); if (m) out[o] = m; }
  return Object.keys(out).length ? out : null;
};

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
  currencyCode,
}: {
  currencyCode?: string;
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
  currencyForRates = currencyCode;
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
          unit: variableHasUnit(r.kind) ? r.unit.trim() || null : null,
          options: variableNeedsOptions(r.kind) ? r.options : [],
          min: variableIsNumeric(r.kind) && r.min !== '' ? Number(r.min) : null,
          max: variableIsNumeric(r.kind) && r.max !== '' ? Number(r.max) : null,
          rate: rateOf(r),
          optionRates: optionRatesOf(r),
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
              unit: variableHasUnit(r.kind) ? r.unit.trim() || null : null,
              options: variableNeedsOptions(r.kind) ? r.options : [],
              min: variableIsNumeric(r.kind) && r.min !== '' ? Number(r.min) : null,
              max: variableIsNumeric(r.kind) && r.max !== '' ? Number(r.max) : null,
              rate: rateOf(r),
              optionRates: optionRatesOf(r),
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

              {variableHasUnit(r.kind) && (
                <div className="q-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ width: '11rem' }}>
                    <PickOne
                      value={r.unit}
                      onChange={(v) => patch(i, { unit: v })}
                      options={unitOptions}
                      placeholder={r.kind === 'size' ? 'unit — e.g. in, cm' : 'unit — e.g. outfit'}
                      disabled={isPending}
                    />
                  </div>
                  {/* Only a number is bounded. A size is one of the sizes offered, and the options say which. */}
                  {variableIsNumeric(r.kind) && (
                    <>
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
                    </>
                  )}
                  <span className="q-meta-sm">
                    {r.kind === 'size'
                      ? (r.unit.trim() ? `reads as "16 × 20 ${r.unit.trim()}"` : 'a unit makes it read as "16 × 20 in" rather than "16 × 20"')
                      : (r.unit.trim() ? `reads as "2 ${r.unit.trim()}s"` : 'a unit makes it read as "2 outfits" rather than "2"')}
                  </span>
                </div>
              )}

              {/* The rate: what one more costs above what a package fixes.
                  Empty means no extra of this can be taken. */}
              {(variableIsNumeric(r.kind) || r.kind === 'boolean') && (
                <div className="q-row" style={{ gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="q-meta-sm q-strong" style={{ minWidth: '3rem' }}>{currencyCode || ''}</span>
                  <input
                    className="q-input" type="number" min={0} step="0.01" value={r.rate} disabled={isPending}
                    onChange={(e) => patch(i, { rate: e.target.value })}
                    placeholder="rate" style={{ width: '8rem' }}
                  />
                  <span className="q-meta-sm">
                    {r.kind === 'boolean' ? 'for yes, beyond what a package includes' : `per ${r.unit.trim() || 'unit'} above what a package fixes`}
                    {r.rate.trim() === '' && ' · empty: no extra of this can be taken'}
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
                    placeholder={r.kind === 'size' ? 'Add a size, e.g. 16x20' : 'Add an option'}
                    disabled={isPending}
                  />
                  <span className="q-meta-sm" style={{ opacity: 0.7 }}>
                    {r.kind === 'multichoice'
                      ? 'The client may select more than one.'
                      : r.kind === 'size'
                        ? 'Typed as 16x20. Each is drawn at its true proportion beside the others.'
                        : 'The client selects exactly one.'}
                  </span>
                  {/* A rate per option: what choosing it costs beyond the one a
                      package fixes. Blank options cost nothing more. */}
                  {r.options.length > 0 && (
                    <div className="q-stack q-stack-sm" style={{ marginTop: '8px' }}>
                      {r.options.map((o) => (
                        <div key={o} className="q-row" style={{ gap: '8px', alignItems: 'center' }}>
                          <span className="q-meta-plain" style={{ minWidth: '9rem' }}>{o}</span>
                          <span className="q-meta-sm q-strong">{currencyCode || ''}</span>
                          <input
                            className="q-input q-input-sm" type="number" min={0} step="0.01" disabled={isPending}
                            value={r.optionRates[o] ?? ''}
                            onChange={(e) => patch(i, { optionRates: { ...r.optionRates, [o]: e.target.value } })}
                            placeholder="rate" style={{ width: '8rem' }}
                          />
                        </div>
                      ))}
                      <span className="q-meta-sm">What choosing an option costs beyond the one a package fixes. Blank: nothing more.</span>
                    </div>
                  )}
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
