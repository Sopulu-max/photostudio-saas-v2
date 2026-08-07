'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getIntakeQuestionsPublic } from '@/modules/packages/interface';
import { createBookingFromIntake } from '@/modules/bookings/interface';
import { validateAnswers, storeAnswers } from '@/modules/services/fieldTypes';

/**
 * Public booking intake — the outside world's way in. A lead is just a booking
 * on an early stage; there is no separate intent entity. This finds-or-creates
 * the contact, records them as a client, and hands the rest to Bookings.
 *
 * The visitor is unauthenticated, so the contact/client steps still use the
 * admin client scoped to the org resolved from the page's slug — the Clients
 * module's operations all assume a logged-in operator. The booking itself goes
 * through Bookings' own intake operation, which takes the org explicitly.
 */
export async function submitBookingForm(
  orgId: string,
  packageId: string,
  formData: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    customFields: Record<string, any>;
    tierIndex?: number;
    scheduledFor?: string;
  }
) {
  const displayName = `${formData.firstName} ${formData.lastName}`.trim();

  // 1. Find or create the contact (kernel party). Email is the primary match;
  // if it doesn't hit but a phone was given, try that too — a client who
  // mistypes or changes their email shouldn't fork into a second record.
  // (.limit(1) here is picking one candidate match, not blindly fetching an
  // organization — still scoped by organization_id above it.)
  let contactId: string;
  let existing = (
    await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('organization_id', orgId)
      .eq('email', formData.email)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
  ).data;
  if (!existing && formData.phone) {
    existing = (
      await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('phone', formData.phone)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
    ).data;
  }

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

  // 2. Record them as a client (idempotent — unique on org+contact). Always
  // set status active: a real new booking is unambiguous evidence they're
  // engaged again, so this also reactivates anyone the studio had archived —
  // leaving them archived while a live booking sits against them would be a
  // standing contradiction, not a studio decision worth preserving.
  await supabaseAdmin
    .from('clients')
    .upsert(
      { organization_id: orgId, contact_id: contactId, status: 'active' },
      { onConflict: 'organization_id,contact_id' }
    );

  // 3. Handle the package or custom enquiry
  let pkgName = 'Custom Enquiry';
  let linePrice = {};
  let storedAnswers: any = {};
  let resolvedPackageId: string | undefined = undefined;

  if (packageId === 'custom') {
    // For custom enquiries, the user just supplied a free-form message.
    storedAnswers = { message: formData.customFields?.message || '' };
  } else {
    // Standard package booking
    const { data: pkg } = await supabaseAdmin
      .from('packages')
      .select('id, name, pricing, pricing_variant')
      .eq('id', packageId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!pkg) throw new Error('This package is no longer available.');

    resolvedPackageId = pkg.id;
    pkgName = pkg.name;

    // Never trust the browser for price: re-look-up the chosen tier server-side.
    const variant = pkg.pricing_variant as { axis_label: string; tiers: { label: string; price: number }[] } | null;
    const chosenTier = variant && formData.tierIndex != null ? variant.tiers[formData.tierIndex] : null;
    linePrice = chosenTier
      ? { ...((pkg.pricing as any) || {}), base_price: chosenTier.price, unit: chosenTier.label }
      : (pkg.pricing || {});

    // Validate the answers against the package's own questions
    const questions = await getIntakeQuestionsPublic(pkg.id);
    const errors = validateAnswers(questions, formData.customFields || {});
    const firstError = Object.values(errors)[0];
    if (firstError) throw new Error(firstError);
    storedAnswers = storeAnswers(questions, formData.customFields || {});
  }

  // 4. The booking itself — asked of the Bookings module, not inserted here.
  // This is the same operation an operator's booking goes through, so intake
  // bookings are staged, named and logged by exactly the same rules.
  const { bookingId } = await createBookingFromIntake({
    organizationId: orgId,
    contactId,
    clientName: displayName,
    packageId: resolvedPackageId,
    packageName: pkgName,
    linePrice,
    answers: storedAnswers,
    source: 'public_booking_page',
    scheduledFor: formData.scheduledFor,
  });

  return { success: true, bookingId };
}
