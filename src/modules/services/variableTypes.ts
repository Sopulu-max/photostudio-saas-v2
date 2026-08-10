/**
 * Service Variables — the per-service half of a Configuration Schema.
 *
 * Dimensions are shared vocabulary (Occasion: Wedding). Variables are the
 * quantities that scope one particular service: outfits, edited images,
 * coverage hours, revision rounds. A service declares them; a package fixes a
 * value; anything a package leaves unset stays a question for the client.
 *
 * Not a "use server" file — domain.ts can only export async functions, so these
 * plain types live here, same as dimensions.ts.
 */

export const SERVICE_VARIABLE_KINDS = ['number', 'choice', 'boolean', 'text'] as const;
export type ServiceVariableKind = (typeof SERVICE_VARIABLE_KINDS)[number];

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

/** "2 outfits", "8 hours", "Yes" — how a fixed value reads on a package. */
export function formatVariableValue(v: { value: unknown; unit: string | null }): string {
  if (typeof v.value === 'boolean') return v.value ? 'Yes' : 'No';
  const body = String(v.value ?? '');
  if (!v.unit) return body;
  // "1 hour", not "1 hours"
  const plural = Number(v.value) === 1 ? v.unit : `${v.unit}s`;
  return `${body} ${plural}`;
}
