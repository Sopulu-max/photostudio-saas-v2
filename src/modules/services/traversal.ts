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
  /** Packages can carry a value themselves, or inherit it from what they bundle. */
  via: 'direct' | 'bundled';
  /** Which bundled services brought it, when `via` is 'bundled'. */
  through?: string[];
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
  services: number;
};

/** The value itself, and the question it answers. */
export async function getDimensionValue(valueId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('dimension_values')
    .select('id, name, parent_id, dimension:dimensions(id, name, question, service_domain_id, domain:service_domains(name))')
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
    domainName: (dim?.domain?.name ?? null) as string | null,
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
    .select('id, name, position, dimension:dimensions(id, name, position, is_active, domain:service_domains(name)), service_dimension_values(service_id)')
    .eq('organization_id', orgId);

  return ((data || []) as any[])
    .map((v) => ({
      id: v.id as string,
      name: v.name as string,
      dimensionId: v.dimension?.id as string,
      dimensionName: (v.dimension?.name ?? '') as string,
      domainName: (v.dimension?.domain?.name ?? null) as string | null,
      services: (v.service_dimension_values || []).length,
      _dimPosition: v.dimension?.position ?? 0,
      _position: v.position ?? 0,
    }))
    .filter((v) => v.dimensionId)
    .sort((a, b) =>
      (a.domainName || '').localeCompare(b.domainName || '')
      || a._dimPosition - b._dimPosition
      || a._position - b._position
      || a.name.localeCompare(b.name))
    .map(({ _dimPosition, _position, ...v }) => v);
}

/**
 * What is filed under this value.
 *
 * Packages come back two ways deliberately. One tagged Wedding itself is a
 * direct answer; one that bundles a Wedding service is just as true an answer
 * and nobody had to tag it twice — the bundle already said so. Collapsing the
 * two would either lose real matches or claim a package says something it
 * doesn't, so the distinction is carried rather than flattened.
 */
export async function whatCarries(valueId: string): Promise<{ services: Carrier[]; packages: Carrier[] }> {
  const { orgId } = await getAuthOrgId();

  const { data: serviceLinks } = await supabaseAdmin
    .from('service_dimension_values')
    .select('service:services(id, name, status, domain:service_domains(name))')
    .eq('organization_id', orgId)
    .eq('dimension_value_id', valueId);

  const services: Carrier[] = ((serviceLinks || []) as any[])
    .map((l) => l.service)
    .filter(Boolean)
    .map((s: any) => ({
      id: s.id, name: s.name, status: s.status ?? null,
      domainName: s.domain?.name ?? null, via: 'direct' as const,
    }));

  const serviceIds = services.map((s) => s.id);

  const { data: directPackages } = await supabaseAdmin
    .from('package_dimension_values')
    .select('package:packages(id, name, status)')
    .eq('organization_id', orgId)
    .eq('dimension_value_id', valueId);

  const byId = new Map<string, Carrier>();
  for (const l of ((directPackages || []) as any[])) {
    const p = l.package;
    if (!p) continue;
    byId.set(p.id, { id: p.id, name: p.name, status: p.status ?? null, domainName: null, via: 'direct' });
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
      // A package that says it itself stays 'direct'; the bundled services are
      // still worth naming, because they are why it turned up at all.
      if (existing) {
        if (serviceName) existing.through = [...(existing.through || []), serviceName];
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

  const { data: carrying } = await supabaseAdmin
    .from('service_dimension_values')
    .select('service_id')
    .eq('organization_id', orgId)
    .eq('dimension_value_id', valueId);

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
