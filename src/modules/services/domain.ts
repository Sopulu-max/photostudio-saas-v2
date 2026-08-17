'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { revalidatePath } from 'next/cache';
import type { ServiceVariable, ServiceVariableInput } from './variableTypes';
import type {
  DimensionWrite, PublicIntakeDimension, ServiceDimensionTag, StudioDimensionShape,
} from './dimensions';

/**
 * Services — the ontology layer: what this studio actually knows how to do,
 * independent of how any of it gets sold. A Service is an organized process
 * that transforms something of value — a moment into photographs, a digital
 * image into a physical print. Different transformation, different Service;
 * that's why printing is never a property of the photography that produced
 * the original.
 *
 * This module owns: Service Domains (Photography, Videography — the broad
 * capability), Services themselves (Portrait Photography — the specific
 * transformation), Deliverables (the vocabulary of what a Service can
 * produce), and Blueprints (a Service's Process — how the transformation is
 * carried out, already routed to roles via Team's interface).
 *
 * What a studio SELLS — Package, bundling one or more Services into a priced
 * offering — is a different concern, owned by the Packages module.
 */

type StageInput = { name: string; roleName?: string | null; frontStage?: boolean | null };

// ── Facet-style, studio-editable vocabularies ────────────────────────────────
// Open values the studio names, found-or-created on use so typing a new one
// just works without a separate trip to Settings.
//
// What is NOT here any more: the five classification dimensions. Those were
// five flat, studio-wide tables — a studio's Photography contexts and its
// Printing contexts sharing one list. They now live in `dimensions` /
// `dimension_values`, owned by a service domain, because a domain is the
// boundary: everything below one belongs to it.

// `deliverables` is not on this list: output types belong to a service domain
// now, so they are found-or-created through findOrCreateOutputType, not here.
// Rename and delete still work by id, which needs no domain.
type NamedTable = 'service_domains' | 'delivery_containers' | 'deliverables';

async function findOrCreateNamed(table: NamedTable, orgId: string, name: string): Promise<string | null> {
  const clean = (name || '').trim();
  if (!clean) return null;
  const { data: existing } = await supabaseAdmin.from(table).select('id').eq('organization_id', orgId).eq('name', clean).maybeSingle();
  if (existing) return existing.id;
  const { data: last } = await supabaseAdmin.from(table).select('position').eq('organization_id', orgId).order('position', { ascending: false }).limit(1).maybeSingle();
  const { data: created, error } = await supabaseAdmin.from(table).insert({ organization_id: orgId, name: clean, position: (last?.position ?? -1) + 1 }).select('id').maybeSingle();
  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await supabaseAdmin.from(table).select('id').eq('organization_id', orgId).eq('name', clean).maybeSingle();
      if (retry) return retry.id;
    }
    console.error(`Failed to create ${table} value:`, error);
    return null;
  }
  return created?.id ?? null;
}

/**
 * Find-or-create a value under a named dimension of one domain.
 *
 * Two find-or-creates, because the form lets a studio type both: a dimension
 * the domain doesn't ask yet, and a value it has never used. What gets typed
 * becomes part of that domain's vocabulary and is offered next time — the
 * studio teaches the system by working, which is the only way the suggestions
 * ever get better than the shipped library.
 *
 * Everything is resolved INSIDE the domain. Photography gaining a Style of
 * Editorial says nothing about Printing, even if Printing also asks Style.
 */
async function resolveDimensionValueId(
  orgId: string,
  domainId: string,
  dimensionName: string,
  valueName: string
): Promise<string | null> {
  const dimName = (dimensionName || '').trim();
  const value = (valueName || '').trim();
  if (!dimName || !value) return null;

  const { data: existingDim } = await supabaseAdmin
    .from('dimensions').select('id')
    .eq('organization_id', orgId).eq('service_domain_id', domainId)
    .ilike('name', dimName).maybeSingle();

  let dimensionId = existingDim?.id as string | undefined;
  if (!dimensionId) {
    const { data: last } = await supabaseAdmin
      .from('dimensions').select('position')
      .eq('organization_id', orgId).eq('service_domain_id', domainId)
      .order('position', { ascending: false }).limit(1).maybeSingle();
    const { data: made, error } = await supabaseAdmin
      .from('dimensions')
      .insert({ organization_id: orgId, service_domain_id: domainId, name: dimName, position: ((last?.position as number) ?? -1) + 1 })
      .select('id').maybeSingle();
    if (error) {
      if (error.code === '23505') {
        const { data: retry } = await supabaseAdmin.from('dimensions').select('id').eq('organization_id', orgId).eq('service_domain_id', domainId).ilike('name', dimName).maybeSingle();
        dimensionId = retry?.id;
      }
      if (!dimensionId) { console.error('Failed to create dimension:', error); return null; }
    } else {
      dimensionId = made?.id;
    }
  }
  if (!dimensionId) return null;

  const { data: existingValue } = await supabaseAdmin
    .from('dimension_values').select('id')
    .eq('dimension_id', dimensionId).ilike('name', value).maybeSingle();
  if (existingValue) return existingValue.id as string;

  const { data: lastValue } = await supabaseAdmin
    .from('dimension_values').select('position')
    .eq('dimension_id', dimensionId)
    .order('position', { ascending: false }).limit(1).maybeSingle();
  const { data: madeValue, error: valueError } = await supabaseAdmin
    .from('dimension_values')
    .insert({ organization_id: orgId, dimension_id: dimensionId, name: value, position: ((lastValue?.position as number) ?? -1) + 1 })
    .select('id').maybeSingle();
  if (valueError) {
    if (valueError.code === '23505') {
      const { data: retryValue } = await supabaseAdmin.from('dimension_values').select('id').eq('dimension_id', dimensionId).ilike('name', value).maybeSingle();
      if (retryValue) return retryValue.id as string;
    }
    console.error('Failed to create dimension value:', valueError); return null;
  }
  return (madeValue?.id as string) ?? null;
}

/**
 * What a service is classified as, written into its own domain's vocabulary.
 *
 * Replaces wholesale: the editor sends what it wants the service to be, so a
 * removed value is expressed by absence rather than by a separate delete call.
 */
async function writeServiceDimensions(
  orgId: string,
  serviceId: string,
  domainId: string | null,
  dims: DimensionWrite[] | undefined
) {
  await supabaseAdmin.from('service_dimension_values').delete()
    .eq('organization_id', orgId).eq('service_id', serviceId);

  if (!domainId || !dims || dims.length === 0) return;

  const valueIds: string[] = [];
  for (const dim of dims) {
    for (const value of (dim.values || [])) {
      const id = await resolveDimensionValueId(orgId, domainId, dim.name, value);
      if (id) valueIds.push(id);
    }
  }

  if (valueIds.length > 0) {
    await supabaseAdmin.from('service_dimension_values').insert(
      [...new Set(valueIds)].map((dimension_value_id) => ({
        organization_id: orgId, service_id: serviceId, dimension_value_id,
      }))
    );
  }
}

/** One embed, however many dimensions the domain happens to ask. */
const SERVICE_DIMENSION_SELECT =
  'service_dimension_values(dimension_value:dimension_values(id, name, dimension:dimensions(id, name, question, position, is_active)))';

/** Flat links → the dimensions that asked, each with the values this service carries. */
function shapeServiceDimensions(row: any): ServiceDimensionTag[] {
  const byDimension = new Map<string, ServiceDimensionTag>();
  for (const link of (row?.service_dimension_values || [])) {
    const v = link?.dimension_value;
    const d = v?.dimension;
    if (!v || !d) continue;
    if (!byDimension.has(d.id)) {
      byDimension.set(d.id, { id: d.id, name: d.name, question: d.question ?? null, position: d.position ?? 0, values: [] });
    }
    byDimension.get(d.id)!.values.push({ id: v.id, name: v.name });
  }
  return [...byDimension.values()].sort((a, b) => a.position - b.position);
}

/**
 * Find-or-create an output type inside one domain.
 *
 * The counterpart of resolveDimensionValueId, and for the same reason: what a
 * studio types in the service form should just work, and what it types becomes
 * the domain's vocabulary. Photography producing "Contact sheet" says nothing
 * about Printing.
 */
async function findOrCreateOutputType(orgId: string, domainId: string, name: string): Promise<string | null> {
  const clean = (name || '').trim();
  if (!clean || !domainId) return null;

  const { data: existing } = await supabaseAdmin
    .from('deliverables').select('id')
    .eq('organization_id', orgId).eq('service_domain_id', domainId)
    .ilike('name', clean).maybeSingle();
  if (existing) return existing.id as string;

  const { data: last } = await supabaseAdmin
    .from('deliverables').select('position')
    .eq('organization_id', orgId).eq('service_domain_id', domainId)
    .order('position', { ascending: false }).limit(1).maybeSingle();

  const { data: created, error } = await supabaseAdmin
    .from('deliverables')
    .insert({ organization_id: orgId, service_domain_id: domainId, name: clean, position: ((last?.position as number) ?? -1) + 1 })
    .select('id').maybeSingle();
  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await supabaseAdmin.from('deliverables').select('id').eq('organization_id', orgId).eq('service_domain_id', domainId).ilike('name', clean).maybeSingle();
      if (retry) return retry.id as string;
    }
    console.error('Failed to create output type:', error); return null;
  }
  return (created?.id as string) ?? null;
}

type Facet = { id: string; name: string; position: number };

async function listNamed(table: NamedTable): Promise<Facet[]> {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin.from(table).select('id, name, position').eq('organization_id', orgId).order('position');
  if (error) { console.error(`Failed to list ${table}:`, error); return []; }
  return data || [];
}
async function renameNamed(table: NamedTable, id: string, name: string, label: string) {
  const { orgId } = await getAuthOrgId();
  const clean = (name || '').trim();
  if (!clean) throw new Error(`Give the ${label} a name.`);
  const { error } = await supabaseAdmin.from(table).update({ name: clean }).eq('id', id).eq('organization_id', orgId);
  if (error) throw new Error(`Failed to rename (does that ${label} already exist?)`);
  revalidatePath('/services');
  revalidatePath('/packages');
  return { ok: true };
}
async function deleteNamed(table: NamedTable, id: string, label: string) {
  const { orgId } = await getAuthOrgId();
  const { error } = await supabaseAdmin.from(table).delete().eq('id', id).eq('organization_id', orgId);
  if (error) throw new Error(`Failed to remove the ${label}`);
  revalidatePath('/services');
  revalidatePath('/packages');
  return { ok: true };
}

/**
 * The service parents this studio works in.
 *
 * A domain classifies — it is the parent a service is defined in relation to,
 * and nothing more. It used to also carry a declared "DNA" of deliverables and
 * dimensions, edited on its own page, which nothing ever read: the suggestions
 * a service editor offers are built from the template library and the services
 * the studio has actually created. That is the better source, because it is
 * knowledge earned from real work rather than a form somebody filled in once.
 *
 * Output types belong to the service. A domain cannot sensibly say what its
 * services produce — Portrait Photography and Film Developing are both
 * Photography and share no output.
 */
export async function listServiceDomains() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('service_domains')
    .select('id, name')
    .eq('organization_id', orgId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) { console.error('listServiceDomains error:', error); return []; }
  return (data || []).map((d: any) => ({ id: d.id, name: d.name }));
}

export async function getServiceDomain(id: string) {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('service_domains')
    .select('id, name')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error || !data) { console.error('getServiceDomain error:', error); return null; }
  return { id: data.id, name: data.name };
}

export async function createServiceDomain(name: string) {
  const { orgId } = await getAuthOrgId();
  const id = await findOrCreateNamed('service_domains', orgId, name);
  if (!id) throw new Error('Give the service domain a name.');
  revalidatePath('/services');
  return { serviceDomainId: id };
}
export async function renameServiceDomain(id: string, name: string) { return renameNamed('service_domains', id, name, 'service domain'); }
export async function deleteServiceDomain(id: string) { return deleteNamed('service_domains', id, 'service domain'); }

/**
 * Output types, like dimensions, belong to a service domain.
 *
 * A KIND of thing a domain can produce — edited photographs under Photography,
 * a bound album under Printing. Same rule as everywhere below a domain: the
 * vocabulary is the domain's, and Printing never inherits Photography's.
 *
 * Listed studio-wide here because Packages bundles across domains and needs to
 * see everything; each row carries the domain that owns it so a surface can
 * group or narrow. Writing always goes through a domain.
 */
export async function listDeliverables(): Promise<(Facet & { serviceDomainId: string; domainName: string | null })[]> {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('deliverables')
    .select('id, name, position, service_domain_id, domain:service_domains(name)')
    .eq('organization_id', orgId)
    .order('position');
  if (error) { console.error('Failed to list output types:', error); return []; }
  return ((data || []) as any[]).map((d) => ({
    id: d.id, name: d.name, position: d.position ?? 0,
    serviceDomainId: d.service_domain_id,
    domainName: d.domain?.name ?? null,
  }));
}

/** Output types grouped by the domain that owns them — what a form narrows with. */
export async function listOutputTypesByDomain(): Promise<Record<string, { id: string; name: string }[]>> {
  const all = await listDeliverables();
  const out: Record<string, { id: string; name: string }[]> = {};
  for (const d of all) {
    if (!d.domainName) continue;
    (out[d.domainName] ||= []).push({ id: d.id, name: d.name });
  }
  return out;
}

export async function createDeliverable(input: { serviceDomainId: string; name: string }) {
  const { orgId } = await getAuthOrgId();
  const id = await findOrCreateOutputType(orgId, input.serviceDomainId, input.name);
  if (!id) throw new Error('Give the output type a name.');
  revalidatePath('/services');
  return { outputTypeId: id };
}
export async function renameDeliverable(id: string, name: string) { return renameNamed('deliverables', id, name, 'output type'); }
export async function deleteDeliverable(id: string) { return deleteNamed('deliverables', id, 'output type'); }

export async function listDeliveryContainers() { return listNamed('delivery_containers'); }
export async function createDeliveryContainer(name: string) {
  const { orgId } = await getAuthOrgId();
  const id = await findOrCreateNamed('delivery_containers', orgId, name);
  if (!id) throw new Error('Give the delivery container a name.');
  revalidatePath('/services');
  return { deliveryContainerId: id };
}
export async function renameDeliveryContainer(id: string, name: string) { return renameNamed('delivery_containers', id, name, 'delivery container'); }
export async function deleteDeliveryContainer(id: string) { return deleteNamed('delivery_containers', id, 'delivery container'); }

// ── How each domain classifies its work ──────────────────────────────────────
// A dimension belongs to a service domain, so there is no studio-wide "which
// dimensions do you organize by" setting any more — the question is answered
// per domain by `dimensions.is_active`. Adding and editing them is
// `dimensionsAdmin.ts`; what follows is what the surfaces need to READ.

/**
 * Every domain's active dimensions, keyed by domain name.
 *
 * The service form needs this as one payload rather than a fetch per domain:
 * the domain is chosen in the browser, and the whole point is that the rest of
 * the form reconfigures the moment it changes — a round trip for each pick
 * would make that reconfiguration feel like a page, not a form.
 */
export async function listDimensionsByDomain(): Promise<Record<string, StudioDimensionShape[]>> {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('dimensions')
    .select('id, name, question, example, position, is_active, service_domain_id, domain:service_domains(name), dimension_values(id, name, position)')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('position');
  if (error) { console.error('Failed to list dimensions by domain:', error); return {}; }

  const out: Record<string, StudioDimensionShape[]> = {};
  for (const d of ((data || []) as any[])) {
    const domainName = d.domain?.name;
    if (!domainName) continue;
    (out[domainName] ||= []).push({
      id: d.id,
      name: d.name,
      question: d.question ?? null,
      example: d.example ?? null,
      position: d.position ?? 0,
      values: (d.dimension_values || [])
        .map((v: any) => ({ id: v.id, name: v.name, position: v.position ?? 0 }))
        .sort((a: any, b: any) => a.position - b.position || a.name.localeCompare(b.name))
        .map(({ id, name }: any) => ({ id, name })),
    });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.position - b.position);
  return out;
}

/**
 * The same thing without auth, for the public intake — "what are you looking
 * for?" built from whatever vocabulary this studio actually keeps.
 *
 * A dimension with no values is dropped: it can't be asked, so shipping it to
 * the client would render an empty select. Each one carries its domain, since
 * two domains may both ask about Context and mean different things.
 */
export async function getPublicIntakeDimensions(organizationId: string): Promise<PublicIntakeDimension[]> {
  const { data } = await supabaseAdmin
    .from('dimensions')
    .select('id, name, question, position, service_domain_id, domain:service_domains(name), dimension_values(id, name, position)')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('position');

  return ((data || []) as any[])
    .map((d) => ({
      id: d.id as string,
      name: d.name as string,
      question: (d.question ?? null) as string | null,
      domainId: (d.service_domain_id ?? null) as string | null,
      domainName: (d.domain?.name ?? null) as string | null,
      values: (d.dimension_values || [])
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        .map((v: any) => ({ id: v.id as string, name: v.name as string })),
    }))
    .filter((d) => d.values.length > 0);
}

/**
 * Find-or-create a value under a named dimension of a given domain.
 *
 * Packages asks this rather than touching the tables directly, and the public
 * intake's "extract a package from this enquiry" path uses it to turn what a
 * client typed into part of the domain's vocabulary.
 */
export async function findOrCreateDimensionValue(input: {
  serviceDomainId: string;
  dimensionName: string;
  value: string;
}): Promise<string | null> {
  const { orgId } = await getAuthOrgId();
  return resolveDimensionValueId(orgId, input.serviceDomainId, input.dimensionName, input.value);
}

// ── Blueprints: a Service's Process — how the transformation is carried out ─

/**
 * Build a stage list for storage — resolving each stage's named role
 * (Team's own vocabulary, find-or-created the same way a Service's own
 * facets are) into an id. Routing: a stage suggests who does it, not who
 * must.
 */
async function buildStages(raw: StageInput[]): Promise<{ name: string; order: number; role_id: string | null; front_stage: boolean | null }[]> {
  const { findOrCreateRole } = await import('@/modules/team/interface');
  const stages: { name: string; order: number; role_id: string | null; front_stage: boolean | null }[] = [];
  for (const s of raw || []) {
    const name = (s.name || '').trim();
    if (!name) continue;
    const roleId = s.roleName ? await findOrCreateRole(s.roleName) : null;
    stages.push({ name, order: stages.length, role_id: roleId, front_stage: s.frontStage ?? null });
  }
  return stages;
}

export async function createBlueprint(input: { name: string; stages: StageInput[] }) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const name = (input.name || '').trim();
  if (!name) throw new Error('A blueprint needs a name.');

  const stages = await buildStages(input.stages);
  if (stages.length === 0) throw new Error('Add at least one stage.');

  const { data: blueprint, error } = await supabaseAdmin
    .from('blueprints')
    .insert({ organization_id: orgId, name, stages, status: 'active' })
    .select('id')
    .single();
  if (error || !blueprint) {
    console.error('Failed to create blueprint:', error);
    throw new Error('Failed to create blueprint');
  }

  await logEvent({ organizationId: orgId, entityType: 'blueprint', entityId: blueprint.id, action: 'created', actorId: actorId ?? undefined, payload: { name, stageCount: stages.length } });
  revalidatePath('/services');
  return { blueprintId: blueprint.id };
}

export async function listBlueprints() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('blueprints')
    .select('id, name, stages, status')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('name');
  if (error) { console.error('Failed to list blueprints:', error); throw new Error('Failed to load blueprints'); }

  const { listRoles } = await import('@/modules/team/interface');
  const roles = await listRoles();
  const roleName = (id: string | null | undefined) => (roles as any[]).find((r) => r.id === id)?.name || null;
  return (data || []).map((b: any) => ({ ...b, stages: (b.stages || []).map((s: any) => ({ ...s, roleName: roleName(s.role_id) })) }));
}

export async function updateBlueprint(input: { blueprintId: string; name?: string; stages?: StageInput[] }) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('A blueprint needs a name.');
    patch.name = name;
  }
  if (input.stages !== undefined) {
    const stages = await buildStages(input.stages);
    if (stages.length === 0) throw new Error('Keep at least one stage.');
    patch.stages = stages;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabaseAdmin.from('blueprints').update(patch).eq('id', input.blueprintId).eq('organization_id', orgId);
  if (error) throw new Error('Failed to save the blueprint');

  await logEvent({ organizationId: orgId, entityType: 'blueprint', entityId: input.blueprintId, action: 'updated', actorId: actorId ?? undefined, payload: patch });
  revalidatePath('/services');
  return { ok: true };
}

/** Remove a blueprint. Services pointing at it lose the reference — their work then starts from a single free-form stage. */
export async function deleteBlueprint(blueprintId: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  await supabaseAdmin.from('services').update({ default_blueprint_id: null }).eq('organization_id', orgId).eq('default_blueprint_id', blueprintId);
  const { error } = await supabaseAdmin.from('blueprints').delete().eq('id', blueprintId).eq('organization_id', orgId);
  if (error) throw new Error('Failed to remove the blueprint');
  await logEvent({ organizationId: orgId, entityType: 'blueprint', entityId: blueprintId, action: 'deleted', actorId: actorId ?? undefined });
  revalidatePath('/services');
  return { ok: true };
}

// ── Service: the specific transformation ─────────────────────────────────────

export async function createService(input: {
  name: string;
  description?: string | null;
  serviceDomain?: string | null;
  primaryDeliverable?: string | null;
  deliverables?: string[];
  /** What may vary about this service — declared up front so a template's service arrives usable. */
  variables?: ServiceVariableInput[];
  /** Whatever this domain classifies by — not a fixed five. */
  dimensions?: DimensionWrite[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const name = (input.name || '').trim();
  if (!name) throw new Error('A service needs a name.');

  const domainId = await findOrCreateNamed('service_domains', orgId, input.serviceDomain || '');
  // Resolved inside the domain the service belongs to — a service with no
  // domain cannot name an output type, because there is no vocabulary to name
  // it in yet.
  const primaryDeliverableId = input.primaryDeliverable && domainId
    ? await findOrCreateOutputType(orgId, domainId, input.primaryDeliverable)
    : null;

  const { data: service, error } = await supabaseAdmin
    .from('services')
    .insert({
      organization_id: orgId,
      name,
      description: input.description || null,
      service_domain_id: domainId,
      primary_deliverable_id: primaryDeliverableId,
      status: 'active',
    })
    .select('id')
    .single();
  if (error || !service) { console.error('Failed to create service:', error); throw new Error('Failed to create service'); }

  // Insert general outputs (the assets this service can produce beyond its primary output)
  const deliverableIds: string[] = [];
  for (const d of (domainId ? input.deliverables || [] : [])) {
    const id = await findOrCreateOutputType(orgId, domainId!, d);
    if (id) deliverableIds.push(id);
  }
  if (deliverableIds.length > 0) {
    await supabaseAdmin.from('service_deliverables').insert(deliverableIds.map((deliverable_id) => ({ organization_id: orgId, service_id: service.id, deliverable_id })));
  }

  await writeServiceDimensions(orgId, service.id, domainId, input.dimensions);

  if (input.variables && input.variables.length > 0) {
    await setServiceVariables({ serviceId: service.id, variables: input.variables });
  }

  await logEvent({ organizationId: orgId, entityType: 'service', entityId: service.id, action: 'created', actorId: actorId ?? undefined, payload: { name } });
  revalidatePath('/services');
  return { serviceId: service.id };
}

export async function updateService(input: {
  serviceId: string;
  name?: string;
  description?: string | null;
  serviceDomain?: string | null;
  primaryDeliverable?: string | null;
  deliverables?: string[];
  /** Whatever this domain classifies by — not a fixed five. */
  dimensions?: DimensionWrite[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { data: existing } = await supabaseAdmin
    .from('services').select('id, service_domain_id')
    .eq('id', input.serviceId).eq('organization_id', orgId).maybeSingle();
  if (!existing) throw new Error('Service not found');

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('A service needs a name.');
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.serviceDomain !== undefined) patch.service_domain_id = await findOrCreateNamed('service_domains', orgId, input.serviceDomain || '');
  const outputDomainId = (patch.service_domain_id as string | undefined) ?? existing.service_domain_id;
  if (input.primaryDeliverable !== undefined) {
    patch.primary_deliverable_id = input.primaryDeliverable && outputDomainId
      ? await findOrCreateOutputType(orgId, outputDomainId, input.primaryDeliverable)
      : null;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabaseAdmin.from('services').update(patch).eq('id', input.serviceId).eq('organization_id', orgId);
    if (error) { console.error('Failed to update service:', error); throw new Error('Failed to save the service'); }
  }

  if (input.deliverables !== undefined) {
    await supabaseAdmin.from('service_deliverables').delete().eq('service_id', input.serviceId).eq('organization_id', orgId);
    const deliverableIds: string[] = [];
    for (const d of (outputDomainId ? input.deliverables : [])) {
      const id = await findOrCreateOutputType(orgId, outputDomainId, d);
      if (id) deliverableIds.push(id);
    }
    if (deliverableIds.length > 0) {
      await supabaseAdmin.from('service_deliverables').insert(deliverableIds.map((deliverable_id) => ({ organization_id: orgId, service_id: input.serviceId, deliverable_id })));
    }
  }

  // Resolved inside the service's own domain, including when the domain itself
  // just changed: moving a service to Videography must not leave it tagged with
  // Photography's vocabulary.
  if (input.dimensions !== undefined) {
    const domainId = (patch.service_domain_id as string | undefined) ?? existing.service_domain_id;
    await writeServiceDimensions(orgId, input.serviceId, domainId ?? null, input.dimensions);
  }

  await logEvent({ organizationId: orgId, entityType: 'service', entityId: input.serviceId, action: 'updated', actorId: actorId ?? undefined, payload: patch });
  revalidatePath('/services');
  revalidatePath(`/services/${input.serviceId}`);
  return { ok: true };
}

/** Fork an existing Service — same domain, process, deliverables, a new id to edit from. */
export async function duplicateService(serviceId: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { data: existing } = await supabaseAdmin.from('services').select('name, description, service_domain_id, primary_deliverable_id').eq('id', serviceId).eq('organization_id', orgId).maybeSingle();
  if (!existing) throw new Error('Service not found');

  const { data: copy, error } = await supabaseAdmin
    .from('services')
    .insert({ organization_id: orgId, name: `${existing.name} (Copy)`, description: existing.description, service_domain_id: existing.service_domain_id, primary_deliverable_id: existing.primary_deliverable_id, status: 'active' })
    .select('id')
    .single();
  if (error || !copy) { console.error('Failed to duplicate service:', error); throw new Error('Failed to duplicate the service'); }

  const { data: outputs } = await supabaseAdmin.from('service_deliverables').select('deliverable_id').eq('service_id', serviceId).eq('organization_id', orgId);
  if (outputs && outputs.length > 0) {
    await supabaseAdmin.from('service_deliverables').insert(outputs.map((d: any) => ({ organization_id: orgId, service_id: copy.id, deliverable_id: d.deliverable_id })));
  }

  // How it was classified comes with it — a fork is the same work, differently
  // sold. The links copy directly: both services are in the same domain, so
  // they point at the same vocabulary.
  const { data: tags } = await supabaseAdmin
    .from('service_dimension_values').select('dimension_value_id')
    .eq('service_id', serviceId).eq('organization_id', orgId);
  if (tags && tags.length > 0) {
    await supabaseAdmin.from('service_dimension_values').insert(
      tags.map((t: any) => ({ organization_id: orgId, service_id: copy.id, dimension_value_id: t.dimension_value_id }))
    );
  }

  await logEvent({ organizationId: orgId, entityType: 'service', entityId: copy.id, action: 'duplicated', actorId: actorId ?? undefined, payload: { fromServiceId: serviceId } });
  revalidatePath('/services');
  return { serviceId: copy.id };
}

export async function setServiceStatus(input: { serviceId: string; status: 'active' | 'retired' }) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { error } = await supabaseAdmin.from('services').update({ status: input.status }).eq('id', input.serviceId).eq('organization_id', orgId);
  if (error) throw new Error('Failed to change the service');
  await logEvent({ organizationId: orgId, entityType: 'service', entityId: input.serviceId, action: input.status === 'retired' ? 'retired' : 'restored', actorId: actorId ?? undefined });
  revalidatePath('/services');
  revalidatePath(`/services/${input.serviceId}`);
  return { ok: true };
}

export async function listServices() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('services')
    .select(`
      id, name, description, status, service_domain_id,
      domain:service_domains(id, name),
      primary_deliverable:deliverables!services_primary_deliverable_id_fkey(id, name),
      service_deliverables(deliverable:deliverables(id, name)),
      service_variables(label, kind, unit, options),
      ${SERVICE_DIMENSION_SELECT}
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) { console.error('Failed to list services:', error.message, error.details, error.hint); throw new Error('Failed to load services'); }
  return (data || []).map((s: any) => ({
    ...s,
    deliverables: (s.service_deliverables || []).map((sd: any) => sd.deliverable).filter(Boolean),
    dimensions: shapeServiceDimensions(s),
    // What varies about it, so the studio's own services teach the next form
    // exactly as the template library does.
    variables: (s.service_variables || []).map((v: any) => ({
      label: v.label, kind: v.kind, unit: v.unit, options: v.options || [],
    })),
  }));
}

/** Active services only — for the Package builder's "which services am I bundling" picker. */
export async function listActiveServices() {
  const all = await listServices();
  return all.filter((s: any) => s.status === 'active');
}


export async function getService(serviceId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('services')
    .select(`
      id, name, description, status, service_domain_id,
      domain:service_domains(id, name),
      primary_deliverable:deliverables!services_primary_deliverable_id_fkey(id, name),
      service_deliverables(deliverable:deliverables(id, name)),
      service_variables(label, kind, unit, options),
      ${SERVICE_DIMENSION_SELECT}
    `)
    .eq('id', serviceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    deliverables: ((data as any).service_deliverables || []).map((sd: any) => sd.deliverable).filter(Boolean),
    dimensions: shapeServiceDimensions(data),
    variables: (((data as any).service_variables) || []).map((v: any) => ({
      label: v.label, kind: v.kind, unit: v.unit, options: v.options || [],
    })),
  };
}

// ── Service Variables: the per-service half of the configuration schema ─────
// Dimensions are shared vocabulary; variables are the quantities that scope
// this particular service — outfits, edited images, coverage hours. The
// service declares what may vary; a package fixes a value (see Packages).

function rowToVariable(r: any): ServiceVariable {
  return {
    id: r.id,
    serviceId: r.service_id,
    key: r.key,
    label: r.label,
    kind: r.kind,
    unit: r.unit ?? null,
    options: Array.isArray(r.options) ? r.options : [],
    defaultValue: r.default_value ?? null,
    min: r.min_value ?? null,
    max: r.max_value ?? null,
    position: r.position ?? 0,
  };
}

export async function listServiceVariables(serviceId: string): Promise<ServiceVariable[]> {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('service_variables')
    .select('*')
    .eq('organization_id', orgId)
    .eq('service_id', serviceId)
    .order('position');
  if (error) {
    console.error('Failed to list service variables:', error);
    return [];
  }
  return ((data || []) as any[]).map(rowToVariable);
}

/** Variables for several services at once — what a Package builder needs. */
export async function listVariablesForServices(serviceIds: string[]): Promise<ServiceVariable[]> {
  if (serviceIds.length === 0) return [];
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('service_variables')
    .select('*')
    .eq('organization_id', orgId)
    .in('service_id', serviceIds)
    .order('position');
  if (error) {
    console.error('Failed to list variables for services:', error);
    return [];
  }
  return ((data || []) as any[]).map(rowToVariable);
}

/**
 * Replace a service's variables wholesale — the editor sends the full list it
 * wants, so removals are expressed by absence rather than a separate delete.
 *
 * A removed variable takes any package values with it (FK cascade), which is
 * correct: a package cannot hold a value for something the service no longer
 * recognizes.
 */
export async function setServiceVariables(input: { serviceId: string; variables: ServiceVariableInput[] }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: service } = await supabaseAdmin
    .from('services').select('id').eq('id', input.serviceId).eq('organization_id', orgId).maybeSingle();
  if (!service) throw new Error('Service not found');

  const clean = (input.variables || [])
    .map((v, i) => ({
      raw: v,
      key: (v.key || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, ''),
      label: (v.label || '').trim(),
      position: i,
    }))
    .filter((v) => v.key && v.label);

  const keys = clean.map((v) => v.key);
  const dupe = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dupe) throw new Error(`Two variables share the name "${dupe}" — each needs its own.`);

  // Anything not in the incoming list is gone.
  const keptIds = clean.map((v) => v.raw.id).filter(Boolean) as string[];
  let removal = supabaseAdmin.from('service_variables').delete().eq('organization_id', orgId).eq('service_id', input.serviceId);
  if (keptIds.length > 0) removal = removal.not('id', 'in', `(${keptIds.join(',')})`);
  await removal;

  for (const v of clean) {
    const row = {
      organization_id: orgId,
      service_id: input.serviceId,
      key: v.key,
      label: v.label,
      kind: v.raw.kind || 'number',
      unit: (v.raw.unit || '').trim() || null,
      options: v.raw.options || [],
      default_value: v.raw.defaultValue ?? null,
      min_value: v.raw.min ?? null,
      max_value: v.raw.max ?? null,
      position: v.position,
    };
    const { error } = v.raw.id
      ? await supabaseAdmin.from('service_variables').update(row).eq('id', v.raw.id).eq('organization_id', orgId)
      : await supabaseAdmin.from('service_variables').insert(row);
    if (error) {
      console.error('Failed to save service variable:', error);
      throw new Error(`Failed to save "${v.label}"`);
    }
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'service',
    entityId: input.serviceId,
    action: 'variables_updated',
    actorId: actorId ?? undefined,
    payload: { count: clean.length },
  });

  revalidatePath('/services');
  revalidatePath(`/services/${input.serviceId}`);
  return { ok: true, count: clean.length };
}

export async function getDeliverableIdsForServices(serviceIds: string[]): Promise<string[]> {
  if (serviceIds.length === 0) return [];
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin.from('service_deliverables').select('deliverable_id').in('service_id', serviceIds).eq('organization_id', orgId);
  return Array.from(new Set((data || []).map((d: any) => d.deliverable_id))) as string[];
}

/**
 * Workflows are independent. A Service no longer owns a single hardcoded process.
 * To get a production plan for a specific service, we must find a workflow that 
 * matches its outputs. If it's part of a Package, the Package specifies the workflow.
 * For now, this returns an empty plan since Packages will handle workflow selection.
 */
export async function getProductionPlanForService(
  serviceId: string
): Promise<{ blueprintId: string | null; stages: { name: string; order: number; roleId: string | null; frontStage: boolean | null }[] }> {
  // Production plans are now assembled at the Package level using package_workflows
  return { blueprintId: null, stages: [] };
}
