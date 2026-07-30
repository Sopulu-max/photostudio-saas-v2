'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Public booking intake. A lead is a booking in `inquiry` status — no separate
 * intent entity. The system: finds-or-creates the contact, records them as a
 * client, and opens a booking with one line for the requested service.
 *
 * Public surface: the visitor is unauthenticated, so this uses the admin client
 * scoped to the org resolved from the page's slug (module interfaces assume an
 * authenticated operator).
 */
export async function submitBookingForm(
  orgId: string,
  serviceId: string,
  formData: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    customFields: Record<string, any>;
  }
) {
  const displayName = `${formData.firstName} ${formData.lastName}`.trim();

  // 1. Find or create the contact (kernel party)
  let contactId: string;
  const { data: existing } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('organization_id', orgId)
    .eq('email', formData.email)
    .maybeSingle();

  if (existing) {
    contactId = existing.id;
  } else {
    const { data: contact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .insert({
        organization_id: orgId,
        display_name: displayName,
        email: formData.email,
        phone: formData.phone || null,
      })
      .select('id')
      .single();
    if (contactError || !contact) {
      console.error('Error creating contact:', contactError);
      throw new Error('Failed to save your details.');
    }
    contactId = contact.id;
  }

  // 2. Record them as a client (idempotent — unique on org+contact)
  await supabaseAdmin
    .from('clients')
    .upsert(
      { organization_id: orgId, contact_id: contactId },
      { onConflict: 'organization_id,contact_id', ignoreDuplicates: true }
    );

  // 3. The service, for the line's snapshot and the booking title
  const { data: service } = await supabaseAdmin
    .from('services')
    .select('id, name, pricing')
    .eq('id', serviceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!service) throw new Error('This service is no longer available.');

  // 4. The booking lands on the studio's first enquiry-kind stage — whatever
  //    they have chosen to call it.
  // Prefer an enquiry-kind stage, but never REQUIRE one — a studio may not use
  // that idea at all. Fall back to their default stage, then to the first.
  const { data: stages } = await supabaseAdmin
    .from('booking_stages')
    .select('id, kind, is_default, position')
    .eq('organization_id', orgId)
    .order('position');
  const landingStage =
    (stages || []).find((s: any) => s.kind === 'enquiry') ||
    (stages || []).find((s: any) => s.is_default) ||
    (stages || [])[0];
  if (!landingStage) throw new Error('This studio has no booking stages configured.');

  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .insert({
      organization_id: orgId,
      contact_id: contactId,
      title: `${displayName} — ${service.name}`,
      stage_id: landingStage.id,
      metadata: { source: 'public_booking_page', form_responses: formData.customFields },
    })
    .select('id')
    .single();
  if (bookingError || !booking) {
    console.error('Error creating booking:', bookingError);
    throw new Error('Failed to create your booking request.');
  }

  // 5. One line for the requested service
  await supabaseAdmin.from('booking_lines').insert({
    organization_id: orgId,
    booking_id: booking.id,
    service_id: service.id,
    title: service.name,
    price: service.pricing || {},
  });

  // 6. Organizational memory
  await supabaseAdmin.from('events').insert({
    organization_id: orgId,
    entity_type: 'booking',
    entity_id: booking.id,
    action: 'created',
    actor_id: contactId,
    payload: { source: 'public_booking_page', serviceId: service.id },
  });

  return { success: true, bookingId: booking.id };
}
