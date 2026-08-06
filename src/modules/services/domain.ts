'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { revalidatePath } from 'next/cache';
import { DIMENSIONS, type Dimension } from './dimensions';

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
// Same open mechanism as everywhere else in this system: a closed set of
// axes the engine defines, open values the studio names, found-or-created on
// use so typing a new one just works without a separate trip to Settings.
//
// This includes the five classification dimensions (Subject, Occasion,
// Context, Purpose, Client) — owned here, not by Packages, because they
// apply symmetrically to both: a Service can be Subject=Real Estate just as
// meaningfully as a Package can. Packages consumes these through this
// module's interface, never the tables directly.

type NamedTable = 'service_domains' | 'deliverables' | 'occasions' | 'service_contexts' | 'subjects' | 'purposes' | 'client_types';

async function findOrCreateNamed(table: NamedTable, orgId: string, name: string): Promise<string | null> {
  const clean = (name || '').trim();
  if (!clean) return null;
  const { data: existing } = await supabaseAdmin.from(table).select('id').eq('organization_id', orgId).eq('name', clean).maybeSingle();
  if (existing) return existing.id;
  const { data: last } = await supabaseAdmin.from(table).select('position').eq('organization_id', orgId).order('position', { ascending: false }).limit(1).maybeSingle();
  const { data: created, error } = await supabaseAdmin.from(table).insert({ organization_id: orgId, name: clean, position: (last?.position ?? -1) + 1 }).select('id').single();
  if (error || !created) { console.error(`Failed to create ${table} value:`, error); return null; }
  return created.id;
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

export async function listServiceDomains() { return listNamed('service_domains'); }
export async function createServiceDomain(name: string) {
  const { orgId } = await getAuthOrgId();
  const id = await findOrCreateNamed('service_domains', orgId, name);
  if (!id) throw new Error('Give the service domain a name.');
  revalidatePath('/services');
  return { serviceDomainId: id };
}
export async function renameServiceDomain(id: string, name: string) { return renameNamed('service_domains', id, name, 'service domain'); }
export async function deleteServiceDomain(id: string) { return deleteNamed('service_domains', id, 'service domain'); }

export async function listDeliverables() { return listNamed('deliverables'); }
export async function createDeliverable(name: string) {
  const { orgId } = await getAuthOrgId();
  const id = await findOrCreateNamed('deliverables', orgId, name);
  if (!id) throw new Error('Give the deliverable a name.');
  revalidatePath('/services');
  return { deliverableId: id };
}
export async function renameDeliverable(id: string, name: string) { return renameNamed('deliverables', id, name, 'deliverable'); }
export async function deleteDeliverable(id: string) { return deleteNamed('deliverables', id, 'deliverable'); }

// ── The five classification dimensions: Subject, Occasion, Context, Purpose, Client ──
// Not "does it change the process" — that test is for whether something
// becomes its own Service. These are the observed angles a studio can
// classify its real, structured work FROM, once it exists: what it's of,
// when it happens, where, why, and for whom.

export async function listOccasions() { return listNamed('occasions'); }
export async function createOccasion(name: string) { const { orgId } = await getAuthOrgId(); const id = await findOrCreateNamed('occasions', orgId, name); if (!id) throw new Error('Give the occasion a name.'); revalidatePath('/services'); revalidatePath('/packages'); return { occasionId: id }; }
export async function renameOccasion(id: string, name: string) { return renameNamed('occasions', id, name, 'occasion'); }
export async function deleteOccasion(id: string) { return deleteNamed('occasions', id, 'occasion'); }

export async function listContexts() { return listNamed('service_contexts'); }
export async function createContext(name: string) { const { orgId } = await getAuthOrgId(); const id = await findOrCreateNamed('service_contexts', orgId, name); if (!id) throw new Error('Give the context a name.'); revalidatePath('/services'); revalidatePath('/packages'); return { contextId: id }; }
export async function renameContext(id: string, name: string) { return renameNamed('service_contexts', id, name, 'context'); }
export async function deleteContext(id: string) { return deleteNamed('service_contexts', id, 'context'); }

export async function listSubjects() { return listNamed('subjects'); }
export async function createSubject(name: string) { const { orgId } = await getAuthOrgId(); const id = await findOrCreateNamed('subjects', orgId, name); if (!id) throw new Error('Give the subject a name.'); revalidatePath('/services'); revalidatePath('/packages'); return { subjectId: id }; }
export async function renameSubject(id: string, name: string) { return renameNamed('subjects', id, name, 'subject'); }
export async function deleteSubject(id: string) { return deleteNamed('subjects', id, 'subject'); }

export async function listPurposes() { return listNamed('purposes'); }
export async function createPurpose(name: string) { const { orgId } = await getAuthOrgId(); const id = await findOrCreateNamed('purposes', orgId, name); if (!id) throw new Error('Give the purpose a name.'); revalidatePath('/services'); revalidatePath('/packages'); return { purposeId: id }; }
export async function renamePurpose(id: string, name: string) { return renameNamed('purposes', id, name, 'purpose'); }
export async function deletePurpose(id: string) { return deleteNamed('purposes', id, 'purpose'); }

export async function listClientTypes() { return listNamed('client_types'); }
export async function createClientType(name: string) { const { orgId } = await getAuthOrgId(); const id = await findOrCreateNamed('client_types', orgId, name); if (!id) throw new Error('Give the client type a name.'); revalidatePath('/services'); revalidatePath('/packages'); return { clientTypeId: id }; }
export async function renameClientType(id: string, name: string) { return renameNamed('client_types', id, name, 'client type'); }
export async function deleteClientType(id: string) { return deleteNamed('client_types', id, 'client type'); }

// ── Which dimensions a studio actually organizes by ──────────────────────────
// The set of possible dimensions is closed and engine-owned (bounded
// configurability, one level up): Subject, Occasion, Context, Purpose,
// Client. Which of those five a given studio actively uses is entirely
// theirs — one setting, shared by both Service and Package, since it answers
// "where do we categorize from," not "which layer are we tagging."

export async function getEnabledDimensions(): Promise<Dimension[]> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin.from('organizations').select('enabled_dimensions').eq('id', orgId).maybeSingle();
  const raw = (data?.enabled_dimensions as string[] | null) || ['occasion', 'context'];
  return raw.filter((d): d is Dimension => (DIMENSIONS as readonly string[]).includes(d));
}

const DIMENSION_TABLE: Record<Dimension, NamedTable> = {
  subject: 'subjects', occasion: 'occasions', context: 'service_contexts', purpose: 'purposes', client: 'client_types',
};

/** Find-or-create a value on whichever dimension's table, without requiring one — Packages asks this rather than touching the tables directly. */
export async function findOrCreateDimensionValue(dimension: Dimension, name: string): Promise<string | null> {
  const { orgId } = await getAuthOrgId();
  return findOrCreateNamed(DIMENSION_TABLE[dimension], orgId, name);
}

export async function setEnabledDimensions(dimensions: Dimension[]) {
  const { orgId } = await getAuthOrgId();
  const clean = [...new Set(dimensions)].filter((d) => (DIMENSIONS as readonly string[]).includes(d));
  const { error } = await supabaseAdmin.from('organizations').update({ enabled_dimensions: clean }).eq('id', orgId);
  if (error) throw new Error('Failed to save which dimensions you organize by.');
  revalidatePath('/services');
  revalidatePath('/services/settings');
  revalidatePath('/packages');
  revalidatePath('/packages/settings');
  return { ok: true };
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
  blueprintId?: string | null;
  deliverables?: string[];
  occasion?: string | null;
  context?: string | null;
  subject?: string | null;
  purpose?: string | null;
  clientType?: string | null;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const name = (input.name || '').trim();
  if (!name) throw new Error('A service needs a name.');

  const domainId = await findOrCreateNamed('service_domains', orgId, input.serviceDomain || '');
  const occasionId = await findOrCreateNamed('occasions', orgId, input.occasion || '');
  const contextId = await findOrCreateNamed('service_contexts', orgId, input.context || '');
  const subjectId = await findOrCreateNamed('subjects', orgId, input.subject || '');
  const purposeId = await findOrCreateNamed('purposes', orgId, input.purpose || '');
  const clientTypeId = await findOrCreateNamed('client_types', orgId, input.clientType || '');

  const { data: service, error } = await supabaseAdmin
    .from('services')
    .insert({
      organization_id: orgId,
      name,
      description: input.description || null,
      service_domain_id: domainId,
      default_blueprint_id: input.blueprintId || null,
      occasion_id: occasionId,
      context_id: contextId,
      subject_id: subjectId,
      purpose_id: purposeId,
      client_type_id: clientTypeId,
      status: 'active',
    })
    .select('id')
    .single();
  if (error || !service) { console.error('Failed to create service:', error); throw new Error('Failed to create service'); }

  const deliverableIds: string[] = [];
  for (const d of input.deliverables || []) {
    const id = await findOrCreateNamed('deliverables', orgId, d);
    if (id) deliverableIds.push(id);
  }
  if (deliverableIds.length > 0) {
    await supabaseAdmin.from('service_deliverables').insert(deliverableIds.map((deliverable_id) => ({ organization_id: orgId, service_id: service.id, deliverable_id })));
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
  blueprintId?: string | null;
  deliverables?: string[];
  occasion?: string | null;
  context?: string | null;
  subject?: string | null;
  purpose?: string | null;
  clientType?: string | null;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { data: existing } = await supabaseAdmin.from('services').select('id').eq('id', input.serviceId).eq('organization_id', orgId).maybeSingle();
  if (!existing) throw new Error('Service not found');

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('A service needs a name.');
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.blueprintId !== undefined) patch.default_blueprint_id = input.blueprintId || null;
  if (input.serviceDomain !== undefined) patch.service_domain_id = await findOrCreateNamed('service_domains', orgId, input.serviceDomain || '');
  if (input.occasion !== undefined) patch.occasion_id = await findOrCreateNamed('occasions', orgId, input.occasion || '');
  if (input.context !== undefined) patch.context_id = await findOrCreateNamed('service_contexts', orgId, input.context || '');
  if (input.subject !== undefined) patch.subject_id = await findOrCreateNamed('subjects', orgId, input.subject || '');
  if (input.purpose !== undefined) patch.purpose_id = await findOrCreateNamed('purposes', orgId, input.purpose || '');
  if (input.clientType !== undefined) patch.client_type_id = await findOrCreateNamed('client_types', orgId, input.clientType || '');

  if (Object.keys(patch).length > 0) {
    const { error } = await supabaseAdmin.from('services').update(patch).eq('id', input.serviceId).eq('organization_id', orgId);
    if (error) { console.error('Failed to update service:', error); throw new Error('Failed to save the service'); }
  }

  if (input.deliverables !== undefined) {
    await supabaseAdmin.from('service_deliverables').delete().eq('service_id', input.serviceId).eq('organization_id', orgId);
    const deliverableIds: string[] = [];
    for (const d of input.deliverables) {
      const id = await findOrCreateNamed('deliverables', orgId, d);
      if (id) deliverableIds.push(id);
    }
    if (deliverableIds.length > 0) {
      await supabaseAdmin.from('service_deliverables').insert(deliverableIds.map((deliverable_id) => ({ organization_id: orgId, service_id: input.serviceId, deliverable_id })));
    }
  }

  await logEvent({ organizationId: orgId, entityType: 'service', entityId: input.serviceId, action: 'updated', actorId: actorId ?? undefined, payload: patch });
  revalidatePath('/services');
  revalidatePath(`/services/${input.serviceId}`);
  return { ok: true };
}

/** Fork an existing Service — same domain, process, deliverables, a new id to edit from. */
export async function duplicateService(serviceId: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { data: existing } = await supabaseAdmin.from('services').select('name, description, service_domain_id, default_blueprint_id, occasion_id, context_id, subject_id, purpose_id, client_type_id').eq('id', serviceId).eq('organization_id', orgId).maybeSingle();
  if (!existing) throw new Error('Service not found');

  const { data: copy, error } = await supabaseAdmin
    .from('services')
    .insert({ organization_id: orgId, name: `${existing.name} (Copy)`, description: existing.description, service_domain_id: existing.service_domain_id, default_blueprint_id: existing.default_blueprint_id, occasion_id: existing.occasion_id, context_id: existing.context_id, subject_id: existing.subject_id, purpose_id: existing.purpose_id, client_type_id: existing.client_type_id, status: 'active' })
    .select('id')
    .single();
  if (error || !copy) { console.error('Failed to duplicate service:', error); throw new Error('Failed to duplicate the service'); }

  const { data: deliverables } = await supabaseAdmin.from('service_deliverables').select('deliverable_id').eq('service_id', serviceId).eq('organization_id', orgId);
  if (deliverables && deliverables.length > 0) {
    await supabaseAdmin.from('service_deliverables').insert(deliverables.map((d: any) => ({ organization_id: orgId, service_id: copy.id, deliverable_id: d.deliverable_id })));
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
      id, name, description, status, service_domain_id, default_blueprint_id,
      domain:service_domains(id, name), blueprint:blueprints(id, name), service_deliverables(deliverable:deliverables(id, name)),
      occasion:occasions(id, name), context:service_contexts(id, name),
      subject:subjects(id, name), purpose:purposes(id, name), client_type:client_types(id, name)
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) { console.error('Failed to list services:', error); throw new Error('Failed to load services'); }
  return (data || []).map((s: any) => ({ ...s, deliverables: (s.service_deliverables || []).map((sd: any) => sd.deliverable).filter(Boolean) }));
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
      id, name, description, status, service_domain_id, default_blueprint_id,
      domain:service_domains(id, name), service_deliverables(deliverable:deliverables(id, name)),
      occasion:occasions(id, name), context:service_contexts(id, name),
      subject:subjects(id, name), purpose:purposes(id, name), client_type:client_types(id, name)
    `)
    .eq('id', serviceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!data) return null;
  return { ...data, deliverables: ((data as any).service_deliverables || []).map((sd: any) => sd.deliverable).filter(Boolean) };
}

/** Deliverable ids for many Services at once — Packages asks for this to seed a new Package's promised deliverables, rather than reading service_deliverables itself. */
export async function getDeliverableIdsForServices(serviceIds: string[]): Promise<string[]> {
  if (serviceIds.length === 0) return [];
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin.from('service_deliverables').select('deliverable_id').in('service_id', serviceIds).eq('organization_id', orgId);
  return Array.from(new Set((data || []).map((d: any) => d.deliverable_id))) as string[];
}

/**
 * A Service's Process, resolved — what Packages asks for when composing the
 * aggregated routing of everything it bundles.
 */
export async function getProductionPlanForService(
  serviceId: string
): Promise<{ blueprintId: string | null; stages: { name: string; order: number; roleId: string | null; frontStage: boolean | null }[] }> {
  const { orgId } = await getAuthOrgId();
  const { data: service } = await supabaseAdmin.from('services').select('default_blueprint_id').eq('id', serviceId).eq('organization_id', orgId).maybeSingle();
  if (!service?.default_blueprint_id) return { blueprintId: null, stages: [] };

  const { data: blueprint } = await supabaseAdmin.from('blueprints').select('stages').eq('id', service.default_blueprint_id).maybeSingle();
  return {
    blueprintId: service.default_blueprint_id,
    stages: ((blueprint?.stages as any[]) || []).map((s, i) => ({ name: s.name, order: s.order ?? i, roleId: s.role_id ?? null, frontStage: s.front_stage ?? null })),
  };
}
