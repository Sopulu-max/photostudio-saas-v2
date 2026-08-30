'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { revalidatePath } from 'next/cache';
import type { ServiceVariable, ServiceVariableInput } from './variableTypes';
import { findByName } from '@/kernel/naming';
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
 * produce), and Workflows (a Service's Process — how the transformation is
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
  // Case-insensitive EQUALITY, not a pattern match — see kernel/naming.
  const { data: candidates } = await supabaseAdmin.from(table).select('id, name').eq('organization_id', orgId);
  const existing = findByName(candidates, clean);
  if (existing) return existing.id;
  const { data: last } = await supabaseAdmin.from(table).select('position').eq('organization_id', orgId).order('position', { ascending: false }).limit(1).maybeSingle();
  const { data: created, error } = await supabaseAdmin.from(table).insert({ organization_id: orgId, name: clean, position: (last?.position ?? -1) + 1 }).select('id').maybeSingle();
  if (error) {
    if (error.code === '23505') {
      const { data: retryRows } = await supabaseAdmin.from(table).select('id, name').eq('organization_id', orgId);
      const retry = findByName(retryRows, clean);
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

  /*
   * FOUND ACROSS THE STUDIO, NOT WITHIN THE DOMAIN.
   *
   * This looked for the dimension among the ones this domain owned, and made
   * one when it found none — which is how a studio ended up with Photography's
   * Occasion and Videography's Occasion, each holding its own Birthday. A
   * question belongs to the studio; a domain only says that it asks it.
   */
  const { data: dimRows } = await supabaseAdmin
    .from('dimensions').select('id, name')
    .eq('organization_id', orgId);

  let dimensionId = findByName(dimRows, dimName)?.id as string | undefined;
  if (!dimensionId) {
    const { data: made, error } = await supabaseAdmin
      .from('dimensions')
      .insert({ organization_id: orgId, name: dimName, position: 0 })
      .select('id').maybeSingle();
    if (error) {
      if (error.code === '23505') {
        const { data: retryDims } = await supabaseAdmin.from('dimensions').select('id, name').eq('organization_id', orgId);
        dimensionId = findByName(retryDims, dimName)?.id;
      }
      if (!dimensionId) { console.error('Failed to create dimension:', error); return null; }
    } else {
      dimensionId = made?.id;
    }
  }
  if (!dimensionId) return null;

  /*
   * And the domain is recorded as asking it.
   *
   * Without this a value created through this path would belong to a question
   * the domain never declared, so it would classify a service that no screen
   * would ever offer it on. Idempotent: a domain already asking it stays as it
   * is.
   */
  if (domainId) {
    const { data: last } = await supabaseAdmin
      .from('service_domain_dimensions').select('position')
      .eq('organization_id', orgId).eq('service_domain_id', domainId)
      .order('position', { ascending: false }).limit(1).maybeSingle();
    await supabaseAdmin
      .from('service_domain_dimensions')
      .upsert(
        {
          organization_id: orgId,
          service_domain_id: domainId,
          dimension_id: dimensionId,
          position: ((last?.position as number) ?? -1) + 1,
        },
        { onConflict: 'service_domain_id,dimension_id', ignoreDuplicates: true },
      );
  }

  const { data: valueRows } = await supabaseAdmin
    .from('dimension_values').select('id, name')
    .eq('dimension_id', dimensionId);
  const existingValue = findByName(valueRows, value);
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
      const { data: retryValues } = await supabaseAdmin.from('dimension_values').select('id, name').eq('dimension_id', dimensionId);
      const retryValue = findByName(retryValues, value);
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

import { findOrCreateOutputType } from '@/modules/deliverables/domain';

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
  /*
   * Read through the join, because one dimension can now be asked by several
   * domains. It used to belong to a domain, so a studio doing photography and
   * videography carried two Occasions with two Birthdays inside them — and
   * grouping by domain was a matter of reading a column.
   */
  const { data, error } = await supabaseAdmin
    .from('service_domain_dimensions')
    .select('position, domain:service_domains(name), dimension:dimensions(id, name, question, example, position, is_active, dimension_values(id, name, position))')
    .eq('organization_id', orgId)
    .order('position');
  if (error) { console.error('Failed to list dimensions by domain:', error); return {}; }

  const out: Record<string, StudioDimensionShape[]> = {};
  for (const row of ((data || []) as any[])) {
    const d = row.dimension;
    const domainName = row.domain?.name;
    if (!d || !d.is_active || !domainName) continue;
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
  // One row per (domain, dimension): a question asked by two domains is offered
  // under each, which is what the enquiry path narrows by.
  const { data } = await supabaseAdmin
    .from('service_domain_dimensions')
    .select('position, service_domain_id, domain:service_domains(name), dimension:dimensions(id, name, question, position, is_active, dimension_values(id, name, position))')
    .eq('organization_id', organizationId)
    .order('position');

  return ((data || []) as any[])
    .filter((row) => row.dimension?.is_active)
    .map((row) => ({ ...row.dimension, service_domain_id: row.service_domain_id, domain: row.domain }))
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

// ── Workflows: a Service's Process — how the transformation is carried out ─

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


export type WorkflowInput = {
  name: string;
  tasks: { name: string; roleName?: string | null; description?: string }[];
};

async function resolveWorkflow(orgId: string, domainId: string, input: WorkflowInput | null): Promise<string | null> {
  if (!input) return null;
  const name = input.name.trim();
  if (!name) return null;

  let workflowId: string;
  /*
    * The bug that started this sweep: a workflow named "Post_production" would
    * find and silently reuse "Post-production", because ILIKE read the typed
    * name as a pattern.
    */
  const { data: workflowRows } = await supabaseAdmin
    .from('workflows')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('service_domain_id', domainId);
  const existing = findByName(workflowRows, name);

  if (existing) {
    workflowId = existing.id;
  } else {
    const { data: created, error } = await supabaseAdmin
      .from('workflows')
      .insert({ organization_id: orgId, service_domain_id: domainId, name })
      .select('id')
      .single();
    if (error || !created) { console.error('Failed to create workflow:', error); throw new Error('Failed to create workflow'); }
    workflowId = created.id;
  }

  const { findOrCreateRole } = await import('@/modules/team/interface');
  const roleMap = new Map<string, string>();
  for (const t of input.tasks) {
    if (t.roleName) {
      const roleNameClean = t.roleName.trim();
      if (roleNameClean && !roleMap.has(roleNameClean)) {
        const roleId = await findOrCreateRole(roleNameClean);
        if (roleId) roleMap.set(roleNameClean, roleId);
      }
    }
  }

  const { data: existingTasks } = await supabaseAdmin.from('workflow_tasks').select('id, name').eq('workflow_id', workflowId);
  
  for (let i = 0; i < input.tasks.length; i++) {
    const t = input.tasks[i];
    const taskName = t.name.trim();
    if (!taskName) continue;
    const existingTask = existingTasks?.find((et: any) => et.name.toLowerCase() === taskName.toLowerCase());
    const payload = {
      organization_id: orgId,
      workflow_id: workflowId,
      name: taskName,
      default_role_id: t.roleName && roleMap.has(t.roleName.trim()) ? roleMap.get(t.roleName.trim()) : null,
      position: i,
      description: t.description || null,
    };
    if (existingTask) {
      await supabaseAdmin.from('workflow_tasks').update(payload).eq('id', existingTask.id);
    } else {
      await supabaseAdmin.from('workflow_tasks').insert(payload);
    }
  }

  return workflowId;
}

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
  workflow?: WorkflowInput | null;
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
      workflow_id: domainId && input.workflow ? await resolveWorkflow(orgId, domainId, input.workflow) : null,
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
  workflow?: WorkflowInput | null;
  /**
   * What varies about this service.
   *
   * updateService accepted every other part of a service and not this one, so
   * variables could only be changed by a second editor with its own Save
   * sitting below the form. Folding them into the one form without this would
   * have made editing them silently do nothing — the same shape as the workflow
   * bug, one field along.
   *
   * Undefined means "no opinion" and leaves them alone. An empty array is a
   * real instruction: this service varies in no way, remove what it had.
   */
  variables?: ServiceVariableInput[];
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
  if (input.workflow !== undefined && outputDomainId) {
    patch.workflow_id = await resolveWorkflow(orgId, outputDomainId, input.workflow);
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

  if (input.variables !== undefined) {
    // setServiceVariables reconciles: what is listed stays, what is not goes.
    // So an empty array removes them all, which is the only way a studio can
    // say a service stopped varying.
    await setServiceVariables({ serviceId: input.serviceId, variables: input.variables });
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

  // A fork is the same work — what varies about it varies the same way.
  const { data: vars } = await supabaseAdmin
    .from('service_variables')
    .select('key, label, kind, unit, options, default_value, min_value, max_value, position')
    .eq('service_id', serviceId)
    .eq('organization_id', orgId)
    .order('position');
  if (vars && vars.length > 0) {
    await supabaseAdmin.from('service_variables').insert(
      vars.map((v: any) => ({
        organization_id: orgId,
        service_id: copy.id,
        key: v.key,
        label: v.label,
        kind: v.kind,
        unit: v.unit,
        options: v.options,
        default_value: v.default_value,
        min_value: v.min_value,
        max_value: v.max_value,
        position: v.position,
      }))
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
      ${SERVICE_DIMENSION_SELECT},
      workflow:workflows(id, name, workflow_tasks(id, name, default_role:roles(name), position, description))
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
    workflow: s.workflow ? {
      name: s.workflow.name,
      tasks: ((s.workflow.workflow_tasks || []) as any[])
        .sort((a, b) => a.position - b.position)
        .map(t => ({
          name: t.name,
          roleName: t.default_role?.name || null,
          description: t.description || null
        }))
    } : null,
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
      service_variables(id, key, label, kind, unit, options, default_value, min_value, max_value, position),
      ${SERVICE_DIMENSION_SELECT},
      workflow:workflows(id, name, workflow_tasks(id, name, default_role:roles(name), position, description))
    `)
    .eq('id', serviceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    deliverables: ((data as any).service_deliverables || []).map((sd: any) => sd.deliverable).filter(Boolean),
    dimensions: shapeServiceDimensions(data),
    /*
     * The whole declaration, not a summary of it.
     *
     * This used to return label, kind, unit and options only, so the service's
     * own page could not show what a variable defaults to or what bounds it
     * has — facts the studio entered and then could not read back anywhere
     * except the edit form.
     */
    variables: (((data as any).service_variables) || [])
      .slice()
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      .map((v: any) => ({
        id: v.id,
        key: v.key,
        label: v.label,
        kind: v.kind,
        unit: v.unit,
        options: v.options || [],
        defaultValue: v.default_value ?? null,
        min: v.min_value ?? null,
        max: v.max_value ?? null,
        position: v.position ?? 0,
      })),
    workflow: (data as any).workflow ? {
      name: (data as any).workflow.name,
      tasks: (((data as any).workflow.workflow_tasks || []) as any[])
        .sort((a, b) => a.position - b.position)
        .map(t => ({
          name: t.name,
          roleName: t.default_role?.name || null,
          description: t.description || null
        }))
    } : null,
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
 * Which classification values each of these services can legitimately be
 * narrowed to — every value in the service's own domain.
 *
 * Packages ask this before recording a narrowing. A dimension belongs to a
 * domain and a service sits in exactly one, so the domain is the whole of the
 * answer: a Printing service cannot be narrowed to a Photography occasion,
 * however the form was submitted.
 */
export async function listDimensionValueIdsForServices(
  serviceIds: string[]
): Promise<{ serviceId: string; valueIds: string[] }[]> {
  if (serviceIds.length === 0) return [];
  const { orgId } = await getAuthOrgId();

  const { data: services } = await supabaseAdmin
    .from('services').select('id, service_domain_id')
    .eq('organization_id', orgId).in('id', serviceIds);
  const rows = (services || []) as { id: string; service_domain_id: string | null }[];

  const domainIds = [...new Set(rows.map((s) => s.service_domain_id).filter(Boolean))] as string[];
  if (domainIds.length === 0) return rows.map((s) => ({ serviceId: s.id, valueIds: [] }));

  const { data: values } = await supabaseAdmin
    .from('dimension_values')
    // Which domains ask the question this value answers. One value can now be
    // reached through more than one domain, so this is a join rather than a
    // column read.
    .select('id, dimension:dimensions!inner(id, service_domain_dimensions!inner(service_domain_id))')
    .eq('organization_id', orgId)
    .in('dimensions.service_domain_dimensions.service_domain_id', domainIds);

  const byDomain = new Map<string, string[]>();
  for (const v of ((values || []) as any[])) {
    // A value reached through several domains counts for each of them, which is
    // the whole point of a question the studio owns rather than a domain.
    for (const link of (v.dimension?.service_domain_dimensions || [])) {
      const domainId = link.service_domain_id;
      if (!domainId || !domainIds.includes(domainId)) continue;
      if (!byDomain.has(domainId)) byDomain.set(domainId, []);
      byDomain.get(domainId)!.push(v.id as string);
    }
  }

  return rows.map((s) => ({
    serviceId: s.id,
    valueIds: s.service_domain_id ? (byDomain.get(s.service_domain_id) || []) : [],
  }));
}

/**
 * Replace a service's variables wholesale — the editor sends the full list it
 * wants, so removals are expressed by absence rather than a separate delete.
 *
 * A removed variable takes any package values with it (FK cascade), which is
 * correct: a package cannot hold a value for something the service no longer
 * recognizes.
 */
/**
 * Add one variable to a service, without disturbing the others.
 *
 * WHY THIS IS SEPARATE FROM setServiceVariables. That one reconciles: whatever
 * is not in the list it receives is deleted. That is right for a form that
 * holds the whole set, and catastrophic for a caller that only knows about one
 * — a package sending its new variable would silently remove every other
 * variable the service had.
 *
 * WHY PACKAGES NEEDS IT. A package could only ever fix a value for a variable
 * the service had already declared, so a service that declared none could be
 * packaged in only one way. But declaring what varies is most of what building
 * a package IS: the same Portrait Photography becomes Basic and Deluxe by
 * saying two outfits or five, and you notice the studio needs an "outfits"
 * variable at the moment you are trying to sell two different amounts of it.
 *
 * The variable still belongs to the SERVICE, which is the point. Declaring it
 * while packaging does not make it the package's — it makes it available to
 * every package of that service, and to the booking form, and to the client.
 * One definition, reused. The package's own contribution is the value it fixes.
 *
 * Idempotent on the key: asking twice for "outfits" returns the one that
 * exists rather than making a second. Two variables with one name is the state
 * setServiceVariables refuses outright, and this must not create it by the back
 * door.
 */
export async function declareServiceVariable(input: {
  serviceId: string;
  variable: ServiceVariableInput;
}): Promise<ServiceVariable | null> {
  const { orgId, personId: actorId } = await getAuthOrgId();
  // Same check setServiceVariables makes, for the same reason: the service has
  // to be this studio's before anything is declared on it.
  const { data: service } = await supabaseAdmin
    .from('services').select('id').eq('id', input.serviceId).eq('organization_id', orgId).maybeSingle();
  if (!service) throw new Error('Service not found');

  const key = (input.variable.key || input.variable.label || '')
    .trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '');
  const label = (input.variable.label || '').trim();
  if (!key || !label) throw new Error('A variable needs a name.');

  const existing = await listServiceVariables(input.serviceId);
  const already = existing.find((v) => v.key === key);
  if (already) return already;

  const { data, error } = await supabaseAdmin
    .from('service_variables')
    .insert({
      organization_id: orgId,
      service_id: input.serviceId,
      key,
      label,
      kind: input.variable.kind || 'number',
      unit: (input.variable.unit || '').trim() || null,
      options: input.variable.options || [],
      default_value: input.variable.defaultValue ?? null,
      min_value: input.variable.min ?? null,
      max_value: input.variable.max ?? null,
      // Onto the end of whatever the service already declares.
      position: existing.length,
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('Failed to declare a service variable:', error);
    throw new Error(`Failed to add "${label}"`);
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'service',
    entityId: input.serviceId,
    action: 'variables_updated',
    actorId: actorId ?? undefined,
    payload: { declared: key },
  });

  revalidatePath('/services');
  revalidatePath(`/services/${input.serviceId}`);
  revalidatePath('/packages');

  return {
    id: data.id,
    serviceId: data.service_id,
    key: data.key,
    label: data.label,
    kind: data.kind,
    unit: data.unit ?? null,
    options: data.options || [],
    defaultValue: data.default_value ?? null,
    min: data.min_value ?? null,
    max: data.max_value ?? null,
    position: data.position ?? 0,
  };
}

/**
 * Add one output to what a service produces, without disturbing the rest.
 *
 * THE SAME ACT AS declareServiceVariable, one list along. A service names what
 * it produces; a package could previously only promise from that list, so a
 * package needing "Retouched Album" meant leaving, editing the service, and
 * coming back — when noticing the studio produces albums is precisely something
 * that happens while you are assembling the package that sells one.
 *
 * IT WIDENS THE SERVICE, DELIBERATELY. The output lands on the service, not on
 * the package, so every other package of that service can promise it too and
 * the studio's catalogue grows by being used. That is safe HERE because a
 * service's outputs are a menu: nothing is promised until a package says a
 * quantity, so widening the menu changes no existing package.
 *
 * It is NOT safe for classifications, which is why those work differently. A
 * service's dimension values are the default a package inherits when it says
 * nothing of its own, so adding one there would silently reclassify every
 * package that had never mentioned it.
 *
 * Idempotent: the deliverable is found-or-created in the service's domain, and
 * linking one already linked is a no-op rather than a duplicate row.
 */
export async function declareServiceDeliverable(input: {
  serviceId: string;
  name: string;
}): Promise<{ id: string; name: string } | null> {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const asked = (input.name || '').trim();
  if (!asked) throw new Error('Give the output a name.');

  // Scoped read, so this doubles as the ownership check declareServiceVariable
  // makes: a service that is not this studio's comes back empty.
  const { data: service } = await supabaseAdmin
    .from('services').select('service_domain_id')
    .eq('id', input.serviceId).eq('organization_id', orgId).maybeSingle();
  // deliverables.service_domain_id is NOT NULL — an output belongs to a domain
  // the way a dimension does, and there is nowhere to put one without it.
  if (!service?.service_domain_id) throw new Error('That service has no domain to hold the output.');

  const deliverableId = await findOrCreateOutputType(orgId, service.service_domain_id, asked);
  if (!deliverableId) throw new Error(`Failed to add "${asked}"`);

  const { data: already } = await supabaseAdmin
    .from('service_deliverables').select('id')
    .eq('organization_id', orgId)
    .eq('service_id', input.serviceId)
    .eq('deliverable_id', deliverableId)
    .maybeSingle();

  if (!already) {
    const { error } = await supabaseAdmin.from('service_deliverables')
      .insert({ organization_id: orgId, service_id: input.serviceId, deliverable_id: deliverableId });
    if (error) {
      console.error('Failed to attach an output to a service:', error);
      throw new Error(`Failed to add "${asked}"`);
    }
  }

  // The stored name, not the typed one: find-or-create matches an existing
  // output however it was capitalised, and the caller must show what the studio
  // actually calls it rather than what was just typed.
  const { data: stored } = await supabaseAdmin
    .from('deliverables').select('id, name').eq('id', deliverableId).maybeSingle();

  await logEvent({
    organizationId: orgId,
    entityType: 'service',
    entityId: input.serviceId,
    action: 'deliverables_updated',
    actorId: actorId ?? undefined,
    payload: { declared: stored?.name ?? asked },
  });

  revalidatePath('/services');
  revalidatePath(`/services/${input.serviceId}`);
  revalidatePath('/packages');
  revalidatePath('/deliverables');

  return { id: deliverableId, name: (stored?.name as string) ?? asked };
}

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

/*
 * getProductionPlanForService stood here.
 *
 * It returned `{ blueprintId: null, stages: [] }` unconditionally — its own
 * comment said production plans are assembled at the Package level now — and
 * nothing called it. A function that answers nothing, that nobody asks, holding
 * the last `blueprintId` in the codebase. Packages builds the plan from
 * package_tasks; a booking gets it from there.
 */


export async function listWorkflowsByDomain() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('workflows')
    .select('id, name, service_domain_id, workflow_tasks(id, name, position, description, default_role_id, role:roles(name))')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to list workflows:', error);
    return {};
  }

  const byDomain: Record<string, any[]> = {};
  for (const wf of data || []) {
    if (!byDomain[wf.service_domain_id]) byDomain[wf.service_domain_id] = [];
    byDomain[wf.service_domain_id].push({
      id: wf.id,
      name: wf.name,
      tasks: (wf.workflow_tasks || [])
        .sort((a: any, b: any) => a.position - b.position)
        .map((t: any) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          roleId: t.default_role_id,
          roleName: t.role ? t.role.name : null,
        })),
    });
  }
  return byDomain;
}

export async function saveWorkflow(domainId: string, input: WorkflowInput) {
  const { orgId } = await getAuthOrgId();
  const workflowId = await resolveWorkflow(orgId, domainId, input);

  /*
   * Reach the packages already built from this.
   *
   * A workflow's tasks used to land in a package only at the moment a service
   * was bundled into it. Define the workflow afterwards — which is what a studio
   * that built its catalog first actually does — and nothing revisited those
   * packages, so no booking ever got a task and nobody could be put on one.
   *
   * Asked of Packages rather than written here: package_tasks is theirs, and the
   * decision about what is additive and what would trample a package's own edits
   * belongs with the module that owns the table.
   */
  if (workflowId) {
    const { syncPackageTasksForWorkflow } = await import('@/modules/packages/interface');
    try {
      await syncPackageTasksForWorkflow(workflowId);
    } catch (e) {
      // The workflow is saved either way; a failed sync is recoverable by
      // saving it again, and losing the workflow would not be.
      console.error('Workflow saved, but packages could not be brought up to date:', e);
    }
  }

  revalidatePath('/services/settings');
  revalidatePath('/packages');
  return { ok: true };
}

export async function deleteWorkflow(workflowId: string) {
  const { orgId } = await getAuthOrgId();
  await supabaseAdmin.from('workflows').delete().eq('id', workflowId).eq('organization_id', orgId);
  revalidatePath('/services/settings');
  return { ok: true };
}
