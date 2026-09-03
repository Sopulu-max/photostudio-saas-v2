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
  /**
   * Exactly one owner, and this is one of the three.
   *
   * A variable owned by a SERVICE is what varies about the work — outfits,
   * coverage hours. One owned by a DIMENSION is what follows from a
   * classification — the date of the occasion. One owned by a DELIVERABLE is
   * what a kind of output needs specifying — a print's size, an album's cover.
   *
   * Same shape, same types, same decision about who answers it; only the thing
   * it hangs off differs, which is why this is one type rather than three
   * parallel stacks. The deliverable owner replaced a jsonb `spec_schema` that
   * was exactly such a stack, built smaller and worse: three field types
   * against eight, no unit, no bounds, no default, and no share of the one
   * parser below.
   */
  serviceId: string | null;
  dimensionId?: string | null;
  deliverableId?: string | null;
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

/**
 * WHAT A PACKAGE HAS ACTUALLY SAID ABOUT A VARIABLE.
 *
 * Three states, and a row in package_variable_values only distinguishes two of
 * them by itself:
 *
 *   FIXED     the studio gave it a value; part of the offer, a fact about the
 *             package.
 *   ASKED     the package decided the CLIENT answers it. There is a row — that
 *             is how the decision is recorded — but it deliberately has no
 *             value in it.
 *   UNDECIDED no row at all. Nobody has thought about it yet, which is not the
 *             same as choosing to ask.
 *
 * WHY THIS EXISTS. Every surface computed `fixed = variableValues` — every row,
 * regardless. That was true before a package could record WHO answers a
 * variable, and silently wrong afterwards. An asked variable rendered as a fact
 * with an empty value beside its label: "Location address" and then nothing.
 *
 * It also could not be recovered downstream, because the surfaces rescued open
 * variables by filtering the SERVICE's declared list — and a dimension-owned
 * variable ("Location address" belongs to Context, not to a service) is not in
 * that list. So it showed as a fact it was not, and was missing from the count
 * of questions it belonged to. On the package page, one that WAS service-owned
 * came out twice: blank in the offer, and again as a question.
 *
 * Asked is therefore read from the ANSWERS, never from the declared list, so a
 * variable owned by a dimension is found the same way as one owned by a
 * service. Undecided is the only state the declared list can speak to, because
 * it is the only one with nothing recorded about it.
 *
 * An empty value counts as asked whatever answered_by says: a row claiming the
 * studio fixed this while holding no value is not a fact, whatever it claims.
 */
export type VariableAnswer = {
  serviceVariableId: string;
  label: string;
  unit: string | null;
  kind?: string;
  value: unknown;
  answeredBy?: 'studio' | 'client';
};

export type VariableQuestion = { id: string; label: string };

export function splitVariables(
  answers: VariableAnswer[],
  declared: { id: string; label: string }[] = [],
): { fixed: VariableAnswer[]; asked: VariableQuestion[]; undecided: VariableQuestion[] } {
  const isFact = (a: VariableAnswer) =>
    a.answeredBy !== 'client' && formatVariableValue(a) !== '';

  const fixed = answers.filter(isFact);
  const asked = answers
    .filter((a) => !isFact(a))
    .map((a) => ({ id: a.serviceVariableId, label: a.label }));

  const spokenFor = new Set(answers.map((a) => a.serviceVariableId));
  const undecided = declared
    .filter((d) => !spokenFor.has(d.id))
    .map((d) => ({ id: d.id, label: d.label }));

  return { fixed, asked, undecided };
}
