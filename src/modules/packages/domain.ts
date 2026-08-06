'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { getStudioCurrency } from '@/kernel/organizations';
import { logEvent } from '@/kernel/events';
import { revalidatePath } from 'next/cache';
import { fieldType, type IntakeQuestion } from '@/modules/services/fieldTypes';

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

// ── Facet-style, studio-editable vocabulary (Category only — the five real
// classification dimensions, Subject/Occasion/Context/Purpose/Client, are
// owned by Services and asked for through its interface below, since they
// apply symmetrically to Service too, not just Package) ─────────────────────

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

    // Deliverables are explicitly chosen from the UI. If none are provided (e.g. from an API call),
    // we could fallback to the union of bundled Services, but since the UI now handles it explicitly,
    // we just use the provided array (or empty if they cleared it).
    const finalDeliverables = input.deliverableIds ?? [];
    if (finalDeliverables.length > 0) {
      await supabaseAdmin.from('package_deliverables').insert(
        finalDeliverables.map((deliverable_id) => ({ organization_id: orgId, package_id: pkg.id, deliverable_id }))
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
    const dIds = [...new Set(input.deliverableIds)];
    await supabaseAdmin.from('package_deliverables').delete().eq('package_id', input.packageId).eq('organization_id', orgId);
    if (dIds.length > 0) {
      await supabaseAdmin.from('package_deliverables').insert(dIds.map((deliverable_id) => ({ organization_id: orgId, package_id: input.packageId, deliverable_id })));
    }
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
  const { data: deliverables } = await supabaseAdmin.from('package_deliverables').select('deliverable_id').eq('package_id', packageId).eq('organization_id', orgId);
  if (deliverables && deliverables.length > 0) await supabaseAdmin.from('package_deliverables').insert(deliverables.map((d: any) => ({ organization_id: orgId, package_id: copy.id, deliverable_id: d.deliverable_id })));

  await logEvent({ organizationId: orgId, entityType: 'package', entityId: copy.id, action: 'duplicated', actorId: actorId ?? undefined, payload: { fromPackageId: packageId } });
  revalidatePath('/packages');
  return { packageId: copy.id };
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
  package_services(service:services(id, name, domain:service_domains(id, name), occasion:occasions(id, name), context:service_contexts(id, name), subject:subjects(id, name), purpose:purposes(id, name), client_type:client_types(id, name)))
`;

export async function listPackages() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin.from('packages').select(PACKAGE_SELECT).eq('organization_id', orgId).order('created_at', { ascending: false });
  if (error) { console.error('Failed to list packages:', error); throw new Error('Failed to load packages'); }
  return (data || []).map((p: any) => ({ ...p, services: (p.package_services || []).map((ps: any) => ps.service).filter(Boolean) }));
}

/** The storefront — active packages only, no session. */
export async function listPackagesPublic(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('packages')
    .select('id, name, description, pricing, duration_minutes, price_unit, pricing_variant, package_services(service:services(id, name))')
    .eq('organization_id', orgId).eq('status', 'active').order('created_at', { ascending: false });
  if (error) { console.error('Failed to list public packages:', error); return []; }
  return (data || []).map((p: any) => ({ ...p, services: (p.package_services || []).map((ps: any) => ps.service).filter(Boolean) }));
}

export async function getPackage(packageId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin.from('packages').select(PACKAGE_SELECT + ', package_deliverables(deliverable:deliverables(id, name))').eq('id', packageId).eq('organization_id', orgId).maybeSingle();
  if (!data) return null;
  const p: any = data;
  return { ...p, services: (p.package_services || []).map((ps: any) => ps.service).filter(Boolean), deliverables: (p.package_deliverables || []).map((pd: any) => pd.deliverable).filter(Boolean) };
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
  const { getProductionPlanForService } = await import('@/modules/services/interface');

  const { data: pkg } = await supabaseAdmin.from('packages').select('extra_stages').eq('id', packageId).eq('organization_id', orgId).maybeSingle();
  const { data: bundled } = await supabaseAdmin.from('package_services').select('service_id').eq('package_id', packageId).eq('organization_id', orgId).order('position');

  const stages: { name: string; order: number; roleId: string | null; frontStage: boolean | null }[] = [];
  for (const row of (bundled || []) as any[]) {
    const plan = await getProductionPlanForService(row.service_id);
    for (const s of plan.stages) stages.push({ name: s.name, order: stages.length, roleId: s.roleId, frontStage: s.frontStage });
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
