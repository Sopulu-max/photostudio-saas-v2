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
