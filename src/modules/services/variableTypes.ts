/**
 * Service Variables — the per-service half of a Configuration Schema.
 *
 * Dimensions are shared vocabulary (Occasion: Wedding). Variables are what
 * scopes one particular service: outfits, edited images, coverage hours,
 * revision rounds. A service declares them; a package fixes a value; anything a
 * package leaves unset stays a question for the client.
 *
 * A variable's KIND is `FieldTypeKey` — the same registry intake questions use.
 * There used to be a second, smaller enum here (number / choice / boolean /
 * text), which meant a variable could not be a date, a multi-select or a URL
 * while a question could, and that a boolean was parsed as `'true'` on one
 * surface and `'yes'` on another. One concept, one registry.
 *
 * Still bounded, deliberately: a kind decides how a value is stored, validated
 * and rendered, so an open one is an unrenderable one. The engine owns the
 * shapes; the studio owns the vocabulary that fills them.
 *
 * Not a "use server" file — domain.ts can only export async functions, so these
 * plain types live here, same as dimensions.ts.
 */

import { FIELD_TYPES, type FieldTypeKey } from './fieldTypes';

export type ServiceVariableKind = FieldTypeKey;

/** Every shape a variable can take, in the order a studio should meet them. */
export const SERVICE_VARIABLE_KINDS = [
  'number', 'choice', 'multichoice', 'boolean', 'text', 'textarea', 'date', 'url',
] as const satisfies readonly FieldTypeKey[];

/** How each shape reads to a studio, borrowed from the registry rather than restated. */
export const variableKindLabel = (kind: ServiceVariableKind) => FIELD_TYPES[kind]?.label ?? kind;
export const variableKindHint = (kind: ServiceVariableKind) => FIELD_TYPES[kind]?.hint ?? '';

/** Which kinds need the studio to supply a list of answers. */
export const variableNeedsOptions = (kind: ServiceVariableKind) => !!FIELD_TYPES[kind]?.needsOptions;

/** Only a number is bounded by min/max, and only a number reads with a unit. */
export const variableIsNumeric = (kind: ServiceVariableKind) => kind === 'number';

export type ServiceVariable = {
  id: string;
  serviceId: string;
  key: string;
  label: string;
  kind: ServiceVariableKind;
  unit: string | null;
  options: string[];
  defaultValue: unknown;
  min: number | null;
  max: number | null;
  position: number;
};

export type ServiceVariableInput = {
  /** Present when editing an existing variable; absent when adding one. */
  id?: string;
  key: string;
  label: string;
  kind?: ServiceVariableKind;
  unit?: string | null;
  options?: string[];
  defaultValue?: unknown;
  min?: number | null;
  max?: number | null;
};

/** What a package has fixed. */
export type PackageVariableValue = {
  serviceVariableId: string;
  key: string;
  label: string;
  unit: string | null;
  value: unknown;
};

/**
 * A raw form value, in the shape the kind stores.
 *
 * One function, because there were three and they disagreed: the public booking
 * form read a boolean as `'true'`, the operator's new-booking form read it as
 * `'yes'`, and line configuration did its own thing again. Whichever surface a
 * value arrives from, it lands the same way.
 *
 * Empty means unanswered — `null`, never a coerced zero or an empty string
 * masquerading as an answer, because "not fixed" is what makes a package leave
 * a question open for the client.
 */
export function parseVariableValue(kind: ServiceVariableKind, raw: unknown): unknown {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;

  switch (kind) {
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      const s = String(raw).toLowerCase();
      if (['true', 'yes', 'included', '1'].includes(s)) return true;
      if (['false', 'no', 'excluded', '0'].includes(s)) return false;
      return null;
    }
    case 'multichoice':
      return Array.isArray(raw) ? raw.filter(Boolean) : [String(raw)];
    default:
      return String(raw);
  }
}

/** "2 outfits", "8 hours", "Yes" — how a fixed value reads on a package. */
export function formatVariableValue(v: { value: unknown; unit: string | null }): string {
  if (v.value === null || v.value === undefined || v.value === '') return '';
  if (typeof v.value === 'boolean') return v.value ? 'Yes' : 'No';
  if (Array.isArray(v.value)) return v.value.join(', ');
  const body = String(v.value);
  if (!v.unit) return body;
  // "1 hour", not "1 hours"
  const plural = Number(v.value) === 1 ? v.unit : `${v.unit}s`;
  return `${body} ${plural}`;
}
