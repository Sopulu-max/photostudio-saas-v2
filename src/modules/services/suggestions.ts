import { templatesByDomain } from './templates';
import type { ServiceTemplate } from './templates';
import { DIMENSIONS, type Dimension } from './dimensions';

export type DeliverableSuggestions = Record<string, string[]>;

/**
 * What renders in the rest of the Create Service form has to respond to the
 * Service Domain someone's typed — not stay generic regardless. This is the
 * "app morphs to what the studio has already defined" principle applied to
 * deliverable suggestions: a Domain's suggestions start from the curated
 * template library (so a brand-new domain still suggests something
 * sensible), then grow from the studio's own accumulated deliverables in
 * that Domain — the more a studio uses Photography, the more its own
 * vocabulary (not just the engine's) shapes what gets suggested there next.
 *
 * Not a "use server" file — pure computation over already-fetched data, so
 * page components call it directly after their own listServices() fetch.
 */
export function buildDeliverableSuggestions(
  services: { domain?: { name: string } | null; deliverables?: { name: string }[] }[]
): DeliverableSuggestions {
  const map = new Map<string, Set<string>>();

  for (const { domain, templates } of templatesByDomain()) {
    if (!map.has(domain)) map.set(domain, new Set());
    for (const t of templates) for (const d of t.deliverables) map.get(domain)!.add(d);
  }

  for (const s of services) {
    const domainName = s.domain?.name;
    if (!domainName) continue;
    if (!map.has(domainName)) map.set(domainName, new Set());
    for (const d of s.deliverables || []) map.get(domainName)!.add(d.name);
  }

  const out: DeliverableSuggestions = {};
  for (const [k, v] of map) out[k] = Array.from(v);
  return out;
}

export type DimensionSuggestions = Record<Dimension, Record<string, string[]>>;

const TEMPLATE_DIM_KEY: Record<Dimension, keyof ServiceTemplate> = {
  subject: 'subjects', occasion: 'occasions', context: 'contexts', purpose: 'purposes', client: 'clientTypes',
};
const SERVICE_DIM_PROP: Record<Dimension, string> = {
  subject: 'subject', occasion: 'occasion', context: 'context', purpose: 'purpose', client: 'client_type',
};

/**
 * Same principle as deliverables, applied to Subject/Occasion/Context/
 * Purpose/Client: selecting a Domain has to reorganize the entries around
 * everything that concerns it, not just one field. The templates carry
 * SOME curated knowledge per Domain (only where a template's own summary or
 * questions already grounded it — never invented for the sake of looking
 * complete), and that's deliberately partial: a Domain the library barely
 * knows starts with a thin or empty suggestion set and grows entirely from
 * the studio's own tagging. Both are real "knowledge" — one just hasn't
 * been written yet.
 */
export function buildDimensionSuggestions(
  services: {
    domain?: { name: string } | null;
    subject?: { name: string } | null;
    occasion?: { name: string } | null;
    context?: { name: string } | null;
    purpose?: { name: string } | null;
    client_type?: { name: string } | null;
  }[]
): DimensionSuggestions {
  const out = {} as DimensionSuggestions;

  for (const dim of DIMENSIONS) {
    const map = new Map<string, Set<string>>();
    const templateKey = TEMPLATE_DIM_KEY[dim];

    for (const { domain, templates } of templatesByDomain()) {
      const values = templates.flatMap((t) => (t[templateKey] as string[] | undefined) || []);
      if (values.length === 0) continue;
      if (!map.has(domain)) map.set(domain, new Set());
      values.forEach((v) => map.get(domain)!.add(v));
    }

      const serviceProp = SERVICE_DIM_PROP[dim];
      for (const s of services) {
        const domainName = s.domain?.name;
        // In the new schema, dimensions are arrays (e.g. s.occasions, s.subjects)
        // so we need to map over them and add to the set.
        const values = (s as any)[serviceProp + 's'] as { name: string }[] | undefined;
        if (!domainName || !values || values.length === 0) continue;
        if (!map.has(domainName)) map.set(domainName, new Set());
        for (const v of values) {
          if (v.name) map.get(domainName)!.add(v.name);
        }
      }

    const rec: Record<string, string[]> = {};
    for (const [k, v] of map) rec[k] = Array.from(v);
    out[dim] = rec;
  }

  return out;
}
