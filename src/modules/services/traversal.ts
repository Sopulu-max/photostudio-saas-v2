'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

/**
 * Reading the dimension graph backwards.
 *
 * Every relationship in this system is an edge, and most features are one read
 * from the other end. `service ↔ dimension value` forward narrows the service
 * form: choose Photography, get Photography's questions. Backward it answers a
 * different and much more useful question — *what does this studio do for
 * Birthdays?* Same edge, same rows, nothing new stored.
 *
 * Two reads live here and three surfaces sit on them:
 *  - `whatCarries(value)` — everything filed under it, services and packages
 *  - `whatCoOccursWith(value)` — what tends to come with it
 *
 * The second one is the point of the whole model. Wedding relates to
 * On-location because services carry both, and nobody typed that anywhere. A
 * `*_relationships` table would be storing a fact the links already hold, and
 * would immediately start drifting from them.
 */

export type Carrier = {
  id: string;
  name: string;
  status: string | null;
  domainName: string | null;
  /**
   * How a package got here: 'direct' means it narrowed a bundled service to
   * this value, 'bundled' means a service it bundles carries the value and the
   * package never said anything about it.
   */
  via: 'direct' | 'bundled';
  /** Which bundled services brought it — named for either reading. */
  through?: string[];
  /**
   * Set when the match came through a narrower value: a beach shoot answers
   * "what do you do outdoors" because Beach is nested inside Outdoor. Naming it
   * matters — the service never said Outdoor, and pretending it did would make
   * the answer impossible to check.
   */
  narrower?: string;
};

export type CoOccurrence = {
  dimensionId: string;
  dimensionName: string;
  valueId: string;
  valueName: string;
  /** How many services carry both this and the value asked about. */
  services: number;
};

export type ValueEntry = {
  id: string;
  name: string;
  dimensionId: string;
  dimensionName: string;
  domainName: string | null;
  parentId: string | null;
  /** Tagged with this value exactly. */
  services: number;
  /** Tagged with this value or anything nested inside it. */
  servicesIncludingNarrower: number;
};

/** A value, its ancestors (nearest first), and what sits directly inside it. */
export type ValuePlace = {
  ancestors: { id: string; name: string }[];
  children: { id: string; name: string }[];
  /** Every value rolled up into this one — the whole subtree, not just children. */
  narrowerIds: string[];
};

/**
 * Every value under one dimension, as a parent map — the smallest thing that
 * answers "what is inside what". Kept private: callers want the place or the
 * rollup, never the raw edges.
 */
async function siblingTree(orgId: string, dimensionId: string) {
  const { data } = await supabaseAdmin
    .from('dimension_values')
    .select('id, name, parent_id, position')
    .eq('organization_id', orgId)
    .eq('dimension_id', dimensionId)
    .order('position');
  return ((data || []) as any[]).map((v) => ({
    id: v.id as string, name: v.name as string, parentId: (v.parent_id ?? null) as string | null,
  }));
}

/** Everything nested inside a value, at any depth, including the value itself. */
function subtreeIds(rows: { id: string; parentId: string | null }[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    if (!childrenOf.has(r.parentId)) childrenOf.set(r.parentId, []);
    childrenOf.get(r.parentId)!.push(r.id);
  }
  const out: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const child of (childrenOf.get(id) || [])) queue.push(child);
  }
  return out;
}

/**
 * Where a value sits — what it is inside, and what is inside it.
 *
 * This is the user's "select backwards into upper classifications": Beach is an
 * Outdoor, so standing on Beach you can step up to Outdoor and see everything
 * outdoors, of which the beach work is a part.
 */
export async function getValuePlace(valueId: string): Promise<ValuePlace> {
  const { orgId } = await getAuthOrgId();
  const { data: value } = await supabaseAdmin
    .from('dimension_values').select('id, dimension_id, parent_id')
    .eq('id', valueId).eq('organization_id', orgId).maybeSingle();
  if (!value) return { ancestors: [], children: [], narrowerIds: [valueId] };

  const rows = await siblingTree(orgId, (value as any).dimension_id);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const ancestors: { id: string; name: string }[] = [];
  const seen = new Set<string>([valueId]);
  let cursor = (value as any).parent_id as string | null;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const row = byId.get(cursor);
    if (!row) break;
    ancestors.push({ id: row.id, name: row.name });
    cursor = row.parentId;
  }

  return {
    ancestors,
    children: rows.filter((r) => r.parentId === valueId).map((r) => ({ id: r.id, name: r.name })),
    narrowerIds: subtreeIds(rows, valueId),
  };
}

/** The value itself, and the question it answers. */
export async function getDimensionValue(valueId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('dimension_values')
    // The domains that ask this question, rather than the one that used to own
    // it. A studio's Occasion can be asked by photography and videography both.
    .select('id, name, parent_id, dimension:dimensions(id, name, question, service_domain_dimensions(domain:service_domains(name)))')
    .eq('id', valueId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!data) return null;
  const dim = (data as any).dimension;
  return {
    id: data.id as string,
    name: data.name as string,
    parentId: ((data as any).parent_id ?? null) as string | null,
    dimensionId: dim?.id as string,
    dimensionName: dim?.name as string,
    question: (dim?.question ?? null) as string | null,
    // Named for what it is now: possibly several. Joined rather than picked, so
    // a question two domains ask does not silently report only one of them.
    domainName: (((dim?.service_domain_dimensions || []) as any[])
      .map((l) => l.domain?.name).filter(Boolean).join(', ') || null) as string | null,
  };
}

/**
 * Every entry point into the graph — each value, with how much work sits under
 * it. The counts are the honest signal for what is worth entering at: a value
 * no service carries is vocabulary the studio wrote down and never used.
 */
export async function listValueEntries(): Promise<ValueEntry[]> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('dimension_values')
    // Through the join, like getDimensionValue above it. This read the retired
    // service_domain_id, so a question two domains ask reported whichever one
    // happened to own it before they were merged — the index and the value's
    // own page disagreeing about the same fact.
    .select('id, name, position, parent_id, dimension:dimensions(id, name, position, service_domain_dimensions(domain:service_domains(name))), service_dimension_values(service_id)')
    .eq('organization_id', orgId);

  const rows = ((data || []) as any[])
    .map((v) => ({
      id: v.id as string,
      name: v.name as string,
      dimensionId: v.dimension?.id as string,
      dimensionName: (v.dimension?.name ?? '') as string,
      domainName: (((v.dimension?.service_domain_dimensions || []) as any[])
        .map((l) => l.domain?.name).filter(Boolean).join(', ') || null) as string | null,
      parentId: (v.parent_id ?? null) as string | null,
      services: (v.service_dimension_values || []).length,
      _dimPosition: v.dimension?.position ?? 0,
      _position: v.position ?? 0,
    }))
    .filter((v) => v.dimensionId);

  // The rolled-up count, per dimension, so Outdoor reflects its beaches.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const rolled = new Map<string, number>();
  for (const r of rows) {
    const seen = new Set<string>();
    let cursor: string | null = r.id;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      rolled.set(cursor, (rolled.get(cursor) || 0) + r.services);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
  }

  return rows
    .sort((a, b) =>
      (a.domainName || '').localeCompare(b.domainName || '')
      || a._dimPosition - b._dimPosition
      || a._position - b._position
      || a.name.localeCompare(b.name))
    .map(({ _dimPosition, _position, ...v }) => ({
      ...v,
      servicesIncludingNarrower: rolled.get(v.id) ?? v.services,
    }));
}

/**
 * What is filed under this value.
 *
 * Packages come back two ways deliberately. One that narrowed a bundled service
 * to Wedding is a direct answer; one that bundles a Wedding service without
 * narrowing it is just as true an answer and nobody had to say it twice — the
 * bundle already did. Collapsing the two would either lose real matches or claim
 * a package says something it doesn't, so the distinction is carried.
 */
export async function whatCarries(valueId: string): Promise<{ services: Carrier[]; packages: Carrier[] }> {
  const { orgId } = await getAuthOrgId();

  // A beach shoot answers "what do you do outdoors". The service was never
  // tagged Outdoor and is not about to be — the nesting is what makes it an
  // answer, and it stays a read rather than a second row.
  const { narrowerIds } = await getValuePlace(valueId);
  const { data: narrowerNames } = await supabaseAdmin
    .from('dimension_values').select('id, name')
    .eq('organization_id', orgId).in('id', narrowerIds);
  const nameOf = new Map(((narrowerNames || []) as any[]).map((v) => [v.id, v.name as string]));

  const { data: serviceLinks } = await supabaseAdmin
    .from('service_dimension_values')
    .select('dimension_value_id, service:services(id, name, status, domain:service_domains(name))')
    .eq('organization_id', orgId)
    .in('dimension_value_id', narrowerIds);

  const serviceById = new Map<string, Carrier>();
  for (const l of ((serviceLinks || []) as any[])) {
    const s = l.service;
    if (!s) continue;
    const viaNarrower = l.dimension_value_id !== valueId;
    const existing = serviceById.get(s.id);
    // Tagged with the value itself beats tagged with something inside it.
    if (existing && !existing.narrower) continue;
    serviceById.set(s.id, {
      id: s.id, name: s.name, status: s.status ?? null,
      domainName: s.domain?.name ?? null, via: 'direct',
      ...(viaNarrower ? { narrower: nameOf.get(l.dimension_value_id) } : {}),
    });
  }
  const services: Carrier[] = [...serviceById.values()];

  const serviceIds = services.map((s) => s.id);

  // A package narrows a service it bundles, so the "direct" answer is reached
  // through the bundle row rather than from the package itself — which means it
  // can name the service it narrowed, the same as the bundled reading below.
  const { data: directPackages } = await supabaseAdmin
    .from('package_service_dimension_values')
    .select('dimension_value_id, package_service:package_services(package:packages(id, name, status), service:services(id, name))')
    .eq('organization_id', orgId)
    .in('dimension_value_id', narrowerIds);

  const byId = new Map<string, Carrier>();
  for (const l of ((directPackages || []) as any[])) {
    const p = l.package_service?.package;
    if (!p) continue;
    const viaNarrower = l.dimension_value_id !== valueId;
    const serviceName = l.package_service?.service?.name;
    const existing = byId.get(p.id);
    if (existing) {
      if (serviceName && !existing.through?.includes(serviceName)) {
        existing.through = [...(existing.through || []), serviceName];
      }
      // Narrowed to the value itself beats narrowed to something inside it.
      if (!viaNarrower) delete existing.narrower;
      continue;
    }
    byId.set(p.id, {
      id: p.id, name: p.name, status: p.status ?? null, domainName: null, via: 'direct',
      through: serviceName ? [serviceName] : [],
      ...(viaNarrower ? { narrower: nameOf.get(l.dimension_value_id) } : {}),
    });
  }

  if (serviceIds.length > 0) {
    const { data: bundled } = await supabaseAdmin
      .from('package_services')
      .select('package:packages(id, name, status), service:services(id, name)')
      .eq('organization_id', orgId)
      .in('service_id', serviceIds);

    for (const row of ((bundled || []) as any[])) {
      const p = row.package;
      if (!p) continue;
      const existing = byId.get(p.id);
      const serviceName = row.service?.name;
      // A package that narrowed to it stays 'direct'; the other bundled services
      // carrying the value are still worth naming, because they are why it would
      // have turned up anyway. Deduped — the narrowed one is already listed.
      if (existing) {
        if (serviceName && !existing.through?.includes(serviceName)) {
          existing.through = [...(existing.through || []), serviceName];
        }
        continue;
      }
      byId.set(p.id, {
        id: p.id, name: p.name, status: p.status ?? null, domainName: null,
        via: 'bundled', through: serviceName ? [serviceName] : [],
      });
    }
  }

  return { services, packages: [...byId.values()] };
}

/**
 * What tends to come with this — derived, never declared.
 *
 * Co-occurrence over services, because a service is where a studio says what
 * its work actually is; a package is how it sells it, and would double-count
 * the same underlying fact every time a service is bundled twice.
 *
 * The value asked about is excluded from its own results, and so is everything
 * under the same dimension: Wedding co-occurring with Birthday would just mean
 * "some service is both", which is a fact about that service rather than a
 * relationship worth showing.
 */
export async function whatCoOccursWith(valueId: string): Promise<CoOccurrence[]> {
  const { orgId } = await getAuthOrgId();

  const value = await getDimensionValue(valueId);
  if (!value) return [];

  const { narrowerIds } = await getValuePlace(valueId);
  const { data: carrying } = await supabaseAdmin
    .from('service_dimension_values')
    .select('service_id')
    .eq('organization_id', orgId)
    .in('dimension_value_id', narrowerIds);

  const serviceIds = [...new Set(((carrying || []) as any[]).map((r) => r.service_id))];
  if (serviceIds.length === 0) return [];

  const { data: alongside } = await supabaseAdmin
    .from('service_dimension_values')
    .select('service_id, dimension_value:dimension_values(id, name, dimension:dimensions(id, name, position))')
    .eq('organization_id', orgId)
    .in('service_id', serviceIds);

  const counts = new Map<string, CoOccurrence & { _position: number }>();
  for (const row of ((alongside || []) as any[])) {
    const v = row.dimension_value;
    const d = v?.dimension;
    if (!v || !d) continue;
    // Nothing from the value's own dimension, which now also excludes the
    // narrower values it was rolled up from — Outdoor "co-occurring" with
    // Beach is just the nesting restated.
    if (v.id === valueId || d.id === value.dimensionId) continue;

    const seen = counts.get(v.id);
    if (seen) { seen.services += 1; continue; }
    counts.set(v.id, {
      dimensionId: d.id, dimensionName: d.name,
      valueId: v.id, valueName: v.name,
      services: 1,
      _position: d.position ?? 0,
    });
  }

  return [...counts.values()]
    .sort((a, b) => b.services - a.services || a._position - b._position || a.valueName.localeCompare(b.valueName))
    .map(({ _position, ...c }) => c);
}
