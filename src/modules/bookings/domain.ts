'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { logEvent } from '@/lib/actions/events';
import { getService, getProductionPlanForService } from '@/modules/services/interface';
import { draftContractForBooking } from '@/modules/contracts/interface';
import { raiseInvoiceForBooking } from '@/modules/finances/interface';
import { startWorkForBookingLine } from '@/modules/production/interface';
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
    .insert({ organization_id: orgId, title, status: 'draft' })
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
 * Attach (or change) the client on a booking, by contact id — the kernel-level
 * reference (à la sale.order.partner_id → res.partner). While Contracts and
 * kernel-level reference (à la sale.order.partner_id → res.partner).
 * contact's backfill link so those flows keep working mid-migration.
 */
export async function setBookingClient(input: { bookingId: string; contactId: string }) {
  const { orgId, personId: actorId } = await getAuthOrgId();

  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id, display_name, metadata')
    .eq('id', input.contactId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!contact) throw new Error('Contact not found');


  const { error } = await supabaseAdmin
    .from('bookings')
    .update({ contact_id: contact.id })
    .eq('id', input.bookingId)
    .eq('organization_id', orgId);
  if (error) {
    console.error('Failed to set booking client:', error);
    throw new Error('Failed to set the client');
  }

  await logEvent({
    organizationId: orgId,
    entityType: 'booking',
    entityId: input.bookingId,
    action: 'client_set',
    actorId: actorId ?? undefined,
    payload: { contactId: contact.id, name: contact.display_name },
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { ok: true };
}

/**
 * Add a service line to a booking. Optionally seeded from a service template
 * (which carries its price snapshot); or a free-form custom line.
 */
export async function addBookingLine(input: {
  bookingId: string;
  serviceId?: string | null;
  title: string;
  price?: Record<string, unknown>;
}) {
  const { orgId, personId } = await getAuthOrgId();

  // If seeded from a service, snapshot its pricing/title now — asked of the
  // Services module, not read from its tables.
  let title = (input.title || '').trim();
  let price = input.price ?? {};
  if (input.serviceId) {
    const svc = await getService(input.serviceId);
    if (svc) {
      if (!title) title = svc.name;
      if (!input.price) price = (svc.pricing as Record<string, unknown>) || {};
    }
  }
  if (!title) throw new Error('A line needs a name.');

  const { data: line, error } = await supabaseAdmin
    .from('booking_lines')
    .insert({
      organization_id: orgId,
      booking_id: input.bookingId,
      service_id: input.serviceId ?? null,
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
    .select('id, contact_id')
    .eq('id', bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!booking) throw new Error('Booking not found');
  if (!booking.contact_id) throw new Error('Add a client to this booking before creating a contract.');

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

  // Ask the Contracts module to draft it — Bookings never writes that table.
  const { contractId } = await draftContractForBooking({
    organizationId: orgId,
    bookingId,
    contactId: booking.contact_id,
    terms,
    actorId: personId,
  });

  revalidatePath(`/bookings/${bookingId}`);
  return { contractId };
}

/**
 * Raise an invoice on a booking — no contract required (unlocked). Amount and
 * label are whatever the studio wants (deposit, balance, a one-off).
 */
export async function addInvoiceToBooking(input: { bookingId: string; label: string; amount: number; currency?: string }) {
  const { orgId, personId } = await getAuthOrgId();

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('id, contact_id')
    .eq('id', input.bookingId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!booking) throw new Error('Booking not found');

  // Ask Finances to raise it — Bookings never writes the money table.
  const { transactionId: txId } = await raiseInvoiceForBooking({
    organizationId: orgId,
    bookingId: input.bookingId,
    contactId: booking.contact_id ?? null,
    label: input.label,
    amount: input.amount,
    currency: input.currency,
    actorId: personId,
  });
  const tx = { id: txId };
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
    .select('id, service_id')
    .eq('id', input.lineId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!line) throw new Error('Line not found');

  // Ask the Services module for this line's production plan — never read its
  // services/blueprints tables from here (seam discipline).
  const plan = line.service_id
    ? await getProductionPlanForService(line.service_id)
    : { blueprintId: null, stages: [] };

  // Production owns the work — Bookings asks, it doesn't write workflows/tasks.
  const { workflowId } = await startWorkForBookingLine({
    bookingId: input.bookingId,
    lineId: input.lineId,
    blueprintId: plan.blueprintId,
    stages: plan.stages,
  });

  revalidatePath(`/bookings/${input.bookingId}`);
  return { workflowId };
}
