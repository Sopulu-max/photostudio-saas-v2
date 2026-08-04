'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { getStudioCurrency } from '@/kernel/organizations';
import { fieldType, type IntakeQuestion } from './fieldTypes';
import { revalidatePath } from 'next/cache';

/**
 * Services — what the studio sells (≈ Odoo product.template), plus the reusable
 * blueprints its work starts from. The definition layer: configured once,
 * instantiated per booking line.
 *
 * A service REFERENCES a blueprint rather than embedding stages, so one pipeline
 * ("standard editing") can back many services.
 */

export type PaymentPolicy = 'deposit' | 'full';

export async function createService(input: {
  name: string;
  description?: string;
  basePrice?: number;
  paymentPolicy?: PaymentPolicy;
  depositPercentage?: number;
  durationMinutes?: number | null;
  priceUnit?: string | null;
  categoryId?: string | null;
  blueprintId?: string | null;
  formSchema?: any[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const name = (input.name || '').trim();
  if (!name) throw new Error('A service needs a name.');

  // The studio bills in one currency — read it rather than defaulting to USD.
  const currency = await getStudioCurrency();
  const paymentPolicy: PaymentPolicy = input.paymentPolicy === 'full' ? 'full' : 'deposit';
  // Full payment is never partial — the stored percentage can't be trusted to
  // say 100, so the policy itself is what anything downstream must check.
  const pricing = {
    base_price: input.basePrice ?? 0,
    currency,
    deposit_percentage: paymentPolicy === 'full' ? 100 : (input.depositPercentage ?? 0),
  };

  const { data: service, error } = await supabaseAdmin
    .from('services')
    .insert({
      organization_id: orgId,
      name,
      description: input.description || null,
      pricing,
      payment_policy: paymentPolicy,
      default_blueprint_id: input.blueprintId || null,
      duration_minutes: input.durationMinutes ?? null,
      price_unit: (input.priceUnit || '').trim() || null,
      category_id: input.categoryId || null,
      form_schema: input.formSchema || [],
      status: 'active',
    })
    .select('id')
    .single();

  if (error || !service) {
    console.error('Failed to create service:', error);
    throw new Error('Failed to create service');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'service',
    entityId: service.id,
    action: 'created',
    actorId: actorId ?? undefined,
    payload: { name, pricing },
  });

  revalidatePath('/services');
  return { serviceId: service.id };
}

export async function listServices() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('services')
    .select('id, name, description, pricing, status, duration_minutes, price_unit, category_id, payment_policy, default_blueprint_id, blueprint:blueprints(id, name), category:service_categories(id, name, position)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to list services:', error);
    throw new Error('Failed to load services');
  }
  return data || [];
}

/**
 * The storefront — active services only, no session. The public booking
 * index asks this rather than reading the table (and rather than reusing
 * listServices, which would need an authenticated org and includes retired
 * services the public should never see).
 */
export async function listServicesPublic(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('services')
    .select('id, name, description, pricing, duration_minutes, price_unit, category_id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to list public services:', error);
    return [];
  }
  return data || [];
}

/** A single service's sellable detail — what Bookings needs to build a line. */
export async function getService(serviceId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('services')
    .select('id, name, pricing, duration_minutes, price_unit, payment_policy')
    .eq('id', serviceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return data;
}

/** Attach (or clear) the blueprint a service's work starts from. */
export async function setServiceBlueprint(input: { serviceId: string; blueprintId: string | null }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('services')
    .update({ default_blueprint_id: input.blueprintId })
    .eq('id', input.serviceId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to set service blueprint:', error);
    throw new Error('Failed to attach the blueprint');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'service',
    entityId: input.serviceId,
    action: 'blueprint_set',
    actorId: actorId ?? undefined,
    payload: { blueprintId: input.blueprintId },
  });

  revalidatePath('/services');
  return { ok: true };
}

// ── Blueprints — reusable stage sets, owned by this module ───────────────────

export async function createBlueprint(input: { name: string; stages: { name: string }[] }) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const name = (input.name || '').trim();
  if (!name) throw new Error('A blueprint needs a name.');

  const stages = (input.stages || [])
    .map((s, i) => ({ name: (s.name || '').trim(), order: i }))
    .filter((s) => s.name);
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

  await logEvent({
    organizationId: orgId,
    entityType: 'blueprint',
    entityId: blueprint.id,
    action: 'created',
    actorId: actorId ?? undefined,
    payload: { name, stageCount: stages.length },
  });

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
  if (error) {
    console.error('Failed to list blueprints:', error);
    throw new Error('Failed to load blueprints');
  }
  return data || [];
}

/**
 * The production plan a booking line's work starts from — which blueprint, and
 * its stages. Production asks for this rather than reading services/blueprints
 * itself.
 */
export async function getProductionPlanForService(
  serviceId: string
): Promise<{ blueprintId: string | null; stages: { name: string; order: number }[] }> {
  const { orgId } = await getAuthOrgId();
  const { data: service } = await supabaseAdmin
    .from('services')
    .select('default_blueprint_id')
    .eq('id', serviceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!service?.default_blueprint_id) return { blueprintId: null, stages: [] };

  const { data: blueprint } = await supabaseAdmin
    .from('blueprints')
    .select('stages')
    .eq('id', service.default_blueprint_id)
    .maybeSingle();

  return {
    blueprintId: service.default_blueprint_id,
    stages: ((blueprint?.stages as any[]) || []).map((s, i) => ({ name: s.name, order: s.order ?? i })),
  };
}

// ── Editing what exists (a service was write-once until now) ────────────────

/**
 * Change a service. Price edits deliberately do NOT touch existing bookings:
 * booking_lines snapshot title and price when added, so history stays what was
 * actually agreed. New lines pick up the new price.
 */
export async function updateService(input: {
  serviceId: string;
  name?: string;
  description?: string | null;
  basePrice?: number | null;
  paymentPolicy?: PaymentPolicy;
  depositPercentage?: number | null;
  durationMinutes?: number | null;
  priceUnit?: string | null;
  categoryId?: string | null;
  blueprintId?: string | null;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: existing } = await supabaseAdmin
    .from('services')
    .select('id, name, pricing, duration_minutes, price_unit, payment_policy')
    .eq('id', input.serviceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!existing) throw new Error('Service not found');

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('A service needs a name.');
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.blueprintId !== undefined) patch.default_blueprint_id = input.blueprintId || null;
  if (input.durationMinutes !== undefined) patch.duration_minutes = input.durationMinutes;
  if (input.priceUnit !== undefined) patch.price_unit = (input.priceUnit || '').trim() || null;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId || null;

  const nextPolicy: PaymentPolicy = input.paymentPolicy ?? (existing.payment_policy as PaymentPolicy) ?? 'deposit';
  if (input.paymentPolicy !== undefined) patch.payment_policy = nextPolicy;

  if (input.basePrice !== undefined || input.depositPercentage !== undefined || input.paymentPolicy !== undefined) {
    const pricing: any = { ...(existing.pricing as any) };
    if (input.basePrice !== undefined) pricing.base_price = input.basePrice ?? 0;
    // Full payment is never partial, regardless of what a stale percentage said.
    pricing.deposit_percentage = nextPolicy === 'full' ? 100 : (input.depositPercentage ?? pricing.deposit_percentage ?? 0);
    patch.pricing = pricing;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabaseAdmin
    .from('services')
    .update(patch)
    .eq('id', input.serviceId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to update service:', error);
    throw new Error('Failed to save the service');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'service',
    entityId: input.serviceId,
    action: 'updated',
    actorId: actorId ?? undefined,
    payload: patch,
  });

  revalidatePath('/services');
  revalidatePath(`/services/${input.serviceId}`);
  return { ok: true };
}

/**
 * Retire a service so it stops being sellable, or bring it back. Never deletes:
 * past bookings keep their line (which carries its own title and price), and a
 * retired service simply stops appearing in the pickers.
 */
export async function setServiceStatus(input: { serviceId: string; status: 'active' | 'retired' }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { error } = await supabaseAdmin
    .from('services')
    .update({ status: input.status })
    .eq('id', input.serviceId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to change the service');

  await logEvent({
    organizationId: orgId,
    entityType: 'service',
    entityId: input.serviceId,
    action: input.status === 'retired' ? 'retired' : 'restored',
    actorId: actorId ?? undefined,
  });

  revalidatePath('/services');
  revalidatePath(`/services/${input.serviceId}`);
  return { ok: true };
}

/** Rename a blueprint and/or rewrite its stages. */
export async function updateBlueprint(input: { blueprintId: string; name?: string; stages?: { name: string }[] }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('A blueprint needs a name.');
    patch.name = name;
  }
  if (input.stages !== undefined) {
    const stages = input.stages
      .map((s, i) => ({ name: (s.name || '').trim(), order: i }))
      .filter((s) => s.name);
    if (stages.length === 0) throw new Error('Keep at least one stage.');
    patch.stages = stages;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabaseAdmin
    .from('blueprints')
    .update(patch)
    .eq('id', input.blueprintId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to save the blueprint');

  await logEvent({
    organizationId: orgId,
    entityType: 'blueprint',
    entityId: input.blueprintId,
    action: 'updated',
    actorId: actorId ?? undefined,
    payload: patch,
  });

  revalidatePath('/services');
  return { ok: true };
}

/**
 * Remove a blueprint. Services pointing at it lose the reference (their work
 * then starts from a single free-form stage); tasks already created are
 * untouched — they were copied out when work started.
 */
export async function deleteBlueprint(blueprintId: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  await supabaseAdmin
    .from('services')
    .update({ default_blueprint_id: null })
    .eq('organization_id', orgId)
    .eq('default_blueprint_id', blueprintId);

  const { error } = await supabaseAdmin
    .from('blueprints')
    .delete()
    .eq('id', blueprintId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to remove the blueprint');

  await logEvent({
    organizationId: orgId,
    entityType: 'blueprint',
    entityId: blueprintId,
    action: 'deleted',
    actorId: actorId ?? undefined,
  });

  revalidatePath('/services');
  return { ok: true };
}

// ── Intake questions: what a service asks a client ──────────────────────────

/**
 * The questions a service asks. Read by the public booking form (to render the
 * right widget per type) and by the booking hub (to label the answers).
 */
export async function getIntakeQuestions(serviceId: string): Promise<IntakeQuestion[]> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('services')
    .select('form_schema')
    .eq('id', serviceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return normaliseQuestions(data?.form_schema);
}

/** Public read — the booking page has no session. */
export async function getIntakeQuestionsPublic(serviceId: string): Promise<IntakeQuestion[]> {
  const { data } = await supabaseAdmin
    .from('services')
    .select('form_schema')
    .eq('id', serviceId)
    .maybeSingle();
  return normaliseQuestions(data?.form_schema);
}

function normaliseQuestions(raw: unknown): IntakeQuestion[] {
  return ((raw as any[]) || [])
    .filter((q) => q && q.id && q.label)
    .map((q) => ({
      id: String(q.id),
      type: (q.type || 'text') as IntakeQuestion['type'],
      label: String(q.label),
      required: !!q.required,
      help: q.help ? String(q.help) : undefined,
      options: Array.isArray(q.options) ? q.options.map(String) : undefined,
    }));
}

/**
 * Rewrite a service's questions.
 *
 * Two rules, both traced from what happens to answers already collected:
 *  · a question's TYPE is locked once a client has answered it — changing it
 *    would leave "about 40" sitting in a number field.
 *  · removing a question is allowed; bookings keep the answers they hold and
 *    show them as "(question removed)". A client told you something real.
 */
export async function updateServiceQuestions(input: { serviceId: string; questions: IntakeQuestion[] }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: service } = await supabaseAdmin
    .from('services')
    .select('form_schema')
    .eq('id', input.serviceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!service) throw new Error('Service not found');

  const before = normaliseQuestions(service.form_schema);

  // Clean and check each question against its own type's rules.
  const questions: IntakeQuestion[] = [];
  for (const q of input.questions || []) {
    const label = (q.label || '').trim();
    if (!label) continue;
    const def = fieldType(q.type);
    const options = def.needsOptions
      ? (q.options || []).map((o) => String(o).trim()).filter(Boolean)
      : undefined;
    if (def.needsOptions && (!options || options.length === 0)) {
      throw new Error(`"${label}" needs at least one choice.`);
    }
    questions.push({
      id: q.id || crypto.randomUUID(),
      type: def.key,
      label,
      required: !!q.required,
      help: (q.help || '').trim() || undefined,
      options,
    });
  }

  // The type lock — ask Bookings which questions already carry answers.
  const { getAnsweredQuestionIdsForService } = await import('@/modules/bookings/interface');
  const answered = new Set(await getAnsweredQuestionIdsForService(input.serviceId));
  for (const q of questions) {
    const was = before.find((b) => b.id === q.id);
    if (was && was.type !== q.type && answered.has(q.id)) {
      throw new Error(
        `"${was.label}" has already been answered by a client, so its type can't change. Add a new question instead.`
      );
    }
  }

  const { error } = await supabaseAdmin
    .from('services')
    .update({ form_schema: questions })
    .eq('id', input.serviceId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to save questions:', error);
    throw new Error('Failed to save the questions');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'service',
    entityId: input.serviceId,
    action: 'questions_updated',
    actorId: actorId ?? undefined,
    payload: { count: questions.length },
  });

  revalidatePath(`/services/${input.serviceId}`);
  return { ok: true };
}

/** Which of a service's questions are type-locked, for the editor to grey out. */
export async function getLockedQuestionIds(serviceId: string): Promise<string[]> {
  const { getAnsweredQuestionIdsForService } = await import('@/modules/bookings/interface');
  return getAnsweredQuestionIdsForService(serviceId);
}

// ── Categories: how a studio arranges its own shelf ─────────────────────────

export async function listCategories() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('service_categories')
    .select('id, name, position')
    .eq('organization_id', orgId)
    .order('position');
  if (error) {
    console.error('Failed to list categories:', error);
    return [];
  }
  return data || [];
}

/** A studio's own catalogue groups, for the public storefront — no session. */
export async function listCategoriesPublic(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('service_categories')
    .select('id, name, position')
    .eq('organization_id', orgId)
    .order('position');
  if (error) {
    console.error('Failed to list public categories:', error);
    return [];
  }
  return data || [];
}

export async function createCategory(name: string) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const clean = (name || '').trim();
  if (!clean) throw new Error('Give the group a name.');

  const { data: last } = await supabaseAdmin
    .from('service_categories')
    .select('position')
    .eq('organization_id', orgId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: row, error } = await supabaseAdmin
    .from('service_categories')
    .insert({ organization_id: orgId, name: clean, position: (last?.position ?? -1) + 1 })
    .select('id')
    .single();
  if (error || !row) throw new Error('Failed to add the group (does that name already exist?)');

  await logEvent({ organizationId: orgId, entityType: 'service_category', entityId: row.id, action: 'created', actorId: actorId ?? undefined, payload: { name: clean } });
  revalidatePath('/services');
  return { categoryId: row.id };
}

export async function renameCategory(input: { categoryId: string; name: string }) {
  const { orgId } = await getAuthOrgId();
  const clean = (input.name || '').trim();
  if (!clean) throw new Error('Give the group a name.');

  const { error } = await supabaseAdmin
    .from('service_categories')
    .update({ name: clean })
    .eq('id', input.categoryId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to rename (does that name already exist?)');

  revalidatePath('/services');
  return { ok: true };
}

/** Removing a group never removes its services — they simply become ungrouped. */
export async function deleteCategory(categoryId: string) {
  const { orgId } = await getAuthOrgId();
  const { error } = await supabaseAdmin
    .from('service_categories')
    .delete()
    .eq('id', categoryId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to remove the group');

  revalidatePath('/services');
  return { ok: true };
}

/**
 * Payment policy for many services at once — Bookings asks for this when
 * drafting a contract, rather than reaching into the services table itself.
 */
export async function getPaymentPoliciesForServices(
  serviceIds: string[]
): Promise<Record<string, { policy: PaymentPolicy; depositPercentage: number }>> {
  if (serviceIds.length === 0) return {};
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('services')
    .select('id, pricing, payment_policy')
    .in('id', serviceIds)
    .eq('organization_id', orgId);
  const map: Record<string, { policy: PaymentPolicy; depositPercentage: number }> = {};
  for (const row of (data || []) as any[]) {
    const policy: PaymentPolicy = row.payment_policy === 'full' ? 'full' : 'deposit';
    map[row.id] = {
      policy,
      depositPercentage: policy === 'full' ? 100 : Number((row.pricing as any)?.deposit_percentage || 0),
    };
  }
  return map;
}

// ── Extras: optional add-ons a service carries ──────────────────────────────
// Not a sellable concept of its own — an extra only exists in relation to the
// service that defines it (cascade-deleted with it), and consumption reuses
// booking_lines exactly as a custom line already does: an extra becomes a
// line with its own snapshotted name/price, added the same way a plain
// custom line is. Nothing new was needed in Bookings for this to work.

export type ServiceExtra = { id: string; name: string; price: number; unit: string | null };

export async function listServiceExtras(serviceId: string): Promise<ServiceExtra[]> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('service_extras')
    .select('id, name, price, price_unit')
    .eq('service_id', serviceId)
    .eq('organization_id', orgId)
    .order('position');
  return (data || []).map((e: any) => ({ id: e.id, name: e.name, price: Number(e.price), unit: e.price_unit }));
}

/** Public read — the booking page has no session. */
export async function listServiceExtrasPublic(serviceId: string): Promise<ServiceExtra[]> {
  const { data } = await supabaseAdmin
    .from('service_extras')
    .select('id, name, price, price_unit')
    .eq('service_id', serviceId)
    .order('position');
  return (data || []).map((e: any) => ({ id: e.id, name: e.name, price: Number(e.price), unit: e.price_unit }));
}

/**
 * Extras for many services at once — Bookings asks for this in bulk when
 * building the "add a line" picker, rather than one call per service.
 */
export async function listExtrasForServices(serviceIds: string[]): Promise<Record<string, ServiceExtra[]>> {
  if (serviceIds.length === 0) return {};
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('service_extras')
    .select('id, service_id, name, price, price_unit')
    .in('service_id', serviceIds)
    .eq('organization_id', orgId)
    .order('position');
  const map: Record<string, ServiceExtra[]> = {};
  for (const row of data || []) {
    (map[row.service_id] ??= []).push({ id: row.id, name: row.name, price: Number(row.price), unit: row.price_unit });
  }
  return map;
}

/**
 * Rewrite a service's extras in one go, like questions. Safe to fully replace:
 * an extra carries no identity a booking line depends on — a line snapshots
 * the name and price at add-time, so editing or removing the definition never
 * touches a booking that already used it.
 */
export async function updateServiceExtras(input: {
  serviceId: string;
  extras: { name: string; price: number; unit?: string | null }[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: service } = await supabaseAdmin
    .from('services')
    .select('id')
    .eq('id', input.serviceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!service) throw new Error('Service not found');

  const clean = (input.extras || [])
    .map((e, i) => ({
      name: (e.name || '').trim(),
      price: Number(e.price) || 0,
      price_unit: (e.unit || '').trim() || null,
      position: i,
    }))
    .filter((e) => e.name);

  const { error: delErr } = await supabaseAdmin
    .from('service_extras')
    .delete()
    .eq('service_id', input.serviceId)
    .eq('organization_id', orgId);
  if (delErr) {
    console.error('Failed to clear extras:', delErr);
    throw new Error('Failed to save extras');
  }

  if (clean.length > 0) {
    const { error: insErr } = await supabaseAdmin
      .from('service_extras')
      .insert(clean.map((e) => ({ ...e, organization_id: orgId, service_id: input.serviceId })));
    if (insErr) {
      console.error('Failed to save extras:', insErr);
      throw new Error('Failed to save extras');
    }
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'service',
    entityId: input.serviceId,
    action: 'extras_updated',
    actorId: actorId ?? undefined,
    payload: { count: clean.length },
  });

  revalidatePath(`/services/${input.serviceId}`);
  return { ok: true };
}

// ── Services' own settings ──────────────────────────────────────────────────
// A module owns its configuration. These are studio-wide but only meaningful to
// Services, so Services owns reading and writing them; the organization row is
// just where the bag is kept.

export type ServiceDefaults = { paymentPolicy: PaymentPolicy; depositPercentage: number };

export async function getServiceDefaults(): Promise<ServiceDefaults> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('metadata')
    .eq('id', orgId)
    .maybeSingle();
  const bag = ((data?.metadata as any)?.services) || {};
  const pct = Number(bag.deposit_percentage);
  return {
    paymentPolicy: bag.payment_policy === 'full' ? 'full' : 'deposit',
    depositPercentage: Number.isFinite(pct) ? pct : 50,
  };
}

export async function setServiceDefaults(input: ServiceDefaults) {
  const { orgId } = await getAuthOrgId();
  const pct = Number(input.depositPercentage);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Deposit must be between 0 and 100.');
  const paymentPolicy: PaymentPolicy = input.paymentPolicy === 'full' ? 'full' : 'deposit';

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('metadata')
    .eq('id', orgId)
    .maybeSingle();

  const metadata = { ...((org?.metadata as any) || {}) };
  metadata.services = { ...(metadata.services || {}), payment_policy: paymentPolicy, deposit_percentage: pct };

  const { error } = await supabaseAdmin
    .from('organizations')
    .update({ metadata })
    .eq('id', orgId);
  if (error) throw new Error('Failed to save the default');

  revalidatePath('/services/settings');
  return { ok: true };
}
