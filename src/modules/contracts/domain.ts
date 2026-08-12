'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/kernel/events';
import { revalidatePath } from 'next/cache';
import type { Contract } from '@/lib/types/engine';

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
/**
 * Drafting from a booking. Composition-only: the sole caller is the Bookings
 * module, which already resolved the studio from the session, so the org is
 * passed along rather than looked up twice. Nothing reachable from a browser
 * calls this — if anything ever does, it needs the session treatment the other
 * three got.
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

/**
 * The one place a contract becomes active. Both doors below go through here.
 *
 * `orgId` is never taken from a caller — each door works it out for itself, so
 * the update below can be scoped by it. It previously was not: the write said
 * `.eq('id', contractId)` and nothing else, which meant a contract id was
 * enough to activate a contract belonging to any studio.
 */
async function applyActivation(args: {
  contractId: string;
  orgId: string;
  actorId: string | null;
  signature?: { name?: string; dataUrl?: string } | null;
}): Promise<Contract> {
  const { data: current, error: fetchError } = await supabaseAdmin
    .from('contracts')
    .select('status, contact_id, terms')
    .eq('id', args.contractId)
    .eq('organization_id', args.orgId)
    .maybeSingle();

  if (fetchError || !current) throw new Error('Contract not found');

  if (!['proposed', 'modified'].includes(current.status)) {
    throw new Error(`Illegal state transition. Cannot activate a contract in '${current.status}' state.`);
  }

  const signedAt = new Date().toISOString();
  const patch: Record<string, unknown> = { status: 'active', signed_at: signedAt };

  if (args.signature?.name || args.signature?.dataUrl) {
    patch.terms = {
      ...((current.terms as any) || {}),
      signature: { name: args.signature.name, dataUrl: args.signature.dataUrl, timestamp: signedAt },
    };
  }

  const { data: contract, error: updateError } = await supabaseAdmin
    .from('contracts')
    .update(patch)
    .eq('id', args.contractId)
    .eq('organization_id', args.orgId)
    .select()
    .single();

  if (updateError) {
    console.error('Failed to activate contract:', updateError);
    throw new Error('Failed to activate contract');
  }

  await logEvent({
    organizationId: args.orgId,
    entityType: 'contract',
    entityId: contract.id,
    action: 'activated',
    actorId: args.actorId ?? undefined,
    payload: {
      signed_at: contract.signed_at,
      previous_status: current.status,
      signed: Boolean(patch.terms),
    },
  });

  revalidatePath(`/contracts/${args.contractId}`);
  // No automatic spawning. Activating a contract only marks it active and
  // signed — it does not conjure a workflow, tasks, or an invoice. Not every
  // studio wants the "next thing" created for them; they add work or money from
  // the booking when and if they choose. (Composition, not orchestration.)
  return contract as Contract;
}

/**
 * The studio marking a contract active itself — agreed over the phone, signed
 * on paper, whatever happened outside the app.
 *
 * Takes nothing but the contract. The organization and the actor come from the
 * session; they used to be parameters supplied by a browser component, which
 * meant the log recorded whoever the browser named.
 */
export async function activateContract(input: { contractId: string }) {
  const { orgId, personId } = await getAuthOrgId();
  return applyActivation({ contractId: input.contractId, orgId, actorId: personId, signature: null });
}

/**
 * The client signing on their own link.
 *
 * There is no session here, so nothing can be read from one — but nothing is
 * accepted from the caller either. The contract id is the capability, exactly
 * as a share token is for a gallery, and the organization and the signer are
 * read off the contract itself. That is what makes this safe to expose: the
 * only thing a caller can influence is *which* contract, and knowing an id
 * they were sent is the whole point.
 */
export async function signContract(input: {
  contractId: string;
  signatureName: string;
  signatureDataUrl: string;
}): Promise<Contract> {
  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select('id, organization_id, contact_id')
    .eq('id', input.contractId)
    .maybeSingle();
  if (!contract) throw new Error('Contract not found');

  if (!input.signatureName?.trim()) throw new Error('A signature needs a name.');

  return applyActivation({
    contractId: contract.id,
    orgId: contract.organization_id,
    // The client is the actor: their signature is what activated it.
    actorId: contract.contact_id,
    signature: { name: input.signatureName.trim(), dataUrl: input.signatureDataUrl },
  });
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
  basePrice?: number;
  depositPercentage?: number;
  agreementText?: string;
}) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: existing } = await supabaseAdmin
    .from('contracts')
    .select('id, status, version, terms')
    .eq('id', input.contractId)
    .eq('organization_id', orgId)
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
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to revise contract terms:', error);
    throw new Error('Failed to save the terms');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'contract',
    entityId: input.contractId,
    action: 'terms_revised',
    actorId: actorId ?? undefined,
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
export async function cancelContract(input: { contractId: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: existing } = await supabaseAdmin
    .from('contracts')
    .select('id, status')
    .eq('id', input.contractId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!existing) throw new Error('Contract not found');
  if (['completed', 'cancelled'].includes(existing.status)) {
    throw new Error(`Contract is already ${existing.status}.`);
  }

  const { error } = await supabaseAdmin
    .from('contracts')
    .update({ status: 'cancelled' })
    .eq('id', input.contractId)
    .eq('organization_id', orgId);
  if (error) throw new Error('Failed to cancel the contract');

  await logEvent({
    organizationId: orgId,
    entityType: 'contract',
    entityId: input.contractId,
    action: 'cancelled',
    actorId: actorId ?? undefined,
    payload: { previousStatus: existing.status },
  });

  return { ok: true };
}
