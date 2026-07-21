'use server';

import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

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
  // We use supabaseAdmin here because this is a public form, the user is unauthenticated.
  // The system acts on their behalf to ingest the Intent.
  
  // 1. Find or create the Person
  let personId: string;
  const { data: existingPerson } = await supabaseAdmin
    .from('persons')
    .select('id')
    .eq('organization_id', orgId)
    .eq('email', formData.email)
    .maybeSingle();

  if (existingPerson) {
    personId = existingPerson.id;
  } else {
    const { data: newPerson, error: personError } = await supabaseAdmin
      .from('persons')
      .insert({
        organization_id: orgId,
        role: 'client',
        display_name: `${formData.firstName} ${formData.lastName}`.trim(),
        email: formData.email,
        phone: formData.phone || null,
        status: 'active',
        metadata: {},
      })
      .select('id')
      .single();

    if (personError) {
      console.error('Error creating person:', personError);
      throw new Error('Failed to create person record.');
    }
    personId = newPerson.id;
  }

  // 2. Create the Intent
  const { data: intent, error: intentError } = await supabaseAdmin
    .from('intents')
    .insert({
      organization_id: orgId,
      person_id: personId,
      source: 'public_booking_page',
      description: `Booking request for service ${serviceId}`,
      service_template_id: serviceId,
      status: 'created',
      // Store custom form responses in metadata
      metadata: { form_responses: formData.customFields },
    })
    .select('id')
    .single();

  if (intentError) {
    console.error('Error creating intent:', intentError);
    throw new Error('Failed to create booking intent.');
  }

  return { success: true, intentId: intent.id };
}
