'use server';

import { supabaseAdmin } from '../supabase/admin';
import { getAuthOrgId } from '../supabase/getOrgId';
import { logEvent } from './events';
import { revalidatePath } from 'next/cache';

/**
 * Create a booking. A title alone is enough — everything else (client, lines,
 * contract, money, work) associates later, in any order. This is the hub that
 * independent things cohere around, not a wizard step.
 */
export async function createBooking(input: { title: string; personId?: string | null }) {
  const { orgId, personId } = await getAuthOrgId();
  const title = (input.title || '').trim();
  if (!title) throw new Error('A booking needs a title.');

  const { data: booking, error } = await supabaseAdmin
    .from('bookings')
    .insert({ organization_id: orgId, title, person_id: input.personId ?? null, status: 'draft' })
    .select()
    .single();

  if (error || !booking) {
    console.error('Failed to create booking:', error);
    throw new Error('Failed to create booking');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking',
    entityId: booking.id,
    action: 'created',
    actorId: personId ?? undefined,
    payload: { title },
  });

  revalidatePath('/bookings');
  return { bookingId: booking.id };
}

/**
 * Add a service line to a booking. Optionally seeded from a service template
 * (which carries its price snapshot); or a free-form custom line.
 */
export async function addBookingLine(input: {
  bookingId: string;
  serviceTemplateId?: string | null;
  title: string;
  price?: Record<string, unknown>;
}) {
  const { orgId, personId } = await getAuthOrgId();

  // If seeded from a service, snapshot its pricing/title now.
  let title = (input.title || '').trim();
  let price = input.price ?? {};
  if (input.serviceTemplateId) {
    const { data: svc } = await supabaseAdmin
      .from('service_templates')
      .select('name, pricing')
      .eq('organization_id', orgId)
      .eq('id', input.serviceTemplateId)
      .maybeSingle();
    if (svc) {
      if (!title) title = svc.name;
      if (!input.price) price = svc.pricing || {};
    }
  }
  if (!title) throw new Error('A line needs a name.');

  const { data: line, error } = await supabaseAdmin
    .from('booking_lines')
    .insert({
      organization_id: orgId,
      booking_id: input.bookingId,
      service_template_id: input.serviceTemplateId ?? null,
      title,
      price,
    })
    .select()
    .single();

  if (error || !line) {
    console.error('Failed to add booking line:', error);
    throw new Error('Failed to add line');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking_line',
    entityId: line.id,
    action: 'created',
    actorId: personId ?? undefined,
    payload: { bookingId: input.bookingId, title },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { lineId: line.id };
}

/**
 * Manually create a proposed contract for a booking — no intent required (the
 * kernel is unlocked). Terms are summed from the booking's lines. A contract
 * needs a party, so the booking must have a client.
 */
export async function createContractForBooking(bookingId: string) {
  const { orgId, personId } = await getAuthOrgId();

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, person_id')
    .eq('id', bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!booking) throw new Error('Booking not found');
  if (!booking.person_id) throw new Error('Add a client to this booking before creating a contract.');

  const { data: lines } = await supabaseAdmin
    .from('booking_lines')
    .select('price')
    .eq('booking_id', bookingId)
    .eq('organization_id', orgId);

  let total = 0;
  let currency = 'USD';
  for (const l of lines || []) {
    const p: any = l.price || {};
    total += Number(p.base_price || 0);
    if (p.currency) currency = p.currency;
  }
  const terms = { base_price: total, deposit_percentage: 0, currency };

  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .insert({ organization_id: orgId, booking_id: bookingId, intent_id: null, person_id: booking.person_id, terms, status: 'proposed' })
    .select('id')
    .single();
  if (error || !contract) {
    console.error('Failed to create contract for booking:', error);
    throw new Error('Failed to create contract');
  }

  await logEvent({ organizationId: orgId, entityType: 'contract', entityId: contract.id, action: 'created', actorId: personId ?? undefined, payload: { bookingId, source: 'booking_hub' } });
  revalidatePath(`/bookings/${bookingId}`);
  return { contractId: contract.id };
}

/**
 * Raise an invoice on a booking — no contract required (unlocked). Amount and
 * label are whatever the studio wants (deposit, balance, a one-off).
 */
export async function addInvoiceToBooking(input: { bookingId: string; label: string; amount: number; currency?: string }) {
  const { orgId, personId } = await getAuthOrgId();

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, person_id')
    .eq('id', input.bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!booking) throw new Error('Booking not found');

  const amount = Number(input.amount);
  if (!amount || amount <= 0) throw new Error('Enter an amount.');

  const { data: tx, error } = await supabaseAdmin
    .from('financial_transactions')
    .insert({
      organization_id: orgId,
      booking_id: input.bookingId,
      person_id: booking.person_id ?? null,
      contract_id: null,
      direction: 'inbound',
      type: (input.label || '').trim() || 'invoice',
      amount,
      currency: input.currency || 'USD',
      status: 'pending',
    })
    .select('id')
    .single();
  if (error || !tx) {
    console.error('Failed to raise invoice:', error);
    throw new Error('Failed to raise invoice');
  }

  await logEvent({ organizationId: orgId, entityType: 'financial_transaction', entityId: tx.id, action: 'created', actorId: personId ?? undefined, payload: { bookingId: input.bookingId, amount } });
  revalidatePath(`/bookings/${input.bookingId}`);
  return { transactionId: tx.id };
}

/**
 * Start work on a line — create its workflow when the studio chooses, no active
 * contract required (unlocked). Seeds tasks from the line's service blueprint if
 * one is attached.
 */
export async function startWorkForLine(input: { bookingId: string; lineId: string }) {
  const { orgId, personId } = await getAuthOrgId();

  const { data: line } = await supabaseAdmin
    .from('booking_lines')
    .select('id, service_template_id')
    .eq('id', input.lineId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!line) throw new Error('Line not found');

  let templateId: string | null = null;
  if (line.service_template_id) {
    const { data: svc } = await supabaseAdmin
      .from('service_templates')
      .select('default_workflow_template_id')
      .eq('id', line.service_template_id)
      .maybeSingle();
    templateId = svc?.default_workflow_template_id ?? null;
  }

  const { data: workflow, error } = await supabaseAdmin
    .from('workflows')
    .insert({ organization_id: orgId, booking_id: input.bookingId, booking_line_id: input.lineId, contract_id: null, template_id: templateId, status: 'created' })
    .select('id')
    .single();
  if (error || !workflow) {
    console.error('Failed to start work:', error);
    throw new Error('Failed to start work');
  }

  await logEvent({ organizationId: orgId, entityType: 'workflow', entityId: workflow.id, action: 'created', actorId: personId ?? undefined, payload: { bookingId: input.bookingId, lineId: input.lineId, trigger: 'manual_start' } });

  if (templateId) {
    const { data: tmpl } = await supabaseAdmin.from('workflow_templates').select('stages').eq('id', templateId).maybeSingle();
    const stages: any[] = (tmpl?.stages as any[]) || [];
    for (const [i, stage] of stages.entries()) {
      const { data: task } = await supabaseAdmin
        .from('tasks')
        .insert({ organization_id: orgId, workflow_id: workflow.id, stage_name: stage.name, stage_order: i })
        .select('id')
        .single();
      if (task) {
        await logEvent({ organizationId: orgId, entityType: 'task', entityId: task.id, action: 'created', actorId: personId ?? undefined, payload: { workflowId: workflow.id, stageName: stage.name } });
      }
    }
  }

  revalidatePath(`/bookings/${input.bookingId}`);
  return { workflowId: workflow.id };
}
