'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { assertAllOurs, assertOurs } from '@/kernel/tenancy';
import { priceOf } from '@/kernel/money';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudioCurrency } from '@/kernel/organizations';
import { logEvent } from '@/kernel/events';
import { revalidatePath } from 'next/cache';
import { fieldType, type IntakeQuestion } from '@/modules/services/fieldTypes';
// One definition of what a deliverable link looks like, shared by every reader.
import {
  SERVICE_OFFERS, PACKAGE_PROMISE, PACKAGE_PROMISE_COUNT, DELIVERABLE_REF,
} from '@/modules/deliverables/shape';
// A link to a deliverable is written by the module that defines one.
import {
  setPackageDeliverables, copyPackageDeliverables,
} from '@/modules/deliverables/domain';
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

/**
 * One task on a package, being written.
 *
 * `id` present patches a task the package already has. `id` absent with a name
 * adds one of the package's own, and then `serviceId` says which bundled
 * service it belongs to — a task is always work on some service within the
 * bundle, never on the bundle at large.
 *
 * `roleName` is offered alongside `roleId` so a task can name a role the studio
 * has not created yet, which is find-or-created like every other name here.
 */
/**
 * One variable, and what this package does with it.
 *
 * `studio` carries a value the package fixes. `client` carries none, because
 * the whole content of that decision is that the answer is not the studio's to
 * give. A variable this list does not mention at all is one nobody has decided
 * about, and it is asked of no one.
 */
export type PackageVariableWrite = {
  serviceVariableId: string;
  answeredBy?: 'studio' | 'client';
  value?: unknown;
};

export type PackageTaskWrite = {
  id?: string;
  serviceId?: string;
  name?: string;
  isActive: boolean;
  roleId?: string | null;
  roleName?: string | null;
};

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
  table: 'package_variable_values',
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
/**
 * What a package does with each variable its services declare.
 *
 * TWO CLASSES, AND SAYING WHICH. A package either fixes a value — two outfits,
 * four hours, and that is part of the offer — or it deliberately leaves the
 * answer to the client and the question is asked at booking. Both are
 * decisions. Only the first used to be recorded; "open to the client" was
 * inferred from the absence of a fixed value, so a deliberate question and a
 * variable nobody had got round to were indistinguishable.
 *
 * That absence had teeth. Because every unfixed variable was asked, declaring a
 * variable on a service instantly added a question to the public booking form
 * of every package built on it — a studio adding "outfits" while building its
 * Deluxe package changed what its Basic package asks strangers.
 *
 * So a row is written for either decision, and no row means no decision. An
 * undecided variable is asked of nobody: an unfinished package rather than a
 * question by default.
 */
async function writePackageVariableValues(
  orgId: string,
  rows: { id: string; service_id: string }[],
  values?: PackageVariableWrite[]
) {
  const wanted = (values || []).filter((v) => {
    if (!v.serviceVariableId) return false;
    // A studio answer needs a value; a client answer is the absence of one, on
    // purpose, and the check constraint on the table says the same thing.
    if (v.answeredBy === 'client') return true;
    return v.value !== undefined && v.value !== null && v.value !== '';
  });

  let links: Record<string, unknown>[] = [];
  if (wanted.length > 0) {
    // Asked of the Services module — never read from its tables directly.
    const { listVariablesForServices } = await import('@/modules/services/interface');
    const serviceOfVariable = new Map(
      (await listVariablesForServices(rows.map((r) => r.service_id))).map((v: any) => [v.id, v.serviceId])
    );

    links = wanted.flatMap((v) => {
      const serviceId = serviceOfVariable.get(v.serviceVariableId);
      /*
       * A variable with no service among these is a DIMENSION'S, not a stray.
       *
       * It is in play because of how the package is classified rather than what
       * it bundles, so it has no service to match and belongs to the package as
       * a whole — written against every bundle row, the same way a service's
       * variable is written against every row of that service.
       */
      const targets = serviceId
        ? rows.filter((r) => r.service_id === serviceId)
        : rows;
      if (targets.length === 0) throw new Error('That option belongs to a service this package does not include.');
      const asked = v.answeredBy === 'client';
      // Every bundle row of that service, so bundling it twice decides both.
      return targets.map((r) => ({
        organization_id: orgId,
        package_service_id: r.id,
        variable_id: v.serviceVariableId,
        value: asked ? null : v.value,
        answered_by: asked ? 'client' : 'studio',
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
  promises?: { serviceId: string; deliverableId: string; quantity?: number | null }[]
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
    });
  }
  /*
   * Packages decides WHAT it promises and how much of it — that is this layer's
   * job and it stays here. Writing the link is Deliverables', so it is asked.
   */
  await setPackageDeliverables({ packageServiceIds: rows.map((r) => r.id), links });
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
  /** Public URL of the cover image. Null clears it; undefined leaves it alone. */
  coverUrl?: string | null;
  /** Where the cover should be looking, as a CSS background-position. */
  coverPosition?: string | null;
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
  deliverables?: { serviceId: string; deliverableId: string; quantity?: number | null }[];
  /** The production sequences to run, each on the bundled service it belongs to. */
  /*
   * Never read and never written — no caller passes it and nothing consumes it.
   * Kept only because a package DOES have workflows; what it does not have is
   * this shape, which still named them blueprints. Whatever replaces it should
   * be built from what package_tasks actually needs.
   */
  workflows?: { serviceId: string; workflowId: string }[];
  /** What this package fixes — 2 outfits, 5 edited images. Keyed by service_variable id. */
  variableValues?: PackageVariableWrite[];
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
  tasks?: PackageTaskWrite[];
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
    assertAllOurs(orgId, 'variables',
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
      cover_url: input.coverUrl ?? null,
      cover_position: input.coverPosition ?? null,
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
    /*
     * After the workflow's own, so a task added while the package was being
     * built lands at the end rather than being overwritten by the copy.
     *
     * Only the added ones: an id here would name a package_task that cannot
     * exist yet, since the copy above is what creates the first ones.
     */
    const ownTasks = (input.tasks || []).filter((t) => !t.id && (t.name || '').trim());
    if (ownTasks.length > 0) await writePackageTasks(orgId, pkg.id, ownTasks);
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
  /** Public URL of the cover image. Null clears it; undefined leaves it alone. */
  coverUrl?: string | null;
  /** Where the cover should be looking, as a CSS background-position. */
  coverPosition?: string | null;
  serviceIds?: string[];
  /** What the package promises, each on the bundled service that produces it. */
  deliverables?: { serviceId: string; deliverableId: string; quantity?: number | null }[];
  /** What this package fixes. Omit to leave untouched; pass [] to clear. */
  variableValues?: PackageVariableWrite[];
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
  tasks?: PackageTaskWrite[];
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
    assertAllOurs(orgId, 'variables',
      (input.variableValues || []).map((v) => v.serviceVariableId), 'variables'),
  ]);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim() || existing.name;
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.durationMinutes !== undefined) patch.duration_minutes = input.durationMinutes;
  if (input.price !== undefined) patch.price = input.price || {};
  // Absent leaves the cover alone; null takes it off. The same distinction the
  // price makes, and for the same reason: a form that was not shown the cover
  // must not be able to erase it by saying nothing about it.
  if (input.coverUrl !== undefined) patch.cover_url = input.coverUrl;
  if (input.coverPosition !== undefined) patch.cover_position = input.coverPosition;
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
  if (input.tasks !== undefined) await writePackageTasks(orgId, input.packageId, input.tasks);

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

  const [narrowings, fixed] = await Promise.all([
    supabaseAdmin.from('package_service_dimension_values').select('package_service_id, dimension_value_id').eq('organization_id', orgId).in('package_service_id', originalIds),
    supabaseAdmin.from('package_variable_values').select('package_service_id, variable_id, value').eq('organization_id', orgId).in('package_service_id', originalIds),
  ]);

  /*
   * Old bundle row → new one, as a plain object. What the promises carry across
   * is Deliverables' to decide, which is how spec_values stops being dropped:
   * this used to list the columns by hand and name only two of the three.
   */
  const rowMap: Record<string, string> = {};
  for (const id of originalIds) {
    const to = rekey(id);
    if (to) rowMap[id] = to;
  }

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
    copyPackageDeliverables({ fromPackageServiceIds: originalIds, rowMap }),
    carry('package_service_dimension_values', narrowings.data, (r, to) => ({ organization_id: orgId, package_service_id: to, dimension_value_id: r.dimension_value_id })),
    carry('package_variable_values', fixed.data, (r, to) => ({ organization_id: orgId, package_service_id: to, variable_id: r.variable_id, value: r.value })),
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
  id, name, description, status, duration_minutes, extra_stages, price, instance_of, list_price, cover_url, cover_position, created_at,
  package_services(id, position, service:services(
    id, name, description, domain:service_domains(id, name),
    workflow:workflows(id, name),
    ${SERVICE_OFFERS},
    service_dimension_values(dimension_value:dimension_values(id, name, dimension:dimensions(id, name, position))),
    variables(id, service_id, key, label, unit, kind, options)
  ),
  package_service_dimension_values(dimension_value:dimension_values(id, name, dimension:dimensions(id, name, position))),
  ${PACKAGE_PROMISE},
  package_variable_values(value, answered_by, variable:variables(id, service_id, deliverable_id, key, label, unit, kind)),
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
      /*
       * WHAT THIS PACKAGE PROMISES, AND WHAT IT SETTLED ABOUT IT.
       *
       * The spec used to be a jsonb blob on the promise row. A deliverable
       * declares real variables now, and a package answers them like any
       * other — so the spec is assembled here from those answers rather than
       * read from a column that only this corner of the app understood.
       */
      deliverables: (ps.package_deliverables || [])
        .filter((pd: any) => pd.deliverable)
        .map((pd: any) => ({
          ...pd.deliverable,
          quantity: pd.quantity,
          spec_values: Object.fromEntries(
            ((ps.package_variable_values || []) as any[])
              .filter((pv) => pv.variable?.deliverable_id === pd.deliverable.id)
              .filter((pv) => pv.value !== null && pv.value !== '')
              .map((pv) => [pv.variable.key, pv.value]),
          ),
        })),
      dimensions: shapeDimensionLinks(ps.service?.service_dimension_values),
      narrowedTo: shapeDimensionLinks(ps.package_service_dimension_values),
      variables: (ps.service?.variables || []).map((v: any) => ({
        id: v.id, serviceId: v.service_id, key: v.key, label: v.label, unit: v.unit, kind: v.kind, options: v.options
      })),
      variableValues: (ps.package_variable_values || [])
        .filter((pv: any) => pv.variable)
        .map((pv: any) => ({
          serviceVariableId: pv.variable.id, serviceId: pv.variable.service_id,
          // Which deliverable this answer settles, when it settles one. A
          // variable owned by a deliverable is how "20x30" is recorded now.
          deliverableId: pv.variable.deliverable_id ?? null,
          key: pv.variable.key, label: pv.variable.label,
          unit: pv.variable.unit ?? null, kind: pv.variable.kind, value: pv.value,
          answeredBy: (pv.answered_by ?? 'studio') as 'studio' | 'client',
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
          // Which deliverable this answer settles, when it settles one. A
          // variable owned by a deliverable is how "20x30" is recorded now.
          deliverableId: pv.variable.deliverable_id ?? null,
          key: pv.variable.key, label: pv.variable.label,
          unit: pv.variable.unit ?? null, kind: pv.variable.kind, value: pv.value,
          answeredBy: (pv.answered_by ?? 'studio') as 'studio' | 'client',
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
      ), ${PACKAGE_PROMISE_COUNT}, package_service_dimension_values(dimension_value:dimension_values(
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
      cover_url: (p.cover_url ?? null) as string | null,
      cover_position: (p.cover_position ?? null) as string | null,
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
      id, name, description, pricing_variant, duration_minutes, form_schema, cover_url, cover_position,
      package_services(
        service:services(name),
        ${PACKAGE_PROMISE}
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
    coverUrl: (p.cover_url ?? null) as string | null,
    coverPosition: (p.cover_position ?? null) as string | null,
    formSchema: (p.form_schema || []) as any[],
    serviceNames: ((p.package_services || []) as any[]).map((ps) => ps.service?.name).filter(Boolean) as string[],
    // Specified, so the storefront says "6 edited photographs" rather than
    // leaving a client to guess how many. Flattened across the bundle: a client
    // reading a storefront wants the whole promise, not it sorted by producer.
    deliverableNames: ((p.package_services || []) as any[])
      .flatMap((ps) => (ps.package_deliverables || []) as any[])
      .filter((pd) => pd.deliverable?.name)
      .map((pd) => formatDeliverable({
        name: pd.deliverable.name,
        quantity: pd.quantity,
        unit: pd.deliverable.default_unit,
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
/**
 * What this package asks the client, and nothing else.
 *
 * This used to be "everything not fixed", which quietly meant every variable
 * the studio had not yet thought about. Now it is what the studio deliberately
 * left to the client.
 */
/**
 * The classifications this package has not settled, as questions.
 *
 * THE STRUCTURE THIS BELONGS TO, rather than a feature about occasions.
 *
 * Everything in this app is a range that gets narrower as it travels. A service
 * declares that outfits vary; a package says two; a booking carries two. A
 * domain declares that Occasion has five answers; a package narrows to three; a
 * booking is for exactly one. A workflow declares its tasks; a package switches
 * some off; a booking instantiates what is left. The same movement every time:
 * possibility, restriction, fact.
 *
 * Seen that way, a classification IS a variable — a choice one, whose options
 * are the dimension's values — and narrowing IS answering, partially. Which is
 * why this needs no new mechanism and no new column:
 *
 *   one value in play    the studio has answered it. Nothing to ask.
 *   several in play      still a question, with a shorter list of answers.
 *   none in play         the dimension does not apply here at all.
 *
 * The rule is DERIVED rather than stored, unlike who answers a variable. It has
 * to be: a studio narrowing Occasion to Birthday is not making a separate
 * decision about who answers, it is answering. Storing a second flag beside it
 * would let the two disagree.
 *
 * The last step was missing. A package offering Birthday, Anniversary and
 * Convocation asked nobody which one a booking was for, so every booking of it
 * carried all three — and a booking is not for three occasions.
 */
export async function getOpenClassificationsForPackagePublic(orgId: string, packageId: string) {
  const { data: rows, error } = await supabaseAdmin
    .from('package_services')
    .select(`
      service:services(id, service_dimension_values(dimension_value:dimension_values(id, name, position, dimension_id))),
      package_service_dimension_values(dimension_value:dimension_values(id, name, position, dimension_id))
    `)
    .eq('package_id', packageId)
    .eq('organization_id', orgId)
    .order('position');
  if (error) throw new Error(`Could not read what this package is classified as: ${error.message}`);

  // Values in play: what the package narrowed to where it narrowed, and what
  // the service says where it did not. The same rule every operator screen
  // uses, because a client must never be asked about a classification the
  // package does not carry.
  const byDimension = new Map<string, Map<string, { id: string; name: string; position: number }>>();
  for (const row of ((rows || []) as any[])) {
    const narrowed = ((row.package_service_dimension_values || []) as any[])
      .map((l) => l.dimension_value).filter(Boolean);
    const inherited = ((row.service?.service_dimension_values || []) as any[])
      .map((l) => l.dimension_value).filter(Boolean);
    for (const v of (narrowed.length > 0 ? narrowed : inherited)) {
      if (!v.dimension_id) continue;
      if (!byDimension.has(v.dimension_id)) byDimension.set(v.dimension_id, new Map());
      byDimension.get(v.dimension_id)!.set(v.id, { id: v.id, name: v.name, position: v.position ?? 0 });
    }
  }

  const open = [...byDimension.entries()].filter(([, values]) => values.size > 1);
  if (open.length === 0) return [];

  const { data: dims } = await supabaseAdmin
    .from('dimensions')
    .select('id, name, question, position')
    .eq('organization_id', orgId)
    .in('id', open.map(([id]) => id));
  const named = new Map(((dims || []) as any[]).map((d) => [d.id, d]));

  return open
    .map(([dimensionId, values]) => {
      const d = named.get(dimensionId);
      return {
        dimensionId,
        name: (d?.name ?? 'Which one?') as string,
        // The dimension's own wording where it has one. A studio that wrote
        // "What occasion is it for?" has already phrased this better than any
        // label generated from a name.
        question: (d?.question ?? null) as string | null,
        position: (d?.position ?? 0) as number,
        values: [...values.values()].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
      };
    })
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/**
 * The client answered which one, so the booking's own package says so.
 *
 * NO NEW TABLE, because a booking already gets its own instance of the package
 * precisely so it can differ from the catalogue. Narrowing that instance to the
 * chosen value is the same act the studio performs when it narrows a catalogue
 * package — one step further down the same chain, by a different hand.
 *
 * Only the dimensions answered are touched. A classification the client was not
 * asked about is one the package had already settled, and rewriting it here
 * would be this function inventing an answer nobody gave.
 */
export async function answerPackageClassifications(input: {
  packageId: string;
  /*
   * Passed only when there is no session to take it from.
   *
   * A visitor to the storefront has none, so the public path names the studio
   * explicitly. An operator taking the same booking over the telephone does
   * have one, and requiring the org there would mean either shipping it to the
   * browser or standing up a second function that differs by one line. Same
   * rule the readers beside this already follow.
   */
  organizationId?: string;
  valueIds: string[];
}) {
  const orgId = input.organizationId ?? (await getAuthOrgId()).orgId;
  /*
   * IT USED TO SAY OK WHEN IT HAD DONE NOTHING.
   *
   * Three early returns, all shaped `return { ok: true }`, and only the first
   * of them was honest. Nobody asking for anything is a success. Being asked to
   * record a classification and having nowhere to put it is not, and saying so
   * anyway is how a booking came to be saved, reported saved, and not be for a
   * wedding.
   *
   * The form has a whole channel for this — classificationProblems, gathered
   * and raised once the booking has landed — and it was fed by a catch. Nothing
   * threw. The operator picked Wedding, was told "The booking is saved", and
   * the classification existed nowhere.
   *
   * Throwing is not the fix either: the storefront calls this before it creates
   * the booking and does not catch, so a client choosing an occasion for a
   * package that bundles nothing would lose the entire booking over an
   * annotation. Losing a classification is bad; losing the job is worse.
   *
   * So it answers truthfully and each caller decides. `recorded` is how many
   * narrowings were actually written, and `reason` says what stopped it.
   */
  if (input.valueIds.length === 0) return { ok: true, recorded: 0 };

  const { data: chosen } = await supabaseAdmin
    .from('dimension_values')
    .select('id, dimension_id')
    .eq('organization_id', orgId)
    .in('id', input.valueIds);
  const answered = (chosen || []) as any[];
  // Asked for values this studio does not have. Never expected, so it is worth
  // hearing about rather than absorbing.
  if (answered.length === 0) {
    return { ok: false, recorded: 0, reason: 'those classification values are not this studio’s' };
  }
  const answeredDimensions = new Set(answered.map((v) => v.dimension_id));

  /*
   * A classification narrows a SERVICE, and what a package owns is its join to
   * the services it bundles — so a package bundling nothing has no row to carry
   * one. Reachable two ways: a package built from nothing on the booking
   * itself, and a catalogue package a studio never got round to filling in.
   */
  const rows = await bundleRows(orgId, input.packageId);
  if (rows.length === 0) {
    return { ok: false, recorded: 0, reason: 'it does not bundle any services yet' };
  }

  // What the instance currently carries, so the untouched dimensions survive.
  const { data: existing } = await supabaseAdmin
    .from('package_service_dimension_values')
    .select('package_service_id, dimension_value:dimension_values(id, dimension_id)')
    .eq('organization_id', orgId)
    .in('package_service_id', rows.map((r) => r.id));

  const keep = ((existing || []) as any[])
    .filter((l) => l.dimension_value && !answeredDimensions.has(l.dimension_value.dimension_id))
    .map((l) => ({
      organization_id: orgId,
      package_service_id: l.package_service_id,
      dimension_value_id: l.dimension_value.id,
    }));

  const settled = rows.flatMap((r) => answered.map((v) => ({
    organization_id: orgId,
    package_service_id: r.id,
    dimension_value_id: v.id,
  })));

  await supabaseAdmin
    .from('package_service_dimension_values').delete()
    .eq('organization_id', orgId)
    .in('package_service_id', rows.map((r) => r.id));

  const { error } = await supabaseAdmin
    .from('package_service_dimension_values')
    .insert([...keep, ...settled]);
  if (error) {
    console.error('Failed to record which classification was chosen:', error);
    throw new Error('Could not record what this booking is for');
  }
  return { ok: true, recorded: settled.length };
}

export async function getOpenVariablesForPackagePublic(orgId: string, packageId: string) {
  const all = await getPackageVariablesPublic(orgId, packageId);
  return all.filter((v) => v.asked);
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
      service:services(
        id, name,
        variables(id, key, label, kind, unit, options, default_value, min_value, max_value, position),
        service_dimension_values(dimension_value:dimension_values(id, dimension_id))
      ),
      package_service_dimension_values(dimension_value:dimension_values(id, dimension_id)),
      package_variable_values(variable_id, answered_by)
    `)
    .eq('package_id', packageId)
    .eq('organization_id', orgId)
    .order('position');
  if (rowsError) throw new Error(`Could not read the package's services: ${rowsError.message}`);

  /*
   * WHAT THE CLASSIFICATIONS BRING WITH THEM.
   *
   * An Occasion has a date, declared once on the dimension. A package
   * classified Birthday therefore carries that date, without anybody having
   * added it to the service — which is the point: one declaration, inherited by
   * every package classified that way, instead of an "occasion date" invented
   * in each and connected to Occasion in none.
   *
   * Read from the values actually in play: the package's own narrowing where it
   * made one, and the service's classification where it did not. That is the
   * same rule the operator's screens use for deciding what a package is
   * classified as, and it has to be, or a client would be asked about a
   * classification the package does not carry.
   */
  const dimensionIds = new Set<string>();
  for (const row of ((rows || []) as any[])) {
    const narrowed = ((row.package_service_dimension_values || []) as any[])
      .map((l) => l.dimension_value).filter(Boolean);
    const inherited = ((row.service?.service_dimension_values || []) as any[])
      .map((l) => l.dimension_value).filter(Boolean);
    for (const v of (narrowed.length > 0 ? narrowed : inherited)) {
      if (v.dimension_id) dimensionIds.add(v.dimension_id);
    }
  }

  const dimensionVariables = dimensionIds.size === 0 ? [] : (await supabaseAdmin
    .from('variables')
    .select('id, key, label, kind, unit, options, default_value, min_value, max_value, position, dimension_id, dimension:dimensions(id, name)')
    .eq('organization_id', orgId)
    .in('dimension_id', [...dimensionIds])
    .order('position')).data || [];

  /*
   * WHO DECIDED, ACROSS THE WHOLE BUNDLE.
   *
   * A variable belonging to a CLASSIFICATION is not any one service's, but the
   * row recording who answers it still hangs off a package_services row,
   * because a package cannot tag itself — see the note on bundleRows. Which row
   * it landed on is an accident of how the package was built.
   *
   * Read per-service, the first row iterated won and a decision recorded on any
   * other was invisible: a studio saying "the client answers the location
   * address" could find it silently unasked.
   */
  const decidedAnywhere = new Map<string, string>();
  for (const row of ((rows || []) as any[])) {
    for (const f of ((row.package_variable_values || []) as any[])) {
      if (f.answered_by) decidedAnywhere.set(f.variable_id, f.answered_by as string);
    }
  }

  const all: any[] = [];
  for (const row of ((rows || []) as any[])) {
    const service = row.service;
    if (!service) continue;
    const decided = new Map(
      ((row.package_variable_values || []) as any[]).map((f) => [f.variable_id, f.answered_by as string]),
    );
    for (const v of (service.variables || [])) {
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
        fixed: decided.get(v.id) === 'studio',
        // Asked only where the package said so. A variable nobody has decided
        // about is not a question — that inference is what let a new variable
        // appear on every live booking form the moment it was declared.
        asked: decided.get(v.id) === 'client',
      });
    }

  }

  /*
   * THE CLASSIFICATION'S OWN, ATTRIBUTED TO THE CLASSIFICATION.
   *
   * These were pushed inside the per-service loop above and stamped with
   * whichever service the loop happened to be on — first one wins, by way of a
   * skip-if-seen guard. So a package bundling Event Photography and Event
   * Videography told the operator that "Location Address" came from Event
   * Photography, when it comes from Context: it is asked because of how the
   * work is CLASSIFIED, not because of which service performs it. That is the
   * whole point of a variable belonging to a dimension, and the label said the
   * opposite of it.
   *
   * Out of the loop entirely now, since they were never a service's, and
   * carrying the dimension that does own them.
   */
  for (const v of (dimensionVariables as any[])) {
    if (all.some((x) => x.id === v.id)) continue;
    all.push({
      id: v.id,
      serviceId: null,
      serviceName: null,
      dimensionId: v.dimension_id ?? v.dimension?.id ?? null,
      dimensionName: v.dimension?.name ?? null,
      key: v.key,
      label: v.label,
      kind: v.kind,
      unit: v.unit ?? null,
      options: Array.isArray(v.options) ? v.options : [],
      defaultValue: v.default_value ?? null,
      min: v.min_value ?? null,
      max: v.max_value ?? null,
      position: 1000 + (v.position ?? 0),
      fixed: decidedAnywhere.get(v.id) === 'studio',
      asked: decidedAnywhere.get(v.id) === 'client',
    });
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
 * The same question, asked with a session instead of an org id.
 *
 * A visitor to the storefront has no session, so the reader takes the org
 * explicitly; an operator has one. Same query, same shape — the only
 * difference is how the studio is established, which is exactly what
 * getOpenVariablesForPackage above already does for the other half.
 */
export async function getOpenClassificationsForPackage(packageId: string) {
  const { orgId } = await getAuthOrgId();
  return getOpenClassificationsForPackagePublic(orgId, packageId);
}

/**
 * EVERYTHING A PACKAGE LEAVES OPEN, IN ONE ANSWER.
 *
 * What the client is asked on the storefront, asked of whoever is taking the
 * booking. A studio that takes a booking over the telephone was asked none of
 * it: the operator's form copied the package's FIXED values through and never
 * saw the questions, so the two classes of variable — what the studio settles,
 * what the client answers — worked on exactly one of the two ways into this
 * system, and a phoned-in booking arrived with every deliberately deferred
 * question still unanswered and nowhere to answer it.
 *
 * One call rather than two because the operator's form asks when a package is
 * picked, mid-typing, and two round trips to draw one block is one more chance
 * for the block to appear half-built.
 */
export async function getOpenQuestionsForPackage(packageId: string) {
  const { orgId } = await getAuthOrgId();
  const [variables, classifications] = await Promise.all([
    getOpenVariablesForPackagePublic(orgId, packageId),
    getOpenClassificationsForPackagePublic(orgId, packageId),
  ]);
  return { variables, classifications };
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
    .select(`package_deliverables(${DELIVERABLE_REF})`)
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

/**
 * What work this package involves.
 *
 * A package's tasks are copied from its services' workflows the moment a
 * service is bundled, and were only ever patchable after that — so the list a
 * package could involve was fixed at exactly what the workflow said, and a
 * Deluxe that includes an album had nowhere to put assembling one.
 *
 * A ROW WITH NO id IS A TASK THIS PACKAGE ADDED, and it is stored with
 * workflow_task_id null. That null is the whole distinction: a task copied from
 * a workflow is answerable to it and gets rewritten when the workflow changes
 * (see syncPackageTasksForWorkflow), while a task the package added belongs to
 * the package and to nothing else.
 *
 * IT DOES NOT FLOW BACK TO THE WORKFLOW. A workflow is how the service is
 * produced generally; every other package of that service would inherit the
 * album step, which is the opposite of what adding it to one package meant.
 * Forward is a different matter — bookings instantiate a package's tasks, so
 * this reaches the work board on its own.
 */
async function writePackageTasks(
  orgId: string,
  packageId: string,
  tasks: PackageTaskWrite[],
) {
  if (tasks.length === 0) return;

  // A role named rather than chosen, so the list of roles is open the same way
  // every other list here is.
  const { findOrCreateRole } = await import('@/modules/team/interface');
  const roleFor = async (t: PackageTaskWrite): Promise<string | null> => {
    if (t.roleName !== undefined) {
      const named = (t.roleName || '').trim();
      return named ? await findOrCreateRole(named) : null;
    }
    return t.roleId ?? null;
  };

  for (const t of tasks.filter((x) => x.id)) {
    const { error } = await supabaseAdmin.from('package_tasks')
      .update({ is_active: t.isActive, role_id: await roleFor(t) })
      .eq('id', t.id as string)
      .eq('organization_id', orgId);
    if (error) { console.error('Failed to update a package task:', error); throw new Error('Failed to save the tasks'); }
  }

  const added = tasks.filter((t) => !t.id && (t.name || '').trim());
  if (added.length === 0) return;

  const rows = await bundleRows(orgId, packageId);
  const { data: standing } = await supabaseAdmin
    .from('package_tasks').select('package_service_id, position')
    .eq('organization_id', orgId)
    .in('package_service_id', rows.map((r) => r.id));

  // Onto the end of whatever that bundled service already involves, so an added
  // task reads after the workflow's own rather than among them.
  const last = new Map<string, number>();
  for (const r of (standing || []) as any[]) {
    last.set(r.package_service_id, Math.max(last.get(r.package_service_id) ?? -1, r.position ?? 0));
  }

  const toInsert: Record<string, unknown>[] = [];
  for (const t of added) {
    const link = rows.find((r) => r.service_id === t.serviceId);
    // A task aimed at a service this package does not bundle is rejected rather
    // than dropped, for the same reason a stray variable value is.
    if (!link) throw new Error('A task was added for a service this package does not bundle.');
    const position = (last.get(link.id) ?? -1) + 1;
    last.set(link.id, position);
    toInsert.push({
      organization_id: orgId,
      package_service_id: link.id,
      workflow_task_id: null,
      name: (t.name as string).trim(),
      role_id: await roleFor(t),
      position,
      is_active: t.isActive ?? true,
    });
  }

  const { error } = await supabaseAdmin.from('package_tasks').insert(toInsert);
  if (error) { console.error('Failed to add package tasks:', error); throw new Error('Failed to save the tasks'); }
}
