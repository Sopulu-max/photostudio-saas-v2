'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getIntakeQuestionsPublic, getPackagePublic, instantiatePackageForBooking } from '@/modules/packages/interface';
import { createBookingFromIntake } from '@/modules/bookings/interface';
import { findOrCreateClientPublic } from '@/modules/clients/interface';
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
    /** Answers to variables the package left open — structured, unlike customFields. */
    variableAnswers?: { serviceVariableId: string; value: unknown }[];
    tierIndex?: number;
    scheduledFor?: string;
    fromCustomPath?: boolean;
  }
) {
  const displayName = `${formData.firstName} ${formData.lastName}`.trim();

  // 1 & 2. Find or create the contact and record them as a client.
  // The Clients module handles identity (on the contact) and CRM status (on the client).
  const { contactId } = await findOrCreateClientPublic(orgId, {
    name: displayName,
    email: formData.email,
    phone: formData.phone || undefined,
  });

  // 3. Handle the package or custom enquiry
  let pkgName = 'Custom Enquiry';
  let linePrice: Record<string, unknown> = {};
  let storedAnswers: any = {};
  let resolvedPackageId: string | undefined = undefined;

  if (packageId === 'custom') {
    // Client described what they want in their own words. The studio reviews
    // this, creates the right package internally if needed, and responds.
    storedAnswers = {
      message: formData.customFields?.message || '',
      dimensions: formData.customFields?.dimensions || {}
    };
  } else {
    // Standard package booking
    const pkg = await getPackagePublic(orgId, packageId);
    if (!pkg) throw new Error('This package is no longer available.');

    pkgName = pkg.name;

    // Validate the answers against the package's own questions
    const questions = await getIntakeQuestionsPublic(pkg.id);
    const errors = validateAnswers(questions, formData.customFields || {});
    const firstError = Object.values(errors)[0];
    if (firstError) throw new Error(firstError);
    storedAnswers = storeAnswers(questions, formData.customFields || {});

    /*
     * The booking gets its own instance of the package, exactly as an
     * internally-made booking does. Asked of Packages rather than done here:
     * a booking on the public page used to point straight at the catalog row,
     * so the studio editing its own catalog silently rewrote what a client had
     * already been quoted — and the intake step wrote back over that row too.
     *
     * The org is passed because this visitor has no session; Packages still
     * checks the package belongs to the studio whose page this is.
     */
    const instance = await instantiatePackageForBooking({
      packageId: pkg.id,
      organizationId: orgId,
    });
    resolvedPackageId = instance.packageId;
    pkgName = instance.name;
    linePrice = instance.price;
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
    variableAnswers: formData.variableAnswers,
    source: 'public_booking_page',
    scheduledFor: formData.scheduledFor,
  });

  return { success: true, bookingId };
}
