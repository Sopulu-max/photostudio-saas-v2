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

export async function createService(input: {
  name: string;
  description?: string;
  basePrice?: number;
  depositPercentage?: number;
  durationMinutes?: number | null;
  priceUnit?: string | null;
  blueprintId?: string | null;
  formSchema?: any[];
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();
  const name = (input.name || '').trim();
  if (!name) throw new Error('A service needs a name.');

  // The studio bills in one currency — read it rather than defaulting to USD.
  const currency = await getStudioCurrency();
  const pricing = {
    base_price: input.basePrice ?? 0,
    currency,
    deposit_percentage: input.depositPercentage ?? 0,
  };

  const { data: service, error } = await supabaseAdmin
    .from('services')
    .insert({
      organization_id: orgId,
      name,
      description: input.description || null,
      pricing,
      default_blueprint_id: input.blueprintId || null,
      duration_minutes: input.durationMinutes ?? null,
      price_unit: (input.priceUnit || '').trim() || null,
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
    .select('id, name, description, pricing, status, duration_minutes, price_unit, default_blueprint_id, blueprint:blueprints(id, name)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to list services:', error);
    throw new Error('Failed to load services');
  }
  return data || [];
}

/** A single service's sellable detail — what Bookings needs to build a line. */
export async function getService(serviceId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('services')
    .select('id, name, pricing, duration_minutes, price_unit')
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
  depositPercentage?: number | null;
  durationMinutes?: number | null;
  priceUnit?: string | null;
  blueprintId?: string | null;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: existing } = await supabaseAdmin
    .from('services')
    .select('id, name, pricing, duration_minutes, price_unit')
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

  if (input.basePrice !== undefined || input.depositPercentage !== undefined) {
    const pricing: any = { ...(existing.pricing as any) };
    if (input.basePrice !== undefined) pricing.base_price = input.basePrice ?? 0;
    if (input.depositPercentage !== undefined) pricing.deposit_percentage = input.depositPercentage ?? 0;
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
