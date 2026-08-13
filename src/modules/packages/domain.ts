'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
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
 * Shared by the Service side (`service_dimension_values`) and the Package side
 * (`package_dimension_values`) because the two links are the same shape: an
 * entity, and a value in some domain's vocabulary. A package may carry values
 * from more than one domain at once — it bundles across them freely — so this
 * groups by dimension without assuming they share a parent.
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
   * How this package is classified — dimension_value ids, flat.
   *
   * Flat because a value belongs to exactly one dimension of exactly one
   * domain, so the id already says which question it answers. Grouping them by
   * dimension here would store that fact a second time, and a package crosses
   * domains freely — it may well carry values from two vocabularies at once.
   */
  dimensionValueIds?: string[];
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
    await supabaseAdmin.from('package_services').insert(serviceIds.map((service_id, i) => ({ organization_id: orgId, package_id: pkg.id, service_id, position: i })));

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

    const valueIds = [...new Set(input.dimensionValueIds || [])];
    if (valueIds.length > 0) {
      await supabaseAdmin.from('package_dimension_values').insert(
        valueIds.map((dimension_value_id) => ({ organization_id: orgId, package_id: pkg.id, dimension_value_id }))
      );
    }
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
   * How this package is classified — dimension_value ids, flat.
   *
   * Flat because a value belongs to exactly one dimension of exactly one
   * domain, so the id already says which question it answers. Grouping them by
   * dimension here would store that fact a second time, and a package crosses
   * domains freely — it may well carry values from two vocabularies at once.
   */
  dimensionValueIds?: string[];
  pricingVariant?: PricingVariant | null;
  extraStages?: StageInput[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const { data: existing } = await supabaseAdmin.from('packages').select('id, name, pricing, payment_policy').eq('id', input.packageId).eq('organization_id', orgId).maybeSingle();
  if (!existing) throw new Error('Package not found');

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

  if (input.serviceIds !== undefined) {
    const serviceIds = [...new Set(input.serviceIds)];
    await supabaseAdmin.from('package_services').delete().eq('package_id', input.packageId).eq('organization_id', orgId);
    if (serviceIds.length > 0) {
      await supabaseAdmin.from('package_services').insert(serviceIds.map((service_id, i) => ({ organization_id: orgId, package_id: input.packageId, service_id, position: i })));
    }
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

  if (input.dimensionValueIds !== undefined) {
    await supabaseAdmin.from('package_dimension_values').delete()
      .eq('package_id', input.packageId).eq('organization_id', orgId);
    const valueIds = [...new Set(input.dimensionValueIds)];
    if (valueIds.length > 0) {
      await supabaseAdmin.from('package_dimension_values').insert(
        valueIds.map((dimension_value_id) => ({ organization_id: orgId, package_id: input.packageId, dimension_value_id }))
      );
    }
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

  const { data: services } = await supabaseAdmin.from('package_services').select('service_id, position').eq('package_id', packageId).eq('organization_id', orgId);
  if (services && services.length > 0) await supabaseAdmin.from('package_services').insert(services.map((s: any) => ({ organization_id: orgId, package_id: copy.id, service_id: s.service_id, position: s.position })));
  const { data: outputs } = await supabaseAdmin.from('package_deliverables').select('deliverable_id, quantity, unit, spec').eq('package_id', packageId).eq('organization_id', orgId);
  if (outputs && outputs.length > 0) await supabaseAdmin.from('package_deliverables').insert(outputs.map((d: any) => ({
    organization_id: orgId, package_id: copy.id, deliverable_id: d.deliverable_id,
    quantity: d.quantity, unit: d.unit, spec: d.spec,
  })));
  
  const { data: containers } = await supabaseAdmin.from('package_delivery_containers').select('container_id').eq('package_id', packageId).eq('organization_id', orgId);
  if (containers && containers.length > 0) await supabaseAdmin.from('package_delivery_containers').insert(containers.map((d: any) => ({ organization_id: orgId, package_id: copy.id, container_id: d.container_id })));
  
  const { data: workflows } = await supabaseAdmin.from('package_workflows').select('blueprint_id, position').eq('package_id', packageId).eq('organization_id', orgId);
  if (workflows && workflows.length > 0) await supabaseAdmin.from('package_workflows').insert(workflows.map((d: any) => ({ organization_id: orgId, package_id: copy.id, blueprint_id: d.blueprint_id, position: d.position })));

  const { data: tags } = await supabaseAdmin.from('package_dimension_values').select('dimension_value_id').eq('package_id', packageId).eq('organization_id', orgId);
  if (tags && tags.length > 0) {
    await supabaseAdmin.from('package_dimension_values').insert(
      tags.map((t: any) => ({ organization_id: orgId, package_id: copy.id, dimension_value_id: t.dimension_value_id }))
    );
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
  package_services(service:services(
    id, name, description, domain:service_domains(id, name),
    service_deliverables(deliverable:deliverables(id, name)),
    service_dimension_values(dimension_value:dimension_values(id, name, dimension:dimensions(id, name, position)))
  ))
`;

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
      package_workflows(blueprint:blueprints(id, name, stages)),
      package_dimension_values(dimension_value:dimension_values(id, name, dimension:dimensions(id, name, position)))
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) { console.error('Failed to list packages:', error); throw new Error('Failed to load packages'); }
  return (data || []).map((p: any) => ({
    ...p,
    services: (p.package_services || []).map((ps: any) => ({
      ...ps.service,
      deliverables: (ps.service?.service_deliverables || []).map((sd: any) => sd.deliverable).filter(Boolean),
      dimensions: shapeDimensionLinks(ps.service?.service_dimension_values),
    })).filter((s: any) => s.id),
    deliverables: (p.package_deliverables || [])
      .filter((pd: any) => pd.deliverable)
      .map((pd: any) => ({ ...pd.deliverable, quantity: pd.quantity, unit: pd.unit, spec: pd.spec })),
    containers: (p.package_delivery_containers || []).map((pd: any) => pd.container).filter(Boolean),
    workflows: (p.package_workflows || []).map((pw: any) => pw.blueprint).filter(Boolean),
    dimensions: shapeDimensionLinks(p.package_dimension_values),
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
      package_services(service:services(
        id, name
      )),
      package_dimension_values(dimension_value_id)
    `)
    .eq('organization_id', orgId).eq('status', 'active')
    .order('created_at', { ascending: false });

  return ((data || []) as any[]).map((p) => {
    const services = (p.package_services || []).map((ps: any) => ps.service).filter(Boolean);
    return {
      id: p.id as string,
      name: p.name as string,
      description: (p.description ?? null) as string | null,
      pricing: p.pricing as any,
      duration_minutes: (p.duration_minutes ?? null) as number | null,
      price_unit: (p.price_unit ?? null) as string | null,
      pricing_variant: p.pricing_variant as any,
      services: services.map((s: any) => ({ id: s.id as string, name: s.name as string })),
      // Flat, because matching an enquiry is co-occurrence over values: how
      // many of what the client chose does this package already carry. Which
      // dimension each value came from never enters the arithmetic.
      dimensionValueIds: [...new Set(
        (p.package_dimension_values || []).map((pv: any) => pv.dimension_value_id).filter(Boolean)
      )] as string[],
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
    package_dimension_values(dimension_value:dimension_values(id, name, dimension:dimensions(id, name, position))),
    package_variable_values(value, variable:service_variables(id, key, label, unit, kind))
  `).eq('id', packageId).eq('organization_id', orgId).maybeSingle();
  if (!data) return null;
  const p: any = data;
  return { 
    ...p, 
    services: (p.package_services || []).map((ps: any) => ({
      ...ps.service,
      deliverables: (ps.service?.service_deliverables || []).map((sd: any) => sd.deliverable).filter(Boolean),
      dimensions: shapeDimensionLinks(ps.service?.service_dimension_values),
    })).filter((s: any) => s.id),
    deliverables: (p.package_deliverables || [])
      .filter((pd: any) => pd.deliverable)
      .map((pd: any) => ({ ...pd.deliverable, quantity: pd.quantity, unit: pd.unit, spec: pd.spec })),
    containers: (p.package_delivery_containers || []).map((pd: any) => pd.container).filter(Boolean),
    workflows: (p.package_workflows || []).map((pw: any) => pw.blueprint).filter(Boolean),
    dimensions: shapeDimensionLinks(p.package_dimension_values),
    // What this package fixes — "2 outfits", "5 edited images". A variable the
    // package says nothing about stays open, so it is simply absent here.
    variableValues: (p.package_variable_values || [])
      .filter((pv: any) => pv.variable)
      .map((pv: any) => ({
        serviceVariableId: pv.variable.id,
        key: pv.variable.key,
        label: pv.variable.label,
        unit: pv.variable.unit ?? null,
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
  const { data: rows } = await supabaseAdmin
    .from('package_services')
    .select('service:services(id, name, service_variables(id, key, label, kind, unit, options, default_value, min_value, max_value, position))')
    .eq('package_id', packageId)
    .eq('organization_id', orgId)
    .order('position');

  const { data: fixed } = await supabaseAdmin
    .from('package_variable_values')
    .select('service_variable_id')
    .eq('package_id', packageId)
    .eq('organization_id', orgId);
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
    for (const s of bpStages) stages.push({ name: s.name, order: stages.length, roleId: s.roleId, frontStage: s.frontStage });
  }

  for (const s of (pkg?.extra_stages as any[]) || []) {
    stages.push({ name: s.name, order: stages.length, roleId: s.role_id ?? null, frontStage: s.front_stage ?? null });
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
