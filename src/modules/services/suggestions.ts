import { templatesByDomain, SERVICE_TEMPLATES } from './templates';
import type { ServiceTemplate } from './templates';
import { TEMPLATE_DIMENSION_NAMES, dimensionKey } from './dimensions';

/**
 * What the app knows, and how it narrows.
 *
 * The knowledge is a chain, not a lookup. A domain is the first thing chosen,
 * and being a domain means there are things that can be said about it: which
 * services live under it. Choosing one of those says the next thing: which
 * subjects, occasions, contexts, purposes and client types that particular
 * service tends to carry. Photography knows about Portrait Photography;
 * Portrait Photography is what knows about In-studio and Outdoor.
 *
 * This used to collapse to one level — every value any Photography template
 * mentioned, offered the moment you typed Photography. That is a pile, not
 * knowledge: it can tell you Pet is a subject somewhere in Photography, but
 * not that it belongs to Pet Photography rather than to the headshots you are
 * actually defining.
 *
 * Two sources feed every level: the curated template library, so a studio that
 * has defined nothing still gets sense; and the studio's own services, so what
 * it has actually built shapes what gets offered next. Neither is a ceiling —
 * every field stays free text. The suggestions are the knowledge; the typing
 * is the space for everything the library hasn't learned yet.
 *
 * Not a "use server" file — pure computation over already-fetched data, so
 * page components call it directly after their own listServices() fetch.
 */

/** Narrowed by service where known, by domain otherwise. */
export type Narrowed = {
  /** Keyed by lowercased service name. */
  byService: Record<string, string[]>;
  /** Keyed by domain name — the union, for a service the library doesn't know. */
  byDomain: Record<string, string[]>;
};

const key = (s: string) => s.trim().toLowerCase();

function add(rec: Record<string, Set<string>>, k: string, values: Iterable<string>) {
  if (!k) return;
  if (!rec[k]) rec[k] = new Set();
  for (const v of values) if (v) rec[k].add(v);
}

function freeze(rec: Record<string, Set<string>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = Array.from(v);
  return out;
}

type ServiceRow = {
  name?: string | null;
  domain?: { name: string } | null;
  deliverables?: { name: string }[];
  /** As `listServices` returns it: the dimensions that asked, and the values carried. */
  dimensions?: { name: string; values: { name: string }[] }[];
};

/**
 * Which services a domain knows about — the second link in the chain, and the
 * one that was missing entirely. Selecting Photography should say Portrait
 * Photography, Event Photography, Headshot Photography, not leave the studio
 * to remember what a photography studio does.
 *
 * The studio's own services come first in each list: what it has actually
 * built is more relevant to it than what the library imagines.
 */
export function buildServiceSuggestions(services: ServiceRow[]): Record<string, string[]> {
  const own: Record<string, Set<string>> = {};
  const library: Record<string, Set<string>> = {};

  for (const { domain, templates } of templatesByDomain()) {
    add(library, domain, templates.map((t) => t.name));
  }
  for (const s of services) {
    if (s.domain?.name && s.name) add(own, s.domain.name, [s.name]);
  }

  const out: Record<string, string[]> = {};
  for (const domain of new Set([...Object.keys(own), ...Object.keys(library)])) {
    const mine = Array.from(own[domain] ?? []);
    const theirs = Array.from(library[domain] ?? []).filter((n) => !own[domain]?.has(n));
    out[domain] = [...mine, ...theirs];
  }
  return out;
}

/** What a service produces — its own outputs where known, the domain's otherwise. */
export function buildDeliverableSuggestions(services: ServiceRow[]): Narrowed {
  const byService: Record<string, Set<string>> = {};
  const byDomain: Record<string, Set<string>> = {};

  for (const t of SERVICE_TEMPLATES) {
    add(byService, key(t.name), t.deliverables);
    add(byDomain, t.domain, t.deliverables);
  }
  for (const s of services) {
    const names = (s.deliverables || []).map((d) => d.name).filter(Boolean);
    if (names.length === 0) continue;
    if (s.name) add(byService, key(s.name), names);
    if (s.domain?.name) add(byDomain, s.domain.name, names);
  }

  return { byService: freeze(byService), byDomain: freeze(byDomain) };
}

/**
 * Suggestions for every dimension, keyed by the dimension's own name.
 *
 * This was `Record<Dimension, Narrowed>` over a closed five, which meant a
 * studio could add Style to Photography in settings and the form would have
 * nothing to offer under it — not even its own services' Style values. Keying
 * by name removes the ceiling: any dimension a domain asks, seeded or invented,
 * draws on the same two sources.
 */
export type DimensionSuggestions = Record<string, Narrowed>;

/**
 * The same narrowing, for however many dimensions exist.
 *
 * Two sources, as everywhere: the curated library, so a studio that has defined
 * nothing still gets sense; and the studio's own services, so what it has
 * actually built shapes what gets offered next. The library's knowledge is
 * deliberately partial — a template claims a dimension only where it genuinely
 * carries one, never to look complete.
 */
export function buildDimensionSuggestions(services: ServiceRow[]): DimensionSuggestions {
  const perDimension: Record<string, { byService: Record<string, Set<string>>; byDomain: Record<string, Set<string>> }> = {};
  const bucket = (name: string) => (perDimension[dimensionKey(name)] ||= { byService: {}, byDomain: {} });

  for (const t of SERVICE_TEMPLATES) {
    for (const [templateKey, dimensionName] of Object.entries(TEMPLATE_DIMENSION_NAMES)) {
      const values = (t[templateKey as keyof ServiceTemplate] as string[] | undefined) || [];
      if (values.length === 0) continue;
      const b = bucket(dimensionName);
      add(b.byService, key(t.name), values);
      add(b.byDomain, t.domain, values);
    }
  }

  // A service carries any number of values per dimension — the studio's own
  // tagging is what teaches the system about services the library never heard of.
  for (const s of services) {
    for (const dim of (s.dimensions || [])) {
      const values = (dim.values || []).map((v) => v.name).filter(Boolean);
      if (values.length === 0) continue;
      const b = bucket(dim.name);
      if (s.name) add(b.byService, key(s.name), values);
      if (s.domain?.name) add(b.byDomain, s.domain.name, values);
    }
  }

  const out: DimensionSuggestions = {};
  for (const [name, b] of Object.entries(perDimension)) {
    out[name] = { byService: freeze(b.byService), byDomain: freeze(b.byDomain) };
  }
  return out;
}

/**
 * What a service's variables tend to be — the vocabulary that was never offered.
 *
 * The library has always known this in detail: Portrait Photography varies by
 * "Number of outfits" measured in outfits, Wedding Photography by "Hours of
 * coverage" measured in hours. None of it reached the editor, which asked a
 * studio to type both into empty boxes with a placeholder as the only hint.
 *
 * Picking a known label brings its shape with it — kind, unit, and any answers
 * — because those are one fact, not four. A studio that means something else by
 * "Edited images" just overrules it; the suggestion is knowledge, never a lock.
 */
export type VariableSuggestions = {
  /** Labels, narrowed by service then by domain, exactly as everything else is. */
  labels: Narrowed;
  /** What a label is measured in, and what shape it takes. Keyed by lowercased label. */
  shapeFor: Record<string, { kind?: string; unit?: string | null; options?: string[] }>;
  /** Units seen anywhere, for a studio inventing a variable the library lacks. */
  units: string[];
};

type VariableRow = {
  label?: string | null;
  kind?: string | null;
  unit?: string | null;
  options?: string[] | null;
};

export function buildVariableSuggestions(
  services: (ServiceRow & { variables?: VariableRow[] })[]
): VariableSuggestions {
  const byService: Record<string, Set<string>> = {};
  const byDomain: Record<string, Set<string>> = {};
  const shapeFor: Record<string, { kind?: string; unit?: string | null; options?: string[] }> = {};
  const units = new Set<string>();

  const learn = (v: VariableRow) => {
    const label = (v.label || '').trim();
    if (!label) return;
    if (v.unit) units.add(v.unit);
    // First writer wins, and the studio's own services are learned last on
    // purpose — what it actually built should overrule the library.
    shapeFor[key(label)] = {
      kind: v.kind || shapeFor[key(label)]?.kind,
      unit: v.unit ?? shapeFor[key(label)]?.unit ?? null,
      options: (v.options && v.options.length > 0) ? v.options : shapeFor[key(label)]?.options,
    };
  };

  for (const t of SERVICE_TEMPLATES) {
    const vars = (t.variables || []) as VariableRow[];
    if (vars.length === 0) continue;
    const labels = vars.map((v) => (v.label || '').trim()).filter(Boolean);
    add(byService, key(t.name), labels);
    add(byDomain, t.domain, labels);
    for (const v of vars) learn(v);
  }

  for (const s of services) {
    const vars = (s.variables || []) as VariableRow[];
    if (vars.length === 0) continue;
    const labels = vars.map((v) => (v.label || '').trim()).filter(Boolean);
    if (s.name) add(byService, key(s.name), labels);
    if (s.domain?.name) add(byDomain, s.domain.name, labels);
    for (const v of vars) learn(v);
  }

  return {
    labels: { byService: freeze(byService), byDomain: freeze(byDomain) },
    shapeFor,
    units: [...units].sort(),
  };
}

/**
 * What to offer for a field, given how far down the chain the form has got.
 *
 * A named service the app knows narrows to that service's own values. Anything
 * else falls back to the domain, which is still better than nothing — and both
 * are suggestions, never limits.
 */
export function narrowFor(n: Narrowed | undefined, domain: string, serviceName: string): string[] {
  if (!n) return [];
  const exact = n.byService[key(serviceName)];
  if (exact?.length) return exact;
  return n.byDomain[domain.trim()] ?? [];
}
