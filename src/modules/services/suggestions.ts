import { templatesByDomain, SERVICE_TEMPLATES } from './templates';
import type { ServiceTemplate } from './templates';
import { DIMENSIONS, type Dimension } from './dimensions';

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
  subject?: { name: string } | null;
  occasion?: { name: string } | null;
  context?: { name: string } | null;
  purpose?: { name: string } | null;
  client_type?: { name: string } | null;
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

const TEMPLATE_DIM_KEY: Record<Dimension, keyof ServiceTemplate> = {
  subject: 'subjects', occasion: 'occasions', context: 'contexts', purpose: 'purposes', client: 'clientTypes',
};
const SERVICE_DIM_PROP: Record<Dimension, keyof ServiceRow> = {
  subject: 'subject', occasion: 'occasion', context: 'context', purpose: 'purpose', client: 'client_type',
};

export type DimensionSuggestions = Record<Dimension, Narrowed>;

/**
 * The same narrowing for Subject/Occasion/Context/Purpose/Client.
 *
 * The library's knowledge is deliberately partial — a template only claims a
 * dimension where it genuinely carries one, never to look complete. A domain
 * the library barely knows starts thin and grows entirely from the studio's
 * own tagging. Both are real knowledge; one just hasn't been written yet.
 */
export function buildDimensionSuggestions(services: ServiceRow[]): DimensionSuggestions {
  const out = {} as DimensionSuggestions;

  for (const dim of DIMENSIONS) {
    const byService: Record<string, Set<string>> = {};
    const byDomain: Record<string, Set<string>> = {};
    const templateKey = TEMPLATE_DIM_KEY[dim];
    const serviceProp = SERVICE_DIM_PROP[dim];

    for (const t of SERVICE_TEMPLATES) {
      const values = (t[templateKey] as string[] | undefined) || [];
      if (values.length === 0) continue;
      add(byService, key(t.name), values);
      add(byDomain, t.domain, values);
    }

    for (const s of services) {
      // A service carries one value per dimension; the studio's own tagging is
      // what teaches the system about services the library never heard of.
      const value = (s[serviceProp] as { name: string } | null | undefined)?.name;
      if (!value) continue;
      if (s.name) add(byService, key(s.name), [value]);
      if (s.domain?.name) add(byDomain, s.domain.name, [value]);
    }

    out[dim] = { byService: freeze(byService), byDomain: freeze(byDomain) };
  }

  return out;
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
