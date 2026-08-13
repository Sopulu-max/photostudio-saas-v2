/**
 * Shapes and seeded names for the dimension graph. Not a `use server` file:
 * `domain.ts` may only export async functions, so plain types and constants
 * live here instead.
 *
 * There used to be a closed five here — `DIMENSIONS = ['subject', 'occasion',
 * 'context', 'purpose', 'client']` — and everything downstream was a
 * `Record<Dimension, …>`. That constant was the ceiling: a studio could invent
 * a dimension in settings and then find no field for it anywhere, because
 * every consumer was keyed by a union type the studio could not extend.
 *
 * Dimensions now belong to a service domain and are ordinary rows. What
 * remains here is what is genuinely engine-owned: the NAMES the template
 * library speaks, so a seeded template's `subjects: ['Person']` can be matched
 * against a domain's own Subject dimension — by name, the way a studio's own
 * dimension would be.
 */

/** A dimension as the form and the public intake read it. */
export type StudioDimensionShape = {
  id: string;
  name: string;
  question: string | null;
  example: string | null;
  position: number;
  values: { id: string; name: string }[];
};

/** What a service is classified as, grouped by the dimension asking. */
export type ServiceDimensionTag = {
  id: string;
  name: string;
  question: string | null;
  position: number;
  values: { id: string; name: string }[];
};

/**
 * A dimension as the public booking intake reads it — no auth, and carrying
 * its domain, since two domains may both ask about Context and mean different
 * things by it.
 */
export type PublicIntakeDimension = {
  id: string;
  name: string;
  question: string | null;
  domainId: string | null;
  domainName: string | null;
  values: { id: string; name: string }[];
};

/** What the editor sends back: a dimension by name, and the values chosen under it. */
export type DimensionWrite = { name: string; values: string[] };

/**
 * The template library's five keys, and the dimension name each one means.
 *
 * These are the names the seeded dimensions ship under, per domain. A studio
 * that renames Occasion to "Event type" simply stops matching, and its own
 * tagging takes over — which is correct: the library's knowledge is a
 * starting point, not a claim on the studio's vocabulary.
 */
export const TEMPLATE_DIMENSION_NAMES = {
  subjects: 'Subject',
  occasions: 'Occasion',
  contexts: 'Context',
  purposes: 'Purpose',
  clientTypes: 'Client',
} as const;

export type TemplateDimensionKey = keyof typeof TEMPLATE_DIMENSION_NAMES;

/** Dimension names are compared case-insensitively — a studio types how it types. */
export const dimensionKey = (name: string) => (name || '').trim().toLowerCase();
