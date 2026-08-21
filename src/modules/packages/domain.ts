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
export type PricingVariant = { axisLabel: string; tiers: { label: string; price: number }[] };
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

function cleanPricingVariant(input: PricingVariant | null | undefined): { axis_label: string; tiers: { label: string; price: number }[] } | null {
  if (!input || !input.axisLabel?.trim()) return null;
  const tiers = (input.tiers || []).map((t) => ({ label: (t.label || '').trim(), price: Number(t.price) || 0 })).filter((t) => t.label);
  if (tiers.length === 0) return null;
  return { axis_label: input.axisLabel.trim(), tiers };
}

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
 * Write what a package fixes.
 *
 * This is where "packages select, they never redefine" stops being a sentence
 * in a doc. A value aimed at a variable outside the bundled services is
 * rejected outright rather than dropped, because silently dropping it would let
 * a package claim a scope it does not actually have.
 *
 * A variable the package says nothing about is deliberately open — it stays a
 * question for the client rather than part of the offer.
 */
async function writePackageVariableValues(
  orgId: string,
  packageId: string,
  serviceIds: string[],
  values?: { serviceVariableId: string; value: unknown }[]
) {
  await supabaseAdmin
    .from('package_variable_values')
    .delete()
    .eq('organization_id', orgId)
    .eq('package_id', packageId);

  const wanted = (values || []).filter((v) => v.serviceVariableId && v.value !== undefined && v.value !== null);
  if (wanted.length === 0) return;

  // Asked of the Services module — never read from its tables directly.
  const { listVariablesForServices } = await import('@/modules/services/interface');
  const allowed = new Set((await listVariablesForServices(serviceIds)).map((v: any) => v.id));

  const stray = wanted.find((v) => !allowed.has(v.serviceVariableId));
  if (stray) throw new Error('That option belongs to a service this package does not include.');

  const { error } = await supabaseAdmin.from('package_variable_values').insert(
    wanted.map((v) => ({
      organization_id: orgId,
      package_id: packageId,
      service_variable_id: v.serviceVariableId,
      value: v.value,
    }))
  );
  if (error) {
    console.error('Failed to save package variable values:', error);
    throw new Error('Failed to save what this package includes');
  }
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
  basePrice?: number | null;
  priceUnit?: string | null;
  paymentPolicy?: PaymentPolicy | null;
  depositPercentage?: number | null;
  durationMinutes?: number | null;
  serviceIds?: string[];
  deliverableIds?: string[];
  /**
   * What the package actually includes, quantified — "Edited photographs × 6",
   * "Highlight video, 30 second", "Framed print, 20x30". A service says what
   * kind of thing it produces; this is where it gets specific, which is what a
   * package is for.
   */
  deliverableSpecs?: { deliverableId: string; quantity?: number | null; unit?: string | null; spec?: string | null }[];
  containerIds?: string[];
  workflowIds?: string[];
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
  pricingVariant?: PricingVariant | null;
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
  const paymentPolicy: PaymentPolicy | null = input.paymentPolicy === 'full' ? 'full' : input.paymentPolicy === 'deposit' ? 'deposit' : null;
  const hasPrice = input.basePrice !== undefined && input.basePrice !== null;
  const pricing = hasPrice || paymentPolicy
    ? { base_price: input.basePrice ?? 0, currency, deposit_percentage: paymentPolicy === 'full' ? 100 : (input.depositPercentage ?? 0) }
    : {};

  // Everything a package points at comes from the form, so each set is checked
  // against this studio before any of it is linked. The relink is destructive
  // (delete then insert), which is exactly why it happens after the check.
  await Promise.all([
    assertAllOurs(orgId, 'services', input.serviceIds, 'services'),
    assertAllOurs(orgId, 'deliverables', input.deliverableIds, 'outputs'),
    assertAllOurs(orgId, 'delivery_containers', input.containerIds, 'delivery containers'),
    assertAllOurs(orgId, 'blueprints', input.workflowIds, 'workflows'),
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
      pricing,
      payment_policy: paymentPolicy,
      duration_minutes: input.durationMinutes ?? null,
      price_unit: (input.priceUnit || '').trim() || null,
      pricing_variant: cleanPricingVariant(input.pricingVariant),
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

    if (input.deliverableIds && input.deliverableIds.length > 0) {
      await supabaseAdmin.from('package_deliverables').insert(
        input.deliverableIds.map((deliverable_id) => {
          const spec = input.deliverableSpecs?.find((d) => d.deliverableId === deliverable_id);
          return {
            organization_id: orgId, package_id: pkg.id, deliverable_id,
            quantity: spec?.quantity ?? null, unit: spec?.unit ?? null, spec: spec?.spec ?? null,
          };
        })
      );
    }
    
    if (input.containerIds && input.containerIds.length > 0) {
      await supabaseAdmin.from('package_delivery_containers').insert(input.containerIds.map((container_id) => ({ organization_id: orgId, package_id: pkg.id, container_id })));
    }
    
    await writePackageVariableValues(orgId, pkg.id, serviceIds, input.variableValues);

    if (input.workflowIds && input.workflowIds.length > 0) {
      await supabaseAdmin.from('package_workflows').insert(input.workflowIds.map((blueprint_id, i) => ({ organization_id: orgId, package_id: pkg.id, blueprint_id, position: i })));
    }

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
  basePrice?: number | null;
  priceUnit?: string | null;
  paymentPolicy?: PaymentPolicy | null;
  depositPercentage?: number | null;
  durationMinutes?: number | null;
  serviceIds?: string[];
  deliverableIds?: string[];
  /** Quantity, unit and spec per deliverable — where a package gets specific. */
  deliverableSpecs?: { deliverableId: string; quantity?: number | null; unit?: string | null; spec?: string | null }[];
  containerIds?: string[];
  workflowIds?: string[];
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
  pricingVariant?: PricingVariant | null;
  extraStages?: StageInput[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { data: existing } = await supabaseAdmin.from('packages').select('id, name, pricing, payment_policy').eq('id', input.packageId).eq('organization_id', orgId).maybeSingle();
  if (!existing) throw new Error('Package not found');

  // Everything a package points at comes from the form, so each set is checked
  // against this studio before any of it is linked. The relink is destructive
  // (delete then insert), which is exactly why it happens after the check.
  await Promise.all([
    assertAllOurs(orgId, 'services', input.serviceIds, 'services'),
    assertAllOurs(orgId, 'deliverables', input.deliverableIds, 'outputs'),
    assertAllOurs(orgId, 'delivery_containers', input.containerIds, 'delivery containers'),
    assertAllOurs(orgId, 'blueprints', input.workflowIds, 'workflows'),
    assertAllOurs(orgId, 'dimension_values', (input.narrowings || []).map((n) => n.valueId), 'classifications'),
    assertAllOurs(orgId, 'service_variables',
      (input.variableValues || []).map((v) => v.serviceVariableId), 'variables'),
  ]);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim() || existing.name;
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.durationMinutes !== undefined) patch.duration_minutes = input.durationMinutes;
  if (input.priceUnit !== undefined) patch.price_unit = (input.priceUnit || '').trim() || null;
  if (input.pricingVariant !== undefined) patch.pricing_variant = cleanPricingVariant(input.pricingVariant);
  if (input.extraStages !== undefined) patch.extra_stages = await buildExtraStages(input.extraStages);

  const nextPolicy: PaymentPolicy | null = input.paymentPolicy !== undefined ? input.paymentPolicy : (existing.payment_policy as PaymentPolicy | null);
  if (input.paymentPolicy !== undefined) patch.payment_policy = nextPolicy;
  if (input.basePrice !== undefined || input.depositPercentage !== undefined || input.paymentPolicy !== undefined) {
    const pricing: any = { ...(existing.pricing as any) };
    if (input.basePrice !== undefined) { if (input.basePrice === null) delete pricing.base_price; else pricing.base_price = input.basePrice; }
    if (nextPolicy) pricing.deposit_percentage = nextPolicy === 'full' ? 100 : (input.depositPercentage ?? pricing.deposit_percentage ?? 0);
    patch.pricing = pricing;
  }

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

  if (input.deliverableIds !== undefined) {
    const oIds = [...new Set(input.deliverableIds)];
    await supabaseAdmin.from('package_deliverables').delete().eq('package_id', input.packageId).eq('organization_id', orgId);
    if (oIds.length > 0) {
      await supabaseAdmin.from('package_deliverables').insert(
        oIds.map((deliverable_id) => {
          const spec = input.deliverableSpecs?.find((d) => d.deliverableId === deliverable_id);
          return {
            organization_id: orgId, package_id: input.packageId, deliverable_id,
            quantity: spec?.quantity ?? null, unit: spec?.unit ?? null, spec: spec?.spec ?? null,
          };
        })
      );
    }
  }
  
  if (input.containerIds !== undefined) {
    const cIds = [...new Set(input.containerIds)];
    await supabaseAdmin.from('package_delivery_containers').delete().eq('package_id', input.packageId).eq('organization_id', orgId);
    if (cIds.length > 0) {
      await supabaseAdmin.from('package_delivery_containers').insert(cIds.map((container_id) => ({ organization_id: orgId, package_id: input.packageId, container_id })));
    }
  }
  
  if (input.workflowIds !== undefined) {
    const wIds = [...new Set(input.workflowIds)];
    await supabaseAdmin.from('package_workflows').delete().eq('package_id', input.packageId).eq('organization_id', orgId);
    if (wIds.length > 0) {
      await supabaseAdmin.from('package_workflows').insert(wIds.map((blueprint_id, i) => ({ organization_id: orgId, package_id: input.packageId, blueprint_id, position: i })));
    }
  }

  // After the bundle is reconciled above, so it narrows what the package holds
  // *now*. A service dropped up there took its narrowings with it by cascade.
  if (input.narrowings !== undefined) {
    await writePackageNarrowings(orgId, input.packageId, input.narrowings);
  }

  // Validated against whatever the package bundles *now* — which may have just
  // changed above, so this reads the current set rather than trusting input.
  if (input.variableValues !== undefined) {
    const { data: bundled } = await supabaseAdmin
      .from('package_services').select('service_id')
      .eq('package_id', input.packageId).eq('organization_id', orgId);
    await writePackageVariableValues(
      orgId,
      input.packageId,
      ((bundled || []) as any[]).map((r) => r.service_id),
      input.variableValues
    );
  }

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
    .select('name, description, pricing, payment_policy, duration_minutes, price_unit, pricing_variant, extra_stages, form_schema')
    .eq('id', packageId).eq('organization_id', orgId).maybeSingle();
  if (!existing) throw new Error('Package not found');

  const { data: copy, error } = await supabaseAdmin
    .from('packages')
    .insert({ organization_id: orgId, name: `${existing.name} (Copy)`, description: existing.description, pricing: existing.pricing, payment_policy: existing.payment_policy, duration_minutes: existing.duration_minutes, price_unit: existing.price_unit, pricing_variant: existing.pricing_variant, extra_stages: existing.extra_stages, form_schema: existing.form_schema, status: 'active' })
    .select('id').single();
  if (error || !copy) { console.error('Failed to duplicate package:', error); throw new Error('Failed to duplicate the package'); }

  // Kept as id → service_id both ways: the narrowings below hang off the bundle
  // row, so the copy's rows have to be matched back to the originals by service.
  const { data: services } = await supabaseAdmin.from('package_services').select('id, service_id, position').eq('package_id', packageId).eq('organization_id', orgId);
  let copiedBundle: { id: string; service_id: string }[] = [];
  if (services && services.length > 0) {
    const { data: inserted } = await supabaseAdmin.from('package_services')
      .insert(services.map((s: any) => ({ organization_id: orgId, package_id: copy.id, service_id: s.service_id, position: s.position })))
      .select('id, service_id');
    copiedBundle = (inserted || []) as { id: string; service_id: string }[];
  }
  const { data: outputs } = await supabaseAdmin.from('package_deliverables').select('deliverable_id, quantity, unit, spec').eq('package_id', packageId).eq('organization_id', orgId);
  if (outputs && outputs.length > 0) await supabaseAdmin.from('package_deliverables').insert(outputs.map((d: any) => ({
    organization_id: orgId, package_id: copy.id, deliverable_id: d.deliverable_id,
    quantity: d.quantity, unit: d.unit, spec: d.spec,
  })));
  
  const { data: containers } = await supabaseAdmin.from('package_delivery_containers').select('container_id').eq('package_id', packageId).eq('organization_id', orgId);
  if (containers && containers.length > 0) await supabaseAdmin.from('package_delivery_containers').insert(containers.map((d: any) => ({ organization_id: orgId, package_id: copy.id, container_id: d.container_id })));
  
  const { data: workflows } = await supabaseAdmin.from('package_workflows').select('blueprint_id, position').eq('package_id', packageId).eq('organization_id', orgId);
  if (workflows && workflows.length > 0) await supabaseAdmin.from('package_workflows').insert(workflows.map((d: any) => ({ organization_id: orgId, package_id: copy.id, blueprint_id: d.blueprint_id, position: d.position })));

  if (services && services.length > 0 && copiedBundle.length > 0) {
    const serviceOfOriginal = new Map((services as any[]).map((s) => [s.id as string, s.service_id as string]));
    const copyRowOf = new Map(copiedBundle.map((s) => [s.service_id, s.id]));
    const { data: narrowings } = await supabaseAdmin
      .from('package_service_dimension_values')
      .select('package_service_id, dimension_value_id')
      .eq('organization_id', orgId)
      .in('package_service_id', (services as any[]).map((s) => s.id));

    const links = ((narrowings || []) as any[])
      .map((n) => ({
        organization_id: orgId,
        package_service_id: copyRowOf.get(serviceOfOriginal.get(n.package_service_id) as string),
        dimension_value_id: n.dimension_value_id as string,
      }))
      .filter((l): l is { organization_id: string; package_service_id: string; dimension_value_id: string } => Boolean(l.package_service_id));

    if (links.length > 0) await supabaseAdmin.from('package_service_dimension_values').insert(links);
  }

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
      basePrice: (p.pricing?.base_price ?? null) as number | null,
      currency: (p.pricing?.currency ?? null) as string | null,
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

const PACKAGE_SELECT = `
  id, name, description, pricing, status, duration_minutes, price_unit, payment_policy, pricing_variant, extra_stages,
  package_services(id, service:services(
    id, name, description, domain:service_domains(id, name),
    service_deliverables(deliverable:deliverables(id, name)),
    service_dimension_values(dimension_value:dimension_values(id, name, dimension:dimensions(id, name, position)))
  ), package_service_dimension_values(dimension_value:dimension_values(id, name, dimension:dimensions(id, name, position))))
`;

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
    .select(PACKAGE_SELECT + `,
      package_deliverables(quantity, unit, spec, deliverable:deliverables(id, name)),
      package_delivery_containers(container:delivery_containers(id, name)),
      package_workflows(blueprint:blueprints(id, name, stages))
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) { console.error('Failed to list packages:', error); throw new Error('Failed to load packages'); }
  return (data || []).map((p: any) => ({
    ...p,
    services: (p.package_services || []).map((ps: any) => ({
      ...ps.service,
      packageServiceId: ps.id,
      deliverables: (ps.service?.service_deliverables || []).map((sd: any) => sd.deliverable).filter(Boolean),
      // What the service offers, and what this package sells of it.
      dimensions: shapeDimensionLinks(ps.service?.service_dimension_values),
      narrowedTo: shapeDimensionLinks(ps.package_service_dimension_values),
    })).filter((s: any) => s.id),
    deliverables: (p.package_deliverables || [])
      .filter((pd: any) => pd.deliverable)
      .map((pd: any) => ({ ...pd.deliverable, quantity: pd.quantity, unit: pd.unit, spec: pd.spec })),
    containers: (p.package_delivery_containers || []).map((pd: any) => pd.container).filter(Boolean),
    workflows: (p.package_workflows || []).map((pw: any) => pw.blueprint).filter(Boolean),
    dimensions: packageDimensions(p.package_services),
  }));
}

export async function listPackagesPublic(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('packages')
    .select('id, name, description, pricing, duration_minutes, price_unit, pricing_variant, package_services(service:services(id, name))')
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
      id, name, description, pricing, duration_minutes, price_unit, pricing_variant,
      package_services(id, service:services(
        id, name
      ), package_service_dimension_values(dimension_value:dimension_values(
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
      pricing: p.pricing as any,
      duration_minutes: (p.duration_minutes ?? null) as number | null,
      price_unit: (p.price_unit ?? null) as string | null,
      pricing_variant: p.pricing_variant as any,
      services: services.map((s: any) => ({ id: s.id as string, name: s.name as string })),
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
      id, name, description, pricing, pricing_variant, duration_minutes, form_schema,
      package_services(service:services(name)),
      package_deliverables(quantity, unit, spec, deliverable:deliverables(name))
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
    pricing: p.pricing,
    pricing_variant: p.pricing_variant,
    durationMinutes: (p.duration_minutes ?? null) as number | null,
    formSchema: (p.form_schema || []) as any[],
    serviceNames: ((p.package_services || []) as any[]).map((ps) => ps.service?.name).filter(Boolean) as string[],
    // Specified, so the storefront says "6 edited photographs" rather than
    // leaving a client to guess how many.
    deliverableNames: ((p.package_deliverables || []) as any[])
      .filter((pd) => pd.deliverable?.name)
      .map((pd) => formatDeliverable({ name: pd.deliverable.name, quantity: pd.quantity, unit: pd.unit, spec: pd.spec })),
  };
}

export async function getPackage(packageId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin.from('packages').select(PACKAGE_SELECT + `,
    package_deliverables(quantity, unit, spec, deliverable:deliverables(id, name)),
    package_delivery_containers(container:delivery_containers(id, name)),
    package_workflows(blueprint:blueprints(id, name, stages)),
    package_variable_values(value, variable:service_variables(id, service_id, key, label, unit, kind))
  `).eq('id', packageId).eq('organization_id', orgId).maybeSingle();
  if (!data) return null;
  const p: any = data;
  return {
    ...p,
    services: (p.package_services || []).map((ps: any) => ({
      ...ps.service,
      packageServiceId: ps.id,
      deliverables: (ps.service?.service_deliverables || []).map((sd: any) => sd.deliverable).filter(Boolean),
      dimensions: shapeDimensionLinks(ps.service?.service_dimension_values),
      narrowedTo: shapeDimensionLinks(ps.package_service_dimension_values),
    })).filter((s: any) => s.id),
    deliverables: (p.package_deliverables || [])
      .filter((pd: any) => pd.deliverable)
      .map((pd: any) => ({ ...pd.deliverable, quantity: pd.quantity, unit: pd.unit, spec: pd.spec })),
    containers: (p.package_delivery_containers || []).map((pd: any) => pd.container).filter(Boolean),
    workflows: (p.package_workflows || []).map((pw: any) => pw.blueprint).filter(Boolean),
    dimensions: packageDimensions(p.package_services),
    // What this package fixes — "2 outfits", "5 edited images". A variable the
    // package says nothing about stays open, so it is simply absent here.
    variableValues: (p.package_variable_values || [])
      .filter((pv: any) => pv.variable)
      .map((pv: any) => ({
        serviceVariableId: pv.variable.id,
        serviceId: pv.variable.service_id,
        key: pv.variable.key,
        label: pv.variable.label,
        unit: pv.variable.unit ?? null,
        kind: pv.variable.kind,
        value: pv.value,
      })),
  };
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
  // Both reads throw rather than fall back to empty: an empty answer here reads
  // as "this package asks the client nothing", so a failed query would quietly
  // let someone book without ever being asked what they are buying.
  const { data: rows, error: rowsError } = await supabaseAdmin
    .from('package_services')
    .select('service:services(id, name, service_variables(id, key, label, kind, unit, options, default_value, min_value, max_value, position))')
    .eq('package_id', packageId)
    .eq('organization_id', orgId)
    .order('position');
  if (rowsError) throw new Error(`Could not read the package's services: ${rowsError.message}`);

  const { data: fixed, error: fixedError } = await supabaseAdmin
    .from('package_variable_values')
    .select('service_variable_id')
    .eq('package_id', packageId)
    .eq('organization_id', orgId);
  if (fixedError) throw new Error(`Could not read the package's fixed values: ${fixedError.message}`);
  const fixedIds = new Set(((fixed || []) as any[]).map((f) => f.service_variable_id));

  const all: any[] = [];
  for (const row of ((rows || []) as any[])) {
    const service = row.service;
    if (!service) continue;
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
  const { data, error } = await supabaseAdmin
    .from('package_deliverables')
    .select('deliverable:deliverables(id, name)')
    .eq('organization_id', orgId)
    .in('package_id', packageIds);
  if (error) {
    console.error('Failed to list promised deliverables:', error);
    return [];
  }
  const byId = new Map<string, { id: string; name: string }>();
  for (const row of ((data || []) as any[])) {
    if (row.deliverable) byId.set(row.deliverable.id, { id: row.deliverable.id, name: row.deliverable.name });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** What Bookings needs to build a line — id, price, and its aggregated routing inputs. */
export async function getPackageForBooking(packageId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin.from('packages').select('id, name, pricing, duration_minutes, price_unit, payment_policy, pricing_variant').eq('id', packageId).eq('organization_id', orgId).maybeSingle();
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

  const { data: pkg } = await supabaseAdmin.from('packages').select('extra_stages, package_workflows(blueprint:blueprints(stages))').eq('id', packageId).eq('organization_id', orgId).maybeSingle();

  const stages: { name: string; order: number; roleId: string | null; frontStage: boolean | null }[] = [];
  
  const workflows = ((pkg?.package_workflows as any[]) || []).map(pw => pw.blueprint).filter(Boolean);
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
  const { data } = await supabaseAdmin.from('packages').select('id, pricing, payment_policy').in('id', packageIds).eq('organization_id', orgId);
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
