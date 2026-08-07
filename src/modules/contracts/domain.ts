'use server';

import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { revalidatePath } from 'next/cache';
import type { Contract } from '@/lib/types/engine';

const ActivateContractSchema = z.object({
  contractId: z.string().uuid(),
  organizationId: z.string().uuid(),
  actorId: z.string().uuid(),
});

// ── The studio's own contract language ───────────────────────────────────
// A price and a deposit percentage are payment terms, not a contract. The
// actual agreement — payment schedule, cancellation policy, usage rights,
// whatever a given studio's business actually requires — is text the studio
// writes itself. No default text is assumed here; an empty template prompts
// the studio to write their own rather than silently shipping generic
// legalese nobody reviewed.

/**
 * Every contract, newest first — the list surface. Carries the party and the
 * booking it belongs to, so a row reads without opening it.
 */
export async function listContracts() {
  const { orgId } = await getAuthOrgId();
  const { data, error } = await supabaseAdmin
    .from('contracts')
    .select('id, version, status, terms, created_at, person:contacts(display_name), booking:bookings(id, title)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to list contracts:', error);
    return [];
  }
  return (data || []) as any[];
}

/** One contract, with its party and booking. Null when it isn't this studio's. */
export async function getContract(contractId: string) {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin
    .from('contracts')
    .select('id, version, status, terms, created_at, person:contacts(display_name, email), booking:bookings(id, title)')
    .eq('id', contractId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return (data as any) ?? null;
}

export async function getContractTermsTemplate(): Promise<string> {
  const { orgId } = await getAuthOrgId();
  const { data } = await supabaseAdmin.from('organizations').select('metadata').eq('id', orgId).maybeSingle();
  return ((data?.metadata as any)?.contracts?.terms_template as string) || '';
}

export async function setContractTermsTemplate(text: string) {
  const { orgId } = await getAuthOrgId();
  const { data: org } = await supabaseAdmin.from('organizations').select('metadata').eq('id', orgId).maybeSingle();
  const metadata = { ...((org?.metadata as any) || {}) };
  metadata.contracts = { ...(metadata.contracts || {}), terms_template: text };

  const { error } = await supabaseAdmin.from('organizations').update({ metadata }).eq('id', orgId);
  if (error) throw new Error('Failed to save the contract terms');

  revalidatePath('/contracts/settings');
  return { ok: true };
}

/**
 * Draft a contract for a booking — the composition path. The party is a kernel
 * contact; financial terms are whatever the booking's lines add up to.
 * Agreement text comes from the studio's own template, snapshotted at draft
 * time — like price, it won't silently change if the studio edits their
 * template later.
 */
export async function draftContractForBooking(input: {
  organizationId: string;
  bookingId: string;
  contactId: string;
  terms: Record<string, unknown>;
  actorId?: string | null;
}) {
  const { data: org } = await supabaseAdmin.from('organizations').select('metadata').eq('id', input.organizationId).maybeSingle();
  const agreementText = ((org?.metadata as any)?.contracts?.terms_template as string) || '';

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .insert({
      organization_id: input.organizationId,
      booking_id: input.bookingId,
      contact_id: input.contactId,
      terms: { ...input.terms, agreement_text: agreementText },
      status: 'proposed',
    })
    .select('id')
    .single();

  if (error || !contract) {
    console.error('Failed to draft contract for booking:', error);
    throw new Error('Failed to create contract');
  }

  await logEvent({
    organizationId: input.organizationId,
    entityType: 'contract',
    entityId: contract.id,
    action: 'created',
    actorId: input.actorId ?? undefined,
    payload: { bookingId: input.bookingId, source: 'booking_hub' },
  });

  return { contractId: contract.id };
}

export async function activateContract(input: z.infer<typeof ActivateContractSchema> | string) {
  // Support both object and plain string (contractId) for backward compat
  const rawInput = typeof input === 'string'
    ? { contractId: input, organizationId: '', actorId: '' }
    : input;

  // If called with just a string ID (legacy), fetch org from contract
  let params: z.infer<typeof ActivateContractSchema>;
  if (typeof input === 'string') {
    const { data: ag } = await supabaseAdmin
      .from('contracts')
      .select('organization_id, contact_id')
      .eq('id', input)
      .single();
    if (!ag) throw new Error('Contract not found');
    params = { contractId: input, organizationId: ag.organization_id, actorId: ag.contact_id };
  } else {
    params = ActivateContractSchema.parse(input);
  }

  // STATE MACHINE GUARD
  const { data: currentContract, error: fetchError } = await supabaseAdmin
    .from('contracts')
    .select('status, contact_id')
    .eq('id', params.contractId)
    .single();

  if (fetchError || !currentContract) {
    throw new Error('Contract not found');
  }

  if (!['proposed', 'modified'].includes(currentContract.status)) {
    throw new Error(`Illegal state transition. Cannot activate an contract in '${currentContract.status}' state.`);
  }

  // Activate contract
  const { data: contract, error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({
      status: 'active',
      signed_at: new Date().toISOString()
    })
    .eq('id', params.contractId)
    .select()
    .single();

  if (updateError) {
    console.error('Failed to activate contract:', updateError);
    throw new Error('Failed to activate contract');
  }

  // Emit event for the contract activation itself
  await logEvent({
    organizationId: params.organizationId,
    entityType: 'contract',
    entityId: contract.id,
    action: 'activated',
    actorId: params.actorId,
    payload: { signed_at: contract.signed_at, previous_status: currentContract.status }
  });

  // No automatic spawning. Activating a contract only marks it active and
  // signed — it does not conjure a workflow, tasks, or an invoice. Not every
  // studio wants the "next thing" created for them; they add work or money from
  // the booking when and if they choose. (Composition, not orchestration.)
  return contract as Contract;
}

/**
 * Change price, deposit, and/or the agreement text itself. A contract that
 * hasn't been signed yet (proposed) is edited in place — nothing to protect.
 * One that's already active gets versioned: the change moves it to
 * 'modified' and clears signed_at, because the client agreed to specific
 * numbers AND specific words — either changing means it needs to go back
 * through Activate (re-signing) before it counts again.
 */
export async function reviseContractTerms(input: {
  contractId: string;
  organizationId: string;
  actorId?: string | null;
  basePrice?: number;
  depositPercentage?: number;
  agreementText?: string;
}) {
  const { data: existing } = await supabaseAdmin
    .from('contracts')
    .select('id, status, version, terms')
    .eq('id', input.contractId)
    .eq('organization_id', input.organizationId)
    .maybeSingle();
  if (!existing) throw new Error('Contract not found');
  if (['completed', 'cancelled'].includes(existing.status)) {
    throw new Error(`Can't change terms on a ${existing.status} contract.`);
  }

  const terms: any = { ...(existing.terms as any) };
  if (input.basePrice !== undefined) terms.base_price = input.basePrice;
  if (input.depositPercentage !== undefined) terms.deposit_percentage = input.depositPercentage;
  if (input.agreementText !== undefined) terms.agreement_text = input.agreementText;

  const wasActive = existing.status === 'active';
  const patch: Record<string, unknown> = { terms };
  if (wasActive) {
    patch.status = 'modified';
    patch.version = (existing.version ?? 1) + 1;
    patch.signed_at = null;
  }

  const { error } = await supabaseAdmin
    .from('contracts')
    .update(patch)
    .eq('id', input.contractId)
    .eq('organization_id', input.organizationId);
  if (error) {
    console.error('Failed to revise contract terms:', error);
    throw new Error('Failed to save the terms');
  }

  await logEvent({
    organizationId: input.organizationId,
    entityType: 'contract',
    entityId: input.contractId,
    action: 'terms_revised',
    actorId: input.actorId ?? undefined,
    payload: { terms, wasActive },
  });

  return { ok: true };
}

/**
 * Void a contract. Never deletes — the record and its history (any invoices
 * already raised against it) stay exactly as they are. The studio decides
 * separately what to do about the booking or any money already in motion;
 * cancelling a contract doesn't touch either. (Composition, not orchestration.)
 */
export async function cancelContract(input: { contractId: string; organizationId: string; actorId?: string | null }) {
  const { data: existing } = await supabaseAdmin
    .from('contracts')
    .select('id, status')
    .eq('id', input.contractId)
    .eq('organization_id', input.organizationId)
    .maybeSingle();
  if (!existing) throw new Error('Contract not found');
  if (['completed', 'cancelled'].includes(existing.status)) {
    throw new Error(`Contract is already ${existing.status}.`);
  }

  const { error } = await supabaseAdmin
    .from('contracts')
    .update({ status: 'cancelled' })
    .eq('id', input.contractId)
    .eq('organization_id', input.organizationId);
  if (error) throw new Error('Failed to cancel the contract');

  await logEvent({
    organizationId: input.organizationId,
    entityType: 'contract',
    entityId: input.contractId,
    action: 'cancelled',
    actorId: input.actorId ?? undefined,
    payload: { previousStatus: existing.status },
  });

  return { ok: true };
}
