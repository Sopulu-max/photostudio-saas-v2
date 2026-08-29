'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { assertAllOurs, assertOurs } from '@/kernel/tenancy';
import { priceOf } from '@/kernel/money';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudioCurrency } from '@/kernel/organizations';
import { logEvent } from '@/kernel/events';
import { revalidatePath } from 'next/cache';
import { fieldType, type IntakeQuestion } from '@/modules/services/fieldTypes';
import { formatDeliverable } from './deliverableSpec';

/**
 * Packages — the marketing layer: how what a studio does gets sold. A
 * Package is a commercial construct, not a service, not a deliverable, not
 * a process — it bundles one or more real Services (asked of the Services
 * module through its interface, never touched directly) into a single,
 * priced, purchasable offering. "Wedding Gold" bundling Photography and
 * Videography isn't two things stapled together at booking time; it's one
 * Package whose routing is the union of what each bundled Service already
 * knows how to do, plus whatever this specific offering adds on its own.
 */

/**
 * What a package is, lifecycle-wise.
 *
 * `active` and `retired` are the two an operator chooses between. `custom` is
 * not offered to anyone — it marks an instance a booking made for itself (see
 * instantiatePackageForBooking) and exists so the catalog can leave those out.
 * Packages owns this vocabulary, which is the point: the value arrived through
 * a caller once, and listPackages went on showing every instance in the catalog
 * because the owner had never been told the word existed.
 */
export type PackageStatus = 'active' | 'retired' | 'custom';

/** The two an operator can actually put a package into. */
export type OperatorPackageStatus = Exclude<PackageStatus, 'custom'>;

type StageInput = { name: string; roleName?: string | null; frontStage?: boolean | null };

// ── Facet-style, studio-editable vocabulary (Category only — how work gets
// classified is owned by Services, since a dimension belongs to a service
// domain and applies symmetrically to Service too, not just Package) ────────

/**
 * Dimension links → the dimensions that asked, each with the values carried.
 *
 * Shared by the Service side (`service_dimension_values`) and the narrowing side
 * (`package_service_dimension_values`) because the two links are the same shape:
 * something, and a value in some domain's vocabulary. Grouping is by dimension
 * without assuming a shared parent, since a package reads across the domains of
 * everything it bundles.
 */
function shapeDimensionLinks(links: any[] | null | undefined) {
  const byDimension = new Map<string, { id: string; name: string; position: number; values: { id: string; name: string }[] }>();
  for (const link of (links || [])) {
    const v = link?.dimension_value;
    const d = v?.dimension;
    if (!v || !d) continue;
    if (!byDimension.has(d.id)) {
      byDimension.set(d.id, { id: d.id, name: d.name, position: d.position ?? 0, values: [] });
    }
    byDimension.get(d.id)!.values.push({ id: v.id, name: v.name });
  }
  return [...byDimension.values()].sort((a, b) => a.position - b.position);
}

// ── The core: Package bundles Services ───────────────────────────────────────



async function buildExtraStages(raw: StageInput[]): Promise<{ name: string; order: number; role_id: string | null; front_stage: boolean | null }[]> {
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

/**
 * The bundle rows this package holds right now.
 *
 * Everything a package says hangs off one of these, so every write below starts
 * here rather than trusting whatever the form sent. Read after the bundle is
 * reconciled, never before.
 */

/** What a catalog package costs right now, to be frozen onto an instance of it. */
async function listPriceOf(orgId: string, packageId: string) {
  const { data } = await supabaseAdmin
    .from('packages').select('price')
    .eq('id', packageId).eq('organization_id', orgId).maybeSingle();
  return (data as any)?.price ?? null;
}

async function copyWorkflowTasksToPackage(orgId: string, rows: { id: string; service_id: string }[]) {
  if (rows.length === 0) return;
  // Get workflows for these services
  const { data: services } = await supabaseAdmin
    .from('services')
    .select('id, workflow_id')
    .in('id', rows.map(r => r.service_id))
    .eq('organization_id', orgId);
    
  if (!services || services.length === 0) return;
  
  const workflowIds = [...new Set(services.map((s: any) => s.workflow_id).filter(Boolean))] as string[];
  if (workflowIds.length === 0) return;

  const { data: workflowTasks } = await supabaseAdmin
    .from('workflow_tasks')
    .select('id, workflow_id, name, default_role_id, position')
    .in('workflow_id', workflowIds)
    .eq('organization_id', orgId);
    
  if (!workflowTasks || workflowTasks.length === 0) return;
  
  const packageTasksToInsert: any[] = [];
  
  for (const row of rows) {
    const service = services.find((s: any) => s.id === row.service_id);
    if (!service || !service.workflow_id) continue;
    
    const tasks = workflowTasks.filter((t: any) => t.workflow_id === service.workflow_id);
    for (const t of tasks) {
      packageTasksToInsert.push({
        organization_id: orgId,
        package_service_id: row.id,
        workflow_task_id: t.id,
        name: t.name,
        role_id: t.default_role_id,
        position: t.position,
        is_active: true
      });
    }
  }
  
  if (packageTasksToInsert.length > 0) {
    await supabaseAdmin.from('package_tasks').insert(packageTasksToInsert);
  }
}
/**
 * Bring packages up to date with a workflow that has changed.
 *
 * WHY THIS IS NEEDED. A workflow's tasks are copied into a package at the
 * moment a service is bundled into it — and only then. So a studio that defines
 * its workflows after building its catalog gets nothing: the packages were
 * bundled while the workflow was empty, and nothing ever revisits them. That is
 * not a hypothetical here. There are 17 bundled services and no workflows at
 * all, so the first workflow anyone writes would reach none of them, no tasks
 * would land on any booking, and there would be nothing to put a photographer
 * on.
 *
 * ADDITIVE, NEVER DESTRUCTIVE. Only tasks the package does not already have are
 * added. A package may rename a task, give it a different role, reorder it or
 * switch it off entirely — those are its own decisions about this offering, and
 * re-syncing must not undo them. Removing a task from the workflow likewise
 * leaves packages alone: they are already selling it.
 */
export async function syncPackageTasksForWorkflow(workflowId: string) {
  const { orgId } = await getAuthOrgId();

  const { data: tasks } = await supabaseAdmin
    .from('workflow_tasks')
    .select('id, name, default_role_id, position')
    .eq('workflow_id', workflowId)
    .eq('organization_id', orgId);
  if (!tasks || tasks.length === 0) return { added: 0 };

  // Every bundle row whose service runs this workflow.
  const { data: services } = await supabaseAdmin
    .from('services').select('id').eq('workflow_id', workflowId).eq('organization_id', orgId);
  const serviceIds = (services || []).map((x: { id: string }) => x.id);
  if (serviceIds.length === 0) return { added: 0 };

  const { data: bundleRows } = await supabaseAdmin
    .from('package_services').select('id, service_id')
    .in('service_id', serviceIds).eq('organization_id', orgId);
  if (!bundleRows || bundleRows.length === 0) return { added: 0 };

  // What each bundle row already holds, so nothing is duplicated and no
  // package-level edit is overwritten.
  const { data: existing } = await supabaseAdmin
    .from('package_tasks').select('package_service_id, workflow_task_id')
    .in('package_service_id', bundleRows.map((r: { id: string }) => r.id))
    .eq('organization_id', orgId);

  const held = new Set(((existing || []) as any[]).map((e) => `${e.package_service_id}:${e.workflow_task_id}`));

  const toInsert: any[] = [];
  for (const row of bundleRows as any[]) {
    for (const t of tasks as any[]) {
      if (held.has(`${row.id}:${t.id}`)) continue;
      toInsert.push({
        organization_id: orgId,
        package_service_id: row.id,
        workflow_task_id: t.id,
        name: t.name,
        role_id: t.default_role_id,
        position: t.position,
        is_active: true,
      });
    }
  }

  if (toInsert.length === 0) return { added: 0 };

  const { error } = await supabaseAdmin.from('package_tasks').insert(toInsert);
  if (error) {
    console.error('Failed to sync package tasks:', error);
    throw new Error('Failed to bring packages up to date with that workflow');
  }

  revalidatePath('/packages');
  return { added: toInsert.length };
}

async function bundleRows(orgId: string, packageId: string) {
  const { data, error } = await supabaseAdmin
    .from('package_services').select('id, service_id, position')
    .eq('organization_id', orgId).eq('package_id', packageId);
  if (error) throw new Error(`Could not read what this package bundles: ${error.message}`);
  return (data || []) as { id: string; service_id: string; position: number }[];
}

/**
 * Replace one kind of link across every bundle row of a package.
 *
 * The delete is scoped by bundle row rather than by package, which is the whole
 * point of the re-key: there is no package-wide handle on these any more.
 */
async function replaceBundleLinks(
  orgId: string,
  table: 'package_variable_values' | 'package_deliverables',
  rows: { id: string }[],
  links: Record<string, unknown>[],
  failure: string
) {
  if (rows.length === 0) return;
  const { error: clearError } = await supabaseAdmin
    .from(table).delete()
    .eq('organization_id', orgId)
    .in('package_service_id', rows.map((r) => r.id));
  if (clearError) { console.error(`Failed to clear ${table}:`, clearError); throw new Error(failure); }

  if (links.length === 0) return;
  const { error } = await supabaseAdmin.from(table).insert(links);
  if (error) { console.error(`Failed to save ${table}:`, error); throw new Error(failure); }
}

/**
 * Write what a package fixes.
 *
 * This is where "packages select, they never redefine" stops being a sentence
 * in a doc. A value aimed at a variable outside the bundled services is
 * rejected outright rather than dropped, because silently dropping it would let
 * a package claim a scope it does not actually have.
 *
 * The input stays flat — a service variable already names its own service, so
 * the bundle row it belongs to is derived rather than asked for. Storage is not
 * flat: bundle the same service twice and each copy fixes its own value.
 *
 * A variable the package says nothing about is deliberately open — it stays a
 * question for the client rather than part of the offer.
 */
async function writePackageVariableValues(
  orgId: string,
  rows: { id: string; service_id: string }[],
  values?: { serviceVariableId: string; value: unknown }[]
) {
  const wanted = (values || []).filter((v) => v.serviceVariableId && v.value !== undefined && v.value !== null);

  let links: Record<string, unknown>[] = [];
  if (wanted.length > 0) {
    // Asked of the Services module — never read from its tables directly.
    const { listVariablesForServices } = await import('@/modules/services/interface');
    const serviceOfVariable = new Map(
      (await listVariablesForServices(rows.map((r) => r.service_id))).map((v: any) => [v.id, v.serviceId])
    );

    links = wanted.flatMap((v) => {
      const serviceId = serviceOfVariable.get(v.serviceVariableId);
      if (!serviceId) throw new Error('That option belongs to a service this package does not include.');
      // Every bundle row of that service, so bundling it twice fixes both.
      return rows.filter((r) => r.service_id === serviceId).map((r) => ({
        organization_id: orgId,
        package_service_id: r.id,
        service_variable_id: v.serviceVariableId,
        value: v.value,
      }));
    });
  }

  await replaceBundleLinks(orgId, 'package_variable_values', rows, links, 'Failed to save what this package includes');
}

/**
 * Write what a package promises, through the service that produces it.
 *
 * A promise with no producer is rejected. Until now nothing checked this at all
 * — only that the deliverable belonged to the studio — so a package bundling
 * Videography could promise a framed print that nothing in it makes. The
 * quantity, unit and spec live here rather than on the service because a
 * service says the kind and only a package says six of them.
 */
async function writePackageDeliverables(
  orgId: string,
  rows: { id: string; service_id: string }[],
  promises?: { serviceId: string; deliverableId: string; quantity?: number | null; specValues?: Record<string, unknown> | null }[]
) {
  const rowIdOf = new Map(rows.map((r) => [r.service_id, r.id]));
  const seen = new Set<string>();
  const links: Record<string, unknown>[] = [];
  for (const p of (promises || [])) {
    if (!p?.serviceId || !p?.deliverableId) continue;
    const packageServiceId = rowIdOf.get(p.serviceId);
    if (!packageServiceId) throw new Error('That deliverable is promised by a service this package does not include.');
    const key = `${packageServiceId}:${p.deliverableId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      organization_id: orgId,
      package_service_id: packageServiceId,
      deliverable_id: p.deliverableId,
      quantity: p.quantity ?? null,
      spec_values: p.specValues ?? null,
    });
  }
  await replaceBundleLinks(orgId, 'package_deliverables', rows, links, 'Failed to save what this package promises');
}


/**
 * Write how a package narrows what it bundles.
 *
 * A narrowing is not a tag on the package — it says "of this bundled service,
 * we sell this case", so it is stored against the `package_services` row. That
 * is what lets a package bundling two Photography services narrow them
 * differently, which a package-level key could not express at all.
 *
 * Rejected outright, never dropped: a value aimed at a service the package does
 * not bundle, or at a domain that service does not speak. Silently discarding
 * either would let a package claim a scope it does not have — the same rule
 * `writePackageVariableValues` follows, for the same reason.
 *
 * A service narrowed to nothing is deliberately open: the package sells
 * everything that service offers.
 */
async function writePackageNarrowings(
  orgId: string,
  packageId: string,
  narrowings?: { serviceId: string; valueId: string }[]
) {
  const { data: bundled } = await supabaseAdmin
    .from('package_services').select('id, service_id')
    .eq('organization_id', orgId).eq('package_id', packageId);
  const rows = (bundled || []) as { id: string; service_id: string }[];
  if (rows.length === 0) return;

  await supabaseAdmin
    .from('package_service_dimension_values').delete()
    .eq('organization_id', orgId)
    .in('package_service_id', rows.map((r) => r.id));

  const wanted = (narrowings || []).filter((n) => n?.serviceId && n?.valueId);
  if (wanted.length === 0) return;

  const rowIdOf = new Map(rows.map((r) => [r.service_id, r.id]));

  // Asked of the Services module — never read from its tables directly.
  const { listDimensionValueIdsForServices } = await import('@/modules/services/interface');
  const allowed = new Map(
    (await listDimensionValueIdsForServices(rows.map((r) => r.service_id)))
      .map((s) => [s.serviceId, new Set(s.valueIds)])
  );

  const seen = new Set<string>();
  const links: { organization_id: string; package_service_id: string; dimension_value_id: string }[] = [];
  for (const n of wanted) {
    const packageServiceId = rowIdOf.get(n.serviceId);
    if (!packageServiceId) throw new Error('That classification is on a service this package does not include.');
    if (!allowed.get(n.serviceId)?.has(n.valueId)) {
      throw new Error('That classification comes from a different domain than the service it was put on.');
    }
    const key = `${packageServiceId}:${n.valueId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ organization_id: orgId, package_service_id: packageServiceId, dimension_value_id: n.valueId });
  }

  const { error } = await supabaseAdmin.from('package_service_dimension_values').insert(links);
  if (error) {
    console.error('Failed to save package narrowings:', error);
    throw new Error('Failed to save how this package is classified');
  }
}

export async function createPackage(input: {
  name?: string;
  description?: string | null;
  durationMinutes?: number | null;
  price?: Record<string, unknown> | null;
  serviceIds?: string[];
  /**
   * This package is a booking's own instance, not catalog.
   *
   * Pass the catalog package it was built from, or `true` when the booking
   * built it from nothing. Either way Packages decides what an instance is
   * called and what status it carries — a caller that decided those for itself
   * is how the two booking screens ended up naming the same thing differently.
   */
  instanceOf?: string | true;
  /**
   * What the package actually includes, quantified — "Edited photographs × 6",
   * "Highlight video, 30 second", "Framed print, 20x30". A service says what
   * kind of thing it produces; this is where it gets specific, which is what a
   * package is for. Each promise names the bundled service that produces it.
   */
  deliverables?: { serviceId: string; deliverableId: string; quantity?: number | null; specValues?: Record<string, unknown> | null }[];
  /** The production sequences to run, each on the bundled service it belongs to. */
  /*
   * Never read and never written — no caller passes it and nothing consumes it.
   * Kept only because a package DOES have workflows; what it does not have is
   * this shape, which still named them blueprints. Whatever replaces it should
   * be built from what package_tasks actually needs.
   */
  workflows?: { serviceId: string; workflowId: string }[];
  /** What this package fixes — 2 outfits, 5 edited images. Keyed by service_variable id. */
  variableValues?: { serviceVariableId: string; value: unknown }[];
  /**
   * How this package narrows what it bundles — each value paired with the
   * bundled service it applies to.
   *
   * Paired rather than flat because the narrowing is a fact about a service
   * inside this package, not about the package: bundle two Photography
   * services and a bare value could not say which one it narrowed.
   */
  narrowings?: { serviceId: string; valueId: string }[];
  formSchema?: any[];
  extraStages?: StageInput[];
  tasks?: { id: string; isActive: boolean; roleId: string | null }[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const serviceIds = [...new Set(input.serviceIds || [])];
  let bundledServiceNames: string[] = [];
  if (serviceIds.length > 0) {
    // Asked of the Services module, never read from its tables directly.
    const { listActiveServices } = await import('@/modules/services/interface');
    const all = await listActiveServices();
    bundledServiceNames = (all as any[]).filter((s) => serviceIds.includes(s.id)).map((s) => s.name);
  }

  // Name always resolves — the studio's own words, or composed from whatever
  // Services this Package bundles.
  const name = (input.name || '').trim() || bundledServiceNames.join(' + ') || 'Untitled package';

  // An instance names the catalog package it came from, so that package has to
  // belong to this studio like everything else the form points at.
  if (typeof input.instanceOf === 'string') {
    await assertOurs(orgId, [{ table: 'packages', id: input.instanceOf, label: 'package' }]);
  }

  const currency = await getStudioCurrency();
  
  // Everything a package points at comes from the form, so each set is checked
  // against this studio before any of it is linked. The relink is destructive
  // (delete then insert), which is exactly why it happens after the check.
  await Promise.all([
    assertAllOurs(orgId, 'services', input.serviceIds, 'services'),
    assertAllOurs(orgId, 'deliverables', (input.deliverables || []).map((d) => d.deliverableId), 'outputs'),
    assertAllOurs(orgId, 'dimension_values', (input.narrowings || []).map((n) => n.valueId), 'classifications'),
    assertAllOurs(orgId, 'service_variables',
      (input.variableValues || []).map((v) => v.serviceVariableId), 'variables'),
  ]);

  const { data: pkg, error } = await supabaseAdmin
    .from('packages')
    .insert({
      organization_id: orgId,
      name,
      description: input.description || null,
      duration_minutes: input.durationMinutes ?? null,
      price: input.price || {},
      extra_stages: await buildExtraStages(input.extraStages || []),
      form_schema: input.formSchema || [],
      status: (input.instanceOf ? 'custom' : 'active') satisfies PackageStatus,
      // Where it came from, when it came from somewhere. A package built from
      // nothing during a booking is an instance of no catalog package, so it
      // carries no list price and cannot be discounted against one.
      instance_of: typeof input.instanceOf === 'string' ? input.instanceOf : null,
      list_price: typeof input.instanceOf === 'string' ? await listPriceOf(orgId, input.instanceOf) : null,
    })
    .select('id')
    .single();
  if (error || !pkg) { console.error('Failed to create package:', error); throw new Error('Failed to create package'); }

  if (serviceIds.length > 0) {
    // The bundle is the package's spine — everything below hangs off it, so a
    // lost insert here leaves a package that names services it does not have.
    const { error: bundleError } = await supabaseAdmin.from('package_services').insert(serviceIds.map((service_id, i) => ({ organization_id: orgId, package_id: pkg.id, service_id, position: i })));
    if (bundleError) { console.error('Failed to bundle services into package:', bundleError); throw new Error('Failed to add the services to the package'); }

    // Everything below hangs off the bundle rows just written, so they are read
    // back rather than reconstructed from the input.
    const rows = await bundleRows(orgId, pkg.id);
    await writePackageDeliverables(orgId, rows, input.deliverables);
    await writePackageVariableValues(orgId, rows, input.variableValues);
    await writePackageNarrowings(orgId, pkg.id, input.narrowings);
    await copyWorkflowTasksToPackage(orgId, rows);
  }

  await logEvent({ organizationId: orgId, entityType: 'package', entityId: pkg.id, action: 'created', actorId: actorId ?? undefined, payload: { name, serviceIds } });
  revalidatePath('/packages');
  return { packageId: pkg.id };
}

export async function updatePackage(input: {
  packageId: string;
  name?: string;
  description?: string | null;
  durationMinutes?: number | null;
  price?: Record<string, unknown> | null;
  serviceIds?: string[];
  /** What the package promises, each on the bundled service that produces it. */
  deliverables?: { serviceId: string; deliverableId: string; quantity?: number | null; specValues?: Record<string, unknown> | null }[];
  /** What this package fixes. Omit to leave untouched; pass [] to clear. */
  variableValues?: { serviceVariableId: string; value: unknown }[];
  /**
   * How this package narrows what it bundles — each value paired with the
   * bundled service it applies to.
   *
   * Paired rather than flat because the narrowing is a fact about a service
   * inside this package, not about the package: bundle two Photography
   * services and a bare value could not say which one it narrowed.
   */
  narrowings?: { serviceId: string; valueId: string }[];
  extraStages?: StageInput[];
  tasks?: { id: string; isActive: boolean; roleId: string | null }[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { data: existing } = await supabaseAdmin.from('packages').select('id, name').eq('id', input.packageId).eq('organization_id', orgId).maybeSingle();
  if (!existing) throw new Error('Package not found');

  // Everything a package points at comes from the form, so each set is checked
  // against this studio before any of it is linked. The relink is destructive
  // (delete then insert), which is exactly why it happens after the check.
  await Promise.all([
    assertAllOurs(orgId, 'services', input.serviceIds, 'services'),
    assertAllOurs(orgId, 'deliverables', (input.deliverables || []).map((d) => d.deliverableId), 'outputs'),
    assertAllOurs(orgId, 'dimension_values', (input.narrowings || []).map((n) => n.valueId), 'classifications'),
    assertAllOurs(orgId, 'service_variables',
      (input.variableValues || []).map((v) => v.serviceVariableId), 'variables'),
  ]);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim() || existing.name;
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.durationMinutes !== undefined) patch.duration_minutes = input.durationMinutes;
  if (input.price !== undefined) patch.price = input.price || {};
  if (input.extraStages !== undefined) patch.extra_stages = await buildExtraStages(input.extraStages);

  if (Object.keys(patch).length > 0) {
    const { error } = await supabaseAdmin.from('packages').update(patch).eq('id', input.packageId).eq('organization_id', orgId);
    if (error) { console.error('Failed to update package:', error); throw new Error('Failed to save the package'); }
  }

  // Reconciled, not replaced. A bundled service's row id is what a narrowing
  // hangs off, so delete-all-and-reinsert would cascade every narrowing away on
  // each save while looking like it had saved fine.
  if (input.serviceIds !== undefined) {
    const serviceIds = [...new Set(input.serviceIds)];
    const { data: current } = await supabaseAdmin
      .from('package_services').select('id, service_id')
      .eq('package_id', input.packageId).eq('organization_id', orgId);
    const existingRows = (current || []) as { id: string; service_id: string }[];

    const keep = new Set(serviceIds);
    const dropped = existingRows.filter((r) => !keep.has(r.service_id)).map((r) => r.id);
    if (dropped.length > 0) {
      await supabaseAdmin.from('package_services').delete().in('id', dropped).eq('organization_id', orgId);
    }

    const rowIdOf = new Map(existingRows.map((r) => [r.service_id, r.id]));
    const added = serviceIds.filter((id) => !rowIdOf.has(id));
    if (added.length > 0) {
      const { data: newRows, error: bundleError } = await supabaseAdmin.from('package_services').insert(
        added.map((service_id) => ({
          organization_id: orgId, package_id: input.packageId, service_id,
          position: serviceIds.indexOf(service_id),
        }))
      ).select('id, service_id');
      if (bundleError) { console.error('Failed to bundle services into package:', bundleError); throw new Error('Failed to add the services to the package'); }
      if (newRows && newRows.length > 0) {
        await copyWorkflowTasksToPackage(orgId, newRows);
      }
    }

    // The set can stay the same while the order changes.
    await Promise.all(
      serviceIds
        .map((service_id, i) => ({ rowId: rowIdOf.get(service_id), i }))
        .filter((r): r is { rowId: string; i: number } => Boolean(r.rowId))
        .map(({ rowId, i }) => supabaseAdmin
          .from('package_services').update({ position: i })
          .eq('id', rowId).eq('organization_id', orgId))
    );
  }



  // Everything below hangs off the bundle, which the block above may have just
  // changed — so it is read once, here, rather than taken from the input. A
  // service dropped up there took its promises with it by cascade.
  const rows = await bundleRows(orgId, input.packageId);
  if (input.deliverables !== undefined) await writePackageDeliverables(orgId, rows, input.deliverables);
  if (input.narrowings !== undefined) await writePackageNarrowings(orgId, input.packageId, input.narrowings);
  if (input.variableValues !== undefined) await writePackageVariableValues(orgId, rows, input.variableValues);
  if (input.tasks !== undefined) await writePackageTasks(orgId, input.tasks);

  await logEvent({ organizationId: orgId, entityType: 'package', entityId: input.packageId, action: 'updated', actorId: actorId ?? undefined, payload: patch });
  revalidatePath('/packages');
  revalidatePath(`/packages/${input.packageId}`);
  return { ok: true };
}

/**
 * Copy a package row and everything hanging off it, under a new name and status.
 *
 * The mechanism only — who is allowed to ask for a copy, what it gets called
 * and whether it belongs in the catalog are decisions the two callers below
 * make. Extracted because there are now two of them and a second hand-rolled
 * deep copy is how the two drift apart.
 */
async function copyPackage(
  orgId: string,
  packageId: string,
  as: { name: (original: string) => string; status: PackageStatus },
) {
  const { data: existing } = await supabaseAdmin
    .from('packages')
    // price was missing here, so every copy silently became unpriced. A booking's
    // own instance carrying no price is the whole quote lost, not a cosmetic gap.
    .select('name, description, duration_minutes, extra_stages, form_schema, price')
    .eq('id', packageId).eq('organization_id', orgId).maybeSingle();
  if (!existing) throw new Error('Package not found');

  const { data: copy, error } = await supabaseAdmin
    .from('packages')
    .insert({
      organization_id: orgId,
      name: as.name(existing.name),
      description: existing.description,
      duration_minutes: existing.duration_minutes,
      extra_stages: existing.extra_stages,
      form_schema: existing.form_schema,
      price: existing.price || {},
      status: as.status,
    })
    .select('id, name, price').single();
  if (error || !copy) { console.error('Failed to copy package:', error); throw new Error('Failed to copy the package'); }
  const made = { id: copy.id as string, name: copy.name as string, price: (copy.price || {}) as Record<string, unknown> };

  // Everything else hangs off a bundle row, so the copy's rows are matched back
  // to the originals by service and every link is rewritten through that map.
  // Nothing here can be copied by carrying an id across.
  const original = await bundleRows(orgId, packageId);
  if (original.length === 0) return made;

  const { data: inserted, error: bundleError } = await supabaseAdmin.from('package_services')
    .insert(original.map((s) => ({ organization_id: orgId, package_id: copy.id, service_id: s.service_id, position: s.position })))
    .select('id, service_id');
  if (bundleError) { console.error('Failed to copy the bundle:', bundleError); throw new Error('Failed to copy the package'); }

  const copyRowOf = new Map(((inserted || []) as any[]).map((s) => [s.service_id as string, s.id as string]));
  const serviceOfOriginal = new Map(original.map((s) => [s.id, s.service_id]));
  const originalIds = original.map((s) => s.id);
  const rekey = (packageServiceId: string) => copyRowOf.get(serviceOfOriginal.get(packageServiceId) as string);

  const [outputs, narrowings, fixed] = await Promise.all([
    supabaseAdmin.from('package_deliverables').select('package_service_id, deliverable_id, quantity').eq('organization_id', orgId).in('package_service_id', originalIds),
    supabaseAdmin.from('package_service_dimension_values').select('package_service_id, dimension_value_id').eq('organization_id', orgId).in('package_service_id', originalIds),
    supabaseAdmin.from('package_variable_values').select('package_service_id, service_variable_id, value').eq('organization_id', orgId).in('package_service_id', originalIds),
  ]);

  const carry = async (table: string, rows: any[] | null, shape: (r: any, packageServiceId: string) => Record<string, unknown>) => {
    const links = ((rows || []) as any[])
      .map((r) => ({ r, to: rekey(r.package_service_id) }))
      .filter((x): x is { r: any; to: string } => Boolean(x.to))
      .map(({ r, to }) => shape(r, to));
    if (links.length === 0) return;
    const { error } = await supabaseAdmin.from(table).insert(links);
    if (error) { console.error(`Failed to copy ${table}:`, error); throw new Error('Failed to copy the package'); }
  };

  await Promise.all([
    carry('package_deliverables', outputs.data, (r, to) => ({ organization_id: orgId, package_service_id: to, deliverable_id: r.deliverable_id, quantity: r.quantity })),
    carry('package_service_dimension_values', narrowings.data, (r, to) => ({ organization_id: orgId, package_service_id: to, dimension_value_id: r.dimension_value_id })),
    carry('package_variable_values', fixed.data, (r, to) => ({ organization_id: orgId, package_service_id: to, service_variable_id: r.service_variable_id, value: r.value })),
  ]);

  return made;
}

/** Fork an existing Package — same bundle, same terms, a new id and name to edit from. */
export async function duplicatePackage(packageId: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const copy = await copyPackage(orgId, packageId, {
    name: (original) => `${original} (Copy)`,
    status: 'active',
  });
  await logEvent({ organizationId: orgId, entityType: 'package', entityId: copy.id, action: 'duplicated', actorId: actorId ?? undefined, payload: { fromPackageId: packageId } });
  revalidatePath('/packages');
  return { packageId: copy.id };
}

/**
 * The package a booking gets to keep.
 *
 * A booking must not point at the catalog row. The studio goes on editing its
 * catalog — a price rises, a deliverable changes — and a booking that merely
 * referenced it would have its history rewritten underneath it. So a booking
 * takes an instance: a private copy, `custom` so it never appears in the
 * catalog, insulated from every later edit to the package it came from.
 *
 * THIS IS THE RULE, AND THIS IS WHERE IT LIVES. It used to live in
 * NewBookingForm.tsx — a browser component — which is why only bookings made
 * on that screen obeyed it. Public bookings went through a different screen,
 * got no instance, and shared the catalog row with the catalog. A statement
 * about what a booking *is* belongs under both screens, not inside one.
 *
 * @param organizationId  The public booking page has no session, so it passes
 *   the org resolved from its slug. Self-consistency is still checked: the
 *   package must belong to the studio whose page was filled in.
 */
export async function instantiatePackageForBooking(input: {
  packageId: string;
  organizationId?: string;
}) {
  let orgId = input.organizationId;
  let actorId: string | null = null;
  if (orgId) {
    await assertOurs(orgId, [{ table: 'packages', id: input.packageId, label: 'package' }]);
  } else {
    const session = await getAuthOrgId();
    orgId = session.orgId;
    actorId = session.personId ?? null;
  }

  /*
   * An instance keeps the name it was sold under.
   *
   * A suffix here would read as internal bookkeeping in a client's hands: the
   * invoice line's description is this package's name, so "Golden Hour Portrait
   * (Instance)" is what would print on the invoice and appear in the booking's
   * own title. What makes this row an instance is its status and the fact a
   * booking owns it — neither of which needs saying in the name.
   */
  const instance = await copyPackage(orgId, input.packageId, {
    name: (original) => original,
    status: 'custom',
  });

  /*
   * What it came from, and what it was worth at that moment.
   *
   * The discount on a booking is the difference between what the package listed
   * at and what was agreed — derived, never stored as its own number. But the
   * catalog price moves, so comparing against it live would silently
   * re-baseline: a shoot discounted by 20,000 in March would read as discounted
   * by 45,000 after a price rise in June. Freezing the list price here is what
   * makes the derivation stable.
   */
  const { data: source } = await supabaseAdmin
    .from('packages').select('price')
    .eq('id', input.packageId).eq('organization_id', orgId).maybeSingle();

  await supabaseAdmin
    .from('packages')
    .update({ instance_of: input.packageId, list_price: (source as any)?.price ?? null })
    .eq('id', instance.id)
    .eq('organization_id', orgId);

  await logEvent({
    organizationId: orgId,
    entityType: 'package',
    entityId: instance.id,
    action: 'instantiated',
    actorId: actorId ?? undefined,
    payload: { fromPackageId: input.packageId },
  });
  // Deliberately no revalidatePath('/packages') — an instance is not catalog,
  // and nothing on that page changed.
  //
  // The name and price come back so a caller does not have to read them off the
  // packages table afterwards. Bookings needs both for its own line, and that
  // read is exactly the shortcut that turned into a write.
  return { packageId: instance.id, name: instance.name, price: instance.price };
}

/**
 * Where a service is sold — `package ↔ service` read from the service end.
 *
 * The same move as the lens, on a different edge. `package_services` already
 * holds it; forward it answers "what does this package bundle", backward it
 * answers "if I retire this service, what stops being sellable" — which is the
 * question an operator actually has and had no way to ask.
 *
 * It lives in Packages, not Services, because the edge does. Services must not
 * read package tables — the dependency runs one way, and the service detail
 * page composes both modules rather than making one reach into the other.
 */
export async function listPackagesForService(serviceId: string) {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('package_services')
    .select('package:packages(id, name, status, price)')
    .eq('organization_id', orgId)
    .eq('service_id', serviceId);
  if (error) { console.error('Failed to list packages for service:', error); return []; }

  return ((data || []) as any[])
    .map((r) => r.package)
    .filter(Boolean)
    .map((p: any) => ({
      id: p.id as string,
      name: p.name as string,
      status: (p.status ?? null) as string | null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function setPackageStatus(input: { packageId: string; status: OperatorPackageStatus }) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { error } = await supabaseAdmin.from('packages').update({ status: input.status }).eq('id', input.packageId).eq('organization_id', orgId);
  if (error) throw new Error('Failed to change the package');
  await logEvent({ organizationId: orgId, entityType: 'package', entityId: input.packageId, action: input.status === 'retired' ? 'retired' : 'restored', actorId: actorId ?? undefined });
  revalidatePath('/packages');
  revalidatePath(`/packages/${input.packageId}`);
  return { ok: true };
}

/**
 * A package, read as what it bundles.
 *
 * Every embed below the bundle row rather than beside it — that is the whole
 * shape of a package. What it narrows, fixes, promises and how it is produced
 * are all facts about one bundled service, so there is nothing left to select
 * at package level except the package's own commercial terms.
 */
const PACKAGE_SELECT = `
  id, name, description, status, duration_minutes, extra_stages, price, instance_of, list_price,
  package_services(id, position, service:services(
    id, name, description, domain:service_domains(id, name),
    workflow:workflows(id, name),
    service_deliverables(deliverable:deliverables(id, name)),
    service_dimension_values(dimension_value:dimension_values(id, name, dimension:dimensions(id, name, position))),
    service_variables(id, service_id, key, label, unit, kind, options)
  ),
  package_service_dimension_values(dimension_value:dimension_values(id, name, dimension:dimensions(id, name, position))),
  package_deliverables(quantity, spec_values, deliverable:deliverables(id, name, default_unit, spec_schema, spec_values)),
  package_variable_values(value, variable:service_variables(id, service_id, key, label, unit, kind)),
  package_tasks(id, workflow_task_id, name, role:roles(id, name), position, is_active))
`;

/**
 * One package, flattened from the bundle-shaped read above.
 *
 * The package-level `deliverables` and `workflows` here are unions across the
 * bundle, kept because an invoice line and a picker row genuinely want the
 * whole promise in one list. They are derived every time and stored nowhere —
 * the per-service answer on `services[].deliverables` is the truth.
 */
function shapePackage(p: any) {
  const bundle = ((p.package_services || []) as any[]).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const promised = bundle.flatMap((ps) =>
    (ps.package_deliverables || [])
      .filter((pd: any) => pd.deliverable)
      .map((pd: any) => ({ ...pd.deliverable, quantity: pd.quantity, serviceId: ps.service?.id }))
  );
  return {
    ...p,
    /*
     * One shape for the price, decided here rather than by each screen.
     *
     * The raw column was being spread through untouched, so every consumer
     * parsed the JSON itself — and they did not agree. The package editor wrote
     * and read `amount`; the money path read `base_price`; the storefront read a
     * third column that its own query did not even select. Normalising once, at
     * the module's edge, is what makes "the price of this package" a single fact
     * instead of three opinions. Null means unpriced, which is a normal state.
     */
    price: priceOf(p.price),
    /*
     * What it listed at when taken, and the difference. Both derived here so no
     * screen works it out for itself — the failure that gave the price three
     * different readings in the first place.
     */
    listPrice: priceOf(p.list_price),
    discount: (() => {
      const agreed = priceOf(p.price);
      const list = priceOf(p.list_price);
      if (!agreed || !list) return null;
      const off = Math.round((list.amount - agreed.amount) * 100) / 100;
      return off > 0 ? { amount: off, currency: list.currency } : null;
    })(),
    services: bundle.map((ps) => ({
      ...ps.service,
      packageServiceId: ps.id,
      // What the service offers, and what this package sells of it.
      offers: (ps.service?.service_deliverables || []).map((sd: any) => sd.deliverable).filter(Boolean),
      deliverables: (ps.package_deliverables || [])
        .filter((pd: any) => pd.deliverable)
        .map((pd: any) => ({ ...pd.deliverable, quantity: pd.quantity })),
      dimensions: shapeDimensionLinks(ps.service?.service_dimension_values),
      narrowedTo: shapeDimensionLinks(ps.package_service_dimension_values),
      variables: (ps.service?.service_variables || []).map((v: any) => ({
        id: v.id, serviceId: v.service_id, key: v.key, label: v.label, unit: v.unit, kind: v.kind, options: v.options
      })),
      variableValues: (ps.package_variable_values || [])
        .filter((pv: any) => pv.variable)
        .map((pv: any) => ({
          serviceVariableId: pv.variable.id, serviceId: pv.variable.service_id,
          key: pv.variable.key, label: pv.variable.label,
          unit: pv.variable.unit ?? null, kind: pv.variable.kind, value: pv.value,
        })),
      tasks: (ps.package_tasks || [])
        .sort((a: any, b: any) => a.position - b.position)
        .map((pt: any) => ({
          id: pt.id, workflowTaskId: pt.workflow_task_id, name: pt.name, 
          roleName: pt.role?.name || null, roleId: pt.role?.id || null, 
          isActive: pt.is_active, position: pt.position
        })),
    })).filter((s: any) => s.id),
    deliverables: promised,
    dimensions: packageDimensions(p.package_services),
    // What this package fixes — "2 outfits", "5 edited images". A variable the
    // package says nothing about stays open, so it is simply absent here.
    variableValues: bundle.flatMap((ps) =>
      (ps.package_variable_values || [])
        .filter((pv: any) => pv.variable)
        .map((pv: any) => ({
          serviceVariableId: pv.variable.id, serviceId: pv.variable.service_id,
          key: pv.variable.key, label: pv.variable.label,
          unit: pv.variable.unit ?? null, kind: pv.variable.kind, value: pv.value,
        }))
    ),
  };
}

/**
 * What the package says about itself, read from what it narrowed.
 *
 * There is no package-level classification stored anywhere; this is the union
 * of the narrowings across its bundled services. A package spanning two domains
 * therefore reads as classified in both, which stays true without anything
 * having been written twice.
 */
function packageDimensions(packageServices: any[] | null | undefined) {
  return shapeDimensionLinks(
    (packageServices || []).flatMap((ps: any) => ps?.package_service_dimension_values || [])
  );
}

export async function listPackages() {
  const { orgId } = await getAuthOrgId();
  // Deliverables come along here, not just on getPackage: a picker showing what
  // a package promises is exactly where that matters, and asking per-package
  // would be a query per row.
  const { data, error } = await supabaseAdmin
    .from('packages')
    .select(PACKAGE_SELECT)
    .eq('organization_id', orgId)
    // The catalog is what the studio sells. Instances a booking made for itself
    // are packages by every other measure, and would otherwise pile up here one
    // per booking line forever.
    .neq('status', 'custom')
    .order('created_at', { ascending: false });
  if (error) { console.error('Failed to list packages:', error); throw new Error('Failed to load packages'); }
  return (data || []).map(shapePackage);
}

export async function listPackagesPublic(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('packages')
    .select('id, name, description, duration_minutes, package_services(service:services(id, name))')
    .eq('organization_id', orgId).eq('status', 'active').order('created_at', { ascending: false });
  if (error) { console.error('Failed to list public packages:', error); return []; }
  return (data || []).map((p: any) => ({ ...p, services: (p.package_services || []).map((ps: any) => ps.service).filter(Boolean) }));
}

/**
 * Public package listing with dimension data — used by the intake wizard to
 * match what a client describes against what the studio offers. Each package
 * carries the union of dimension IDs from all of its bundled services so the
 * client-side matcher can score without a server round-trip per selection.
 */
export async function listPackagesPublicWithDimensions(orgId: string) {
  const { data } = await supabaseAdmin
    .from('packages')
    .select(`
      id, name, description, duration_minutes,
      package_services(id, service:services(
        id, name
      ), package_deliverables(id), package_service_dimension_values(dimension_value:dimension_values(
        id, name, dimension:dimensions(id, name)
      )))
    `)
    .eq('organization_id', orgId).eq('status', 'active')
    .order('created_at', { ascending: false });

  return ((data || []) as any[]).map((p) => {
    const services = (p.package_services || []).map((ps: any) => ps.service).filter(Boolean);
    const links = (p.package_services || []).flatMap((ps: any) => ps.package_service_dimension_values || []);
    return {
      id: p.id as string,
      name: p.name as string,
      description: (p.description ?? null) as string | null,
      duration_minutes: (p.duration_minutes ?? null) as number | null,
      services: services.map((s: any) => ({ id: s.id as string, name: s.name as string })),
      deliverablesCount: (p.package_services || []).reduce((acc: number, ps: any) => acc + (ps.package_deliverables?.length || 0), 0),
      dimensionValueIds: [...new Set(
        links.map((pv: any) => pv.dimension_value?.id).filter(Boolean)
      )] as string[],
      dimensions: links.map((pv: any) => ({
        valueId: pv.dimension_value?.id as string,
        valueName: pv.dimension_value?.name as string,
        dimensionId: pv.dimension_value?.dimension?.id as string,
        dimensionName: pv.dimension_value?.dimension?.name as string
      })).filter((d: any) => d.valueId),
    };
  });
}

/** Public details for a specific package — used by public booking intake. */
export async function getPackagePublic(orgId: string, packageId: string) {
  const { data, error } = await supabaseAdmin
    .from('packages')
    .select(`
      id, name, description, pricing_variant, duration_minutes, form_schema,
      package_services(
        service:services(name),
        package_deliverables(
          quantity, spec_values,
          deliverable:deliverables(id, name, default_unit, spec_schema, spec_values)
        )
      )
    `)
    .eq('id', packageId)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .maybeSingle();
  /*
   * A bad select here reads exactly like a retired package.
   *
   * This asked for package_deliverables.unit and .spec, which the deliverable
   * rework replaced with spec_values on the link and default_unit/spec_schema on
   * the deliverable itself. PostgREST answered with an error, the error was
   * logged and swallowed, and every caller saw `null` — so the public booking
   * page told every visitor "This package is no longer available" for every
   * package the studio sells. Throwing would have been loud; returning null was
   * indistinguishable from the ordinary not-found it is here to express.
   */
  if (error) { console.error('Failed to get public package:', error); return null; }
  if (!data) return null;
  const p: any = data;
  return {
    id: p.id as string,
    name: p.name as string,
    description: (p.description ?? null) as string | null,
    durationMinutes: (p.duration_minutes ?? null) as number | null,
    formSchema: (p.form_schema || []) as any[],
    serviceNames: ((p.package_services || []) as any[]).map((ps) => ps.service?.name).filter(Boolean) as string[],
    // Specified, so the storefront says "6 edited photographs" rather than
    // leaving a client to guess how many. Flattened across the bundle: a client
    // reading a storefront wants the whole promise, not it sorted by producer.
    deliverableNames: ((p.package_services || []) as any[])
      .flatMap((ps) => (ps.package_deliverables || []) as any[])
      .filter((pd) => pd.deliverable?.name)
      .map((pd) => ({
        id: pd.deliverable.id,
        name: pd.deliverable.name,
        default_unit: pd.deliverable.default_unit,
        spec_schema: pd.deliverable.spec_schema,
        spec_values: pd.deliverable.spec_values,
        quantity: pd.quantity,
        package_spec_values: pd.spec_values
      }))
      .map((pd) => formatDeliverable({ 
        name: pd.name, 
        quantity: pd.quantity, 
        unit: pd.default_unit,
        spec_values: pd.spec_values || pd.package_spec_values 
      })),
  };
}

export async function getPackage(packageId: string) {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin.from('packages').select(PACKAGE_SELECT)
    .eq('id', packageId).eq('organization_id', orgId).maybeSingle();
  if (error) { console.error('Failed to get package:', error, error?.message, error?.details); throw new Error('Failed to load the package'); }
  if (!data) return null;
  return shapePackage(data);
}

/**
 * What this package deliberately did NOT fix.
 *
 * The counterpart to variableValues: those are the offer, these are what is
 * still to be agreed. An open variable is the reason the booking form has a
 * question to ask, so this is what turns "left blank in the editor" into a real
 * field in front of a client.
 *
 * Public-safe: takes an explicit org and never touches a session, because the
 * storefront calls it.
 */
export async function getOpenVariablesForPackagePublic(orgId: string, packageId: string) {
  const all = await getPackageVariablesPublic(orgId, packageId);
  return all.filter((v) => !v.fixed);
}

/**
 * Every variable the package's bundled services declare, each marked with
 * whether the package already fixed it. The open ones become the storefront's
 * questions; the whole list is what an operator edits against, since they can
 * legitimately change a fixed value for one client.
 */
export async function getPackageVariablesPublic(orgId: string, packageId: string) {
  // One read, and it throws rather than falling back to empty: an empty answer
  // here reads as "this package asks the client nothing", so a failed query
  // would quietly let someone book without ever being asked what they are
  // buying. What the package fixed now hangs off the same bundle row as the
  // service that declares the variable, so it comes back in the same pass.
  const { data: rows, error: rowsError } = await supabaseAdmin
    .from('package_services')
    .select(`
      service:services(id, name, service_variables(id, key, label, kind, unit, options, default_value, min_value, max_value, position)),
      package_variable_values(service_variable_id)
    `)
    .eq('package_id', packageId)
    .eq('organization_id', orgId)
    .order('position');
  if (rowsError) throw new Error(`Could not read the package's services: ${rowsError.message}`);

  const all: any[] = [];
  for (const row of ((rows || []) as any[])) {
    const service = row.service;
    if (!service) continue;
    const fixedIds = new Set(((row.package_variable_values || []) as any[]).map((f) => f.service_variable_id));
    for (const v of (service.service_variables || [])) {
      all.push({
        id: v.id,
        serviceId: service.id,
        serviceName: service.name,
        key: v.key,
        label: v.label,
        kind: v.kind,
        unit: v.unit ?? null,
        options: Array.isArray(v.options) ? v.options : [],
        defaultValue: v.default_value ?? null,
        min: v.min_value ?? null,
        max: v.max_value ?? null,
        position: v.position ?? 0,
        fixed: fixedIds.has(v.id),
      });
    }
  }
  return all.sort((a, b) => a.position - b.position);
}

/** The same, for an authenticated operator. */
export async function getPackageVariables(packageId: string) {
  const { orgId } = await getAuthOrgId();
  return getPackageVariablesPublic(orgId, packageId);
}

/** The same, for an authenticated operator. */
export async function getOpenVariablesForPackage(packageId: string) {
  const { orgId } = await getAuthOrgId();
  return getOpenVariablesForPackagePublic(orgId, packageId);
}

/**
 * The deliverable types these packages promise, deduplicated. Two packages on
 * one booking that both promise Edited Photos owe one set of edited photos,
 * not two — the promise is a set, which is why this unions rather than lists.
 */
export async function getDeliverablesForPackages(packageIds: string[]): Promise<{ id: string; name: string }[]> {
  if (packageIds.length === 0) return [];
  const { orgId } = await getAuthOrgId();
  // Read through the bundle, since that is where a promise now lives.
  const { data, error } = await supabaseAdmin
    .from('package_services')
    .select('package_deliverables(deliverable:deliverables(id, name))')
    .eq('organization_id', orgId)
    .in('package_id', packageIds);
  if (error) {
    console.error('Failed to list promised deliverables:', error);
    return [];
  }
  const byId = new Map<string, { id: string; name: string }>();
  for (const row of ((data || []) as any[])) {
    for (const pd of (row.package_deliverables || [])) {
      if (pd.deliverable) byId.set(pd.deliverable.id, { id: pd.deliverable.id, name: pd.deliverable.name });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** What Bookings needs to build a line — id and its aggregated routing inputs. */
export async function getPackageForBooking(packageId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin.from('packages').select('id, name, duration_minutes, price').eq('id', packageId).eq('organization_id', orgId).maybeSingle();
  return data;
}

/** Payment policy for many packages at once — Bookings asks for this when drafting a contract. */
/*
 * getPaymentPoliciesForPackages stood here.
 *
 * It read a deposit percentage off each package's price and resolved a payment
 * policy from it — the model that was removed on the ruling that a package does
 * not hold payment terms when there is a contract module. The removal took its
 * callers and the column it read, leaving a function nothing called, reading a
 * field nothing wrote. The studio's deposit now belongs to Contracts, as
 * getDepositDefault().
 */

// ── Intake questions: what a client is asked when booking this Package ──────

function normaliseQuestions(raw: unknown): IntakeQuestion[] {
  return ((raw as any[]) || []).filter((q) => q && q.id && q.label).map((q) => ({
    id: String(q.id), type: (q.type || 'text') as IntakeQuestion['type'], label: String(q.label),
    required: !!q.required, help: q.help ? String(q.help) : undefined,
    options: Array.isArray(q.options) ? q.options.map(String) : undefined,
  }));
}

export async function getIntakeQuestions(packageId: string): Promise<IntakeQuestion[]> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin.from('packages').select('form_schema').eq('id', packageId).eq('organization_id', orgId).maybeSingle();
  return normaliseQuestions(data?.form_schema);
}
export async function getIntakeQuestionsPublic(packageId: string): Promise<IntakeQuestion[]> {
  const { data } = await supabaseAdmin.from('packages').select('form_schema').eq('id', packageId).maybeSingle();
  return normaliseQuestions(data?.form_schema);
}

export async function updatePackageQuestions(input: { packageId: string; questions: IntakeQuestion[] }) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { data: pkg } = await supabaseAdmin.from('packages').select('form_schema').eq('id', input.packageId).eq('organization_id', orgId).maybeSingle();
  if (!pkg) throw new Error('Package not found');

  const before = normaliseQuestions(pkg.form_schema);
  const questions: IntakeQuestion[] = [];
  for (const q of input.questions || []) {
    const label = (q.label || '').trim();
    if (!label) continue;
    const def = fieldType(q.type);
    const options = def.needsOptions ? (q.options || []).map((o) => String(o).trim()).filter(Boolean) : undefined;
    if (def.needsOptions && (!options || options.length === 0)) throw new Error(`"${label}" needs at least one choice.`);
    questions.push({ id: q.id || crypto.randomUUID(), type: def.key, label, required: !!q.required, help: (q.help || '').trim() || undefined, options, serviceId: q.serviceId || undefined });
  }

  const { getAnsweredQuestionIdsForPackage } = await import('@/modules/bookings/interface');
  const answered = new Set(await getAnsweredQuestionIdsForPackage(input.packageId));
  for (const q of questions) {
    const was = before.find((b) => b.id === q.id);
    if (was && was.type !== q.type && answered.has(q.id)) {
      throw new Error(`"${was.label}" has already been answered by a client, so its type can't change. Add a new question instead.`);
    }
  }

  const { error } = await supabaseAdmin.from('packages').update({ form_schema: questions }).eq('id', input.packageId).eq('organization_id', orgId);
  if (error) { console.error('Failed to save questions:', error); throw new Error('Failed to save the questions'); }

  await logEvent({ organizationId: orgId, entityType: 'package', entityId: input.packageId, action: 'questions_updated', actorId: actorId ?? undefined, payload: { count: questions.length } });
  revalidatePath(`/packages/${input.packageId}`);
  return { ok: true };
}

export async function getLockedQuestionIds(packageId: string): Promise<string[]> {
  const { getAnsweredQuestionIdsForPackage } = await import('@/modules/bookings/interface');
  return getAnsweredQuestionIdsForPackage(packageId);
}

async function writePackageTasks(orgId: string, tasks: { id: string; isActive: boolean; roleId: string | null }[]) {
  if (tasks.length === 0) return;
  await Promise.all(
    tasks.map(t => 
      supabaseAdmin.from('package_tasks')
        .update({ is_active: t.isActive, role_id: t.roleId })
        .eq('id', t.id)
        .eq('organization_id', orgId)
    )
  );
}
