'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { assertAllOurs } from '@/kernel/tenancy';
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

export type PaymentPolicy = 'deposit' | 'full';
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
  table: 'package_variable_values' | 'package_deliverables' | 'package_workflows',
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
  promises?: { serviceId: string; deliverableId: string; quantity?: number | null; unit?: string | null; spec?: string | null }[]
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
      unit: p.unit ?? null,
      spec: p.spec ?? null,
    });
  }
  await replaceBundleLinks(orgId, 'package_deliverables', rows, links, 'Failed to save what this package promises');
}

/**
 * Write how a package is produced, per bundled service.
 *
 * `getProductionPlanForPackage` already claimed to be "the union of every
 * bundled Service's Process" — it could not be, because a workflow was attached
 * to the package and knew no service. Now it is.
 */
async function writePackageWorkflows(
  orgId: string,
  rows: { id: string; service_id: string }[],
  workflows?: { serviceId: string; blueprintId: string }[]
) {
  const rowIdOf = new Map(rows.map((r) => [r.service_id, r.id]));
  const seen = new Set<string>();
  const links: Record<string, unknown>[] = [];
  for (const w of (workflows || [])) {
    if (!w?.serviceId || !w?.blueprintId) continue;
    const packageServiceId = rowIdOf.get(w.serviceId);
    if (!packageServiceId) throw new Error('That workflow is on a service this package does not include.');
    const key = `${packageServiceId}:${w.blueprintId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ organization_id: orgId, package_service_id: packageServiceId, blueprint_id: w.blueprintId });
  }
  await replaceBundleLinks(orgId, 'package_workflows', rows, links, 'Failed to save how this package is produced');
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
  serviceIds?: string[];
  /**
   * What the package actually includes, quantified — "Edited photographs × 6",
   * "Highlight video, 30 second", "Framed print, 20x30". A service says what
   * kind of thing it produces; this is where it gets specific, which is what a
   * package is for. Each promise names the bundled service that produces it.
   */
  deliverables?: { serviceId: string; deliverableId: string; quantity?: number | null; unit?: string | null; spec?: string | null }[];
  containerIds?: string[];
  /** The production sequences to run, each on the bundled service it belongs to. */
  workflows?: { serviceId: string; blueprintId: string }[];
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

  const currency = await getStudioCurrency();
  
  // Everything a package points at comes from the form, so each set is checked
  // against this studio before any of it is linked. The relink is destructive
  // (delete then insert), which is exactly why it happens after the check.
  await Promise.all([
    assertAllOurs(orgId, 'services', input.serviceIds, 'services'),
    assertAllOurs(orgId, 'deliverables', (input.deliverables || []).map((d) => d.deliverableId), 'outputs'),
    assertAllOurs(orgId, 'delivery_containers', input.containerIds, 'delivery containers'),
    assertAllOurs(orgId, 'blueprints', (input.workflows || []).map((w) => w.blueprintId), 'workflows'),
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
      extra_stages: await buildExtraStages(input.extraStages || []),
      form_schema: input.formSchema || [],
      status: 'active',
    })
    .select('id')
    .single();
  if (error || !pkg) { console.error('Failed to create package:', error); throw new Error('Failed to create package'); }

  if (serviceIds.length > 0) {
    // The bundle is the package's spine — everything below hangs off it, so a
    // lost insert here leaves a package that names services it does not have.
    const { error: bundleError } = await supabaseAdmin.from('package_services').insert(serviceIds.map((service_id, i) => ({ organization_id: orgId, package_id: pkg.id, service_id, position: i })));
    if (bundleError) { console.error('Failed to bundle services into package:', bundleError); throw new Error('Failed to add the services to the package'); }

    if (input.containerIds && input.containerIds.length > 0) {
      await supabaseAdmin.from('package_delivery_containers').insert(input.containerIds.map((container_id) => ({ organization_id: orgId, package_id: pkg.id, container_id })));
    }

    // Everything below hangs off the bundle rows just written, so they are read
    // back rather than reconstructed from the input.
    const rows = await bundleRows(orgId, pkg.id);
    await writePackageDeliverables(orgId, rows, input.deliverables);
    await writePackageVariableValues(orgId, rows, input.variableValues);
    await writePackageWorkflows(orgId, rows, input.workflows);
    await writePackageNarrowings(orgId, pkg.id, input.narrowings);
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
  serviceIds?: string[];
  /** What the package promises, each on the bundled service that produces it. */
  deliverables?: { serviceId: string; deliverableId: string; quantity?: number | null; unit?: string | null; spec?: string | null }[];
  containerIds?: string[];
  /** The production sequences to run, each on the bundled service it belongs to. */
  workflows?: { serviceId: string; blueprintId: string }[];
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
    assertAllOurs(orgId, 'delivery_containers', input.containerIds, 'delivery containers'),
    assertAllOurs(orgId, 'blueprints', (input.workflows || []).map((w) => w.blueprintId), 'workflows'),
    assertAllOurs(orgId, 'dimension_values', (input.narrowings || []).map((n) => n.valueId), 'classifications'),
    assertAllOurs(orgId, 'service_variables',
      (input.variableValues || []).map((v) => v.serviceVariableId), 'variables'),
  ]);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim() || existing.name;
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.durationMinutes !== undefined) patch.duration_minutes = input.durationMinutes;
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
      const { error: bundleError } = await supabaseAdmin.from('package_services').insert(
        added.map((service_id) => ({
          organization_id: orgId, package_id: input.packageId, service_id,
          position: serviceIds.indexOf(service_id),
        }))
      );
      if (bundleError) { console.error('Failed to bundle services into package:', bundleError); throw new Error('Failed to add the services to the package'); }
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

  if (input.containerIds !== undefined) {
    const cIds = [...new Set(input.containerIds)];
    await supabaseAdmin.from('package_delivery_containers').delete().eq('package_id', input.packageId).eq('organization_id', orgId);
    if (cIds.length > 0) {
      await supabaseAdmin.from('package_delivery_containers').insert(cIds.map((container_id) => ({ organization_id: orgId, package_id: input.packageId, container_id })));
    }
  }

  // Everything below hangs off the bundle, which the block above may have just
  // changed — so it is read once, here, rather than taken from the input. A
  // service dropped up there took its promises with it by cascade.
  const rows = await bundleRows(orgId, input.packageId);
  if (input.deliverables !== undefined) await writePackageDeliverables(orgId, rows, input.deliverables);
  if (input.workflows !== undefined) await writePackageWorkflows(orgId, rows, input.workflows);
  if (input.narrowings !== undefined) await writePackageNarrowings(orgId, input.packageId, input.narrowings);
  if (input.variableValues !== undefined) await writePackageVariableValues(orgId, rows, input.variableValues);

  await logEvent({ organizationId: orgId, entityType: 'package', entityId: input.packageId, action: 'updated', actorId: actorId ?? undefined, payload: patch });
  revalidatePath('/packages');
  revalidatePath(`/packages/${input.packageId}`);
  return { ok: true };
}

/** Fork an existing Package — same bundle, same terms, a new id and name to edit from. */
export async function duplicatePackage(packageId: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { data: existing } = await supabaseAdmin
    .from('packages')
    .select('name, description, duration_minutes, extra_stages, form_schema')
    .eq('id', packageId).eq('organization_id', orgId).maybeSingle();
  if (!existing) throw new Error('Package not found');

  const { data: copy, error } = await supabaseAdmin
    .from('packages')
    .insert({ organization_id: orgId, name: `${existing.name} (Copy)`, description: existing.description, duration_minutes: existing.duration_minutes, extra_stages: existing.extra_stages, form_schema: existing.form_schema, status: 'active' })
    .select('id').single();
  if (error || !copy) { console.error('Failed to duplicate package:', error); throw new Error('Failed to duplicate the package'); }

  const { data: containers } = await supabaseAdmin.from('package_delivery_containers').select('container_id').eq('package_id', packageId).eq('organization_id', orgId);
  if (containers && containers.length > 0) await supabaseAdmin.from('package_delivery_containers').insert(containers.map((d: any) => ({ organization_id: orgId, package_id: copy.id, container_id: d.container_id })));

  // Everything else hangs off a bundle row, so the copy's rows are matched back
  // to the originals by service and every link is rewritten through that map.
  // Nothing here can be copied by carrying an id across.
  const original = await bundleRows(orgId, packageId);
  if (original.length === 0) {
    await logEvent({ organizationId: orgId, entityType: 'package', entityId: copy.id, action: 'duplicated', actorId: actorId ?? undefined, payload: { fromPackageId: packageId } });
    revalidatePath('/packages');
    return { packageId: copy.id };
  }

  const { data: inserted, error: bundleError } = await supabaseAdmin.from('package_services')
    .insert(original.map((s) => ({ organization_id: orgId, package_id: copy.id, service_id: s.service_id, position: s.position })))
    .select('id, service_id');
  if (bundleError) { console.error('Failed to copy the bundle:', bundleError); throw new Error('Failed to duplicate the package'); }

  const copyRowOf = new Map(((inserted || []) as any[]).map((s) => [s.service_id as string, s.id as string]));
  const serviceOfOriginal = new Map(original.map((s) => [s.id, s.service_id]));
  const originalIds = original.map((s) => s.id);
  const rekey = (packageServiceId: string) => copyRowOf.get(serviceOfOriginal.get(packageServiceId) as string);

  const [outputs, workflows, narrowings, fixed] = await Promise.all([
    supabaseAdmin.from('package_deliverables').select('package_service_id, deliverable_id, quantity, unit, spec').eq('organization_id', orgId).in('package_service_id', originalIds),
    supabaseAdmin.from('package_workflows').select('package_service_id, blueprint_id').eq('organization_id', orgId).in('package_service_id', originalIds),
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
    if (error) { console.error(`Failed to copy ${table}:`, error); throw new Error('Failed to duplicate the package'); }
  };

  await Promise.all([
    carry('package_deliverables', outputs.data, (r, to) => ({ organization_id: orgId, package_service_id: to, deliverable_id: r.deliverable_id, quantity: r.quantity, unit: r.unit, spec: r.spec })),
    carry('package_workflows', workflows.data, (r, to) => ({ organization_id: orgId, package_service_id: to, blueprint_id: r.blueprint_id })),
    carry('package_service_dimension_values', narrowings.data, (r, to) => ({ organization_id: orgId, package_service_id: to, dimension_value_id: r.dimension_value_id })),
    carry('package_variable_values', fixed.data, (r, to) => ({ organization_id: orgId, package_service_id: to, service_variable_id: r.service_variable_id, value: r.value })),
  ]);

  await logEvent({ organizationId: orgId, entityType: 'package', entityId: copy.id, action: 'duplicated', actorId: actorId ?? undefined, payload: { fromPackageId: packageId } });
  revalidatePath('/packages');
  return { packageId: copy.id };
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
    .select('package:packages(id, name, status, pricing)')
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

export async function setPackageStatus(input: { packageId: string; status: 'active' | 'retired' }) {
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
  id, name, description, status, duration_minutes, extra_stages,
  package_delivery_containers(container:delivery_containers(id, name)),
  package_services(id, position, service:services(
    id, name, description, domain:service_domains(id, name),
    service_deliverables(deliverable:deliverables(id, name)),
    service_dimension_values(dimension_value:dimension_values(id, name, dimension:dimensions(id, name, position)))
  ),
  package_service_dimension_values(dimension_value:dimension_values(id, name, dimension:dimensions(id, name, position))),
  package_deliverables(quantity, unit, spec, deliverable:deliverables(id, name)),
  package_workflows(blueprint:blueprints(id, name, stages)),
  package_variable_values(value, variable:service_variables(id, service_id, key, label, unit, kind)))
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
      .map((pd: any) => ({ ...pd.deliverable, quantity: pd.quantity, unit: pd.unit, spec: pd.spec, serviceId: ps.service?.id }))
  );
  return {
    ...p,
    services: bundle.map((ps) => ({
      ...ps.service,
      packageServiceId: ps.id,
      // What the service offers, and what this package sells of it.
      offers: (ps.service?.service_deliverables || []).map((sd: any) => sd.deliverable).filter(Boolean),
      deliverables: (ps.package_deliverables || [])
        .filter((pd: any) => pd.deliverable)
        .map((pd: any) => ({ ...pd.deliverable, quantity: pd.quantity, unit: pd.unit, spec: pd.spec })),
      workflows: (ps.package_workflows || []).map((pw: any) => pw.blueprint).filter(Boolean),
      dimensions: shapeDimensionLinks(ps.service?.service_dimension_values),
      narrowedTo: shapeDimensionLinks(ps.package_service_dimension_values),
      variableValues: (ps.package_variable_values || [])
        .filter((pv: any) => pv.variable)
        .map((pv: any) => ({
          serviceVariableId: pv.variable.id, serviceId: pv.variable.service_id,
          key: pv.variable.key, label: pv.variable.label,
          unit: pv.variable.unit ?? null, kind: pv.variable.kind, value: pv.value,
        })),
    })).filter((s: any) => s.id),
    deliverables: promised,
    workflows: bundle.flatMap((ps) => (ps.package_workflows || []).map((pw: any) => pw.blueprint).filter(Boolean)),
    containers: (p.package_delivery_containers || []).map((pd: any) => pd.container).filter(Boolean),
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
      package_services(service:services(name), package_deliverables(quantity, unit, spec, deliverable:deliverables(name)))
    `)
    .eq('id', packageId)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .maybeSingle();
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
      .map((pd) => formatDeliverable({ name: pd.deliverable.name, quantity: pd.quantity, unit: pd.unit, spec: pd.spec })),
  };
}

export async function getPackage(packageId: string) {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin.from('packages').select(PACKAGE_SELECT)
    .eq('id', packageId).eq('organization_id', orgId).maybeSingle();
  if (error) { console.error('Failed to get package:', error); throw new Error('Failed to load the package'); }
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
  const { data } = await supabaseAdmin.from('packages').select('id, name, duration_minutes, payment_policy').eq('id', packageId).eq('organization_id', orgId).maybeSingle();
  return data;
}

/**
 * A Package's full routing: the union of every bundled Service's Process,
 * in bundle order, plus this Package's own extra stages appended after. The
 * multi-role nature of a bundled offering falls out of which Services it
 * bundles — nobody hand-authors a combined blueprint per combination.
 */
export async function getProductionPlanForPackage(
  packageId: string
): Promise<{ stages: { name: string; order: number; roleId: string | null; frontStage: boolean | null }[] }> {
  const { orgId } = await getAuthOrgId();

  const { data: pkg } = await supabaseAdmin
    .from('packages')
    .select('extra_stages, package_services(position, package_workflows(blueprint:blueprints(stages)))')
    .eq('id', packageId).eq('organization_id', orgId).maybeSingle();

  const stages: { name: string; order: number; roleId: string | null; frontStage: boolean | null }[] = [];

  // In bundle order, which is now a real order: a workflow belongs to one
  // bundled service, so "the union of every bundled Service's Process" is
  // something this can actually read rather than only claim.
  const workflows = (((pkg?.package_services as any[]) || [])
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
    .flatMap((ps) => (ps.package_workflows || []).map((pw: any) => pw.blueprint).filter(Boolean));
  for (const bp of workflows) {
    const bpStages = (bp.stages || []).map((s: any, i: number) => ({ name: s.name, order: s.order ?? i, roleId: s.role_id ?? null, frontStage: s.front_stage ?? null }));
    // Each blueprint retains its independent sequence. They do not wait for the previous blueprint to finish.
    for (const s of bpStages) stages.push({ name: s.name, order: s.order, roleId: s.roleId, frontStage: s.frontStage });
  }

  // Extra stages on the package itself happen after the core work
  const maxOrderSoFar = stages.reduce((max, s) => Math.max(max, s.order), -1);
  for (const s of (pkg?.extra_stages as any[]) || []) {
    stages.push({ name: s.name, order: (s.order ?? maxOrderSoFar + 1), roleId: s.role_id ?? null, frontStage: s.front_stage ?? null });
  }
  return { stages };
}

/** Payment policy for many packages at once — Bookings asks for this when drafting a contract. */
export async function getPaymentPoliciesForPackages(packageIds: string[]): Promise<Record<string, { policy: PaymentPolicy; depositPercentage: number }>> {
  if (packageIds.length === 0) return {};
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin.from('packages').select('id, payment_policy').in('id', packageIds).eq('organization_id', orgId);
  const map: Record<string, { policy: PaymentPolicy; depositPercentage: number }> = {};
  for (const row of (data || []) as any[]) {
    const policy: PaymentPolicy = row.payment_policy === 'full' ? 'full' : 'deposit';
    map[row.id] = { policy, depositPercentage: policy === 'full' ? 100 : Number((row.pricing as any)?.deposit_percentage || 0) };
  }
  return map;
}

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
