'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  answerPackageClassifications, getIntakeQuestionsPublic, getPackagePublic,
  getOpenVariablesForPackagePublic, getOpenClassificationsForPackagePublic,
  instantiatePackageForBooking,
} from '@/modules/packages/interface';
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
/**
 * What a package asks of whoever books it.
 *
 * The package page loads these three on the server, because it knows which
 * package it is before it renders. The custom path does not: a client describes
 * what they want and MAY then pick one of the matches, at which point the same
 * three questions become due — and there is no second page load to fetch them
 * on. So the form asks for them the moment a match is chosen.
 *
 * WHY THIS EXISTS AT ALL. Matching a package on the custom path already went
 * down the full package branch of submitBookingForm — instance, classifications
 * and all — while the form went on rendering the custom questions, because
 * `isCustom` describes which page you started on, not what you ended up
 * booking. So a matched package was booked without being asked any of its own
 * questions: its intake form went unanswered, its open classifications went
 * unnarrowed, its declared variables went unset. And a package with a REQUIRED
 * question was worse than incomplete — validateAnswers refused answers that had
 * never been collected, and the booking failed outright with "Failed to submit
 * booking. Please try again." every time, with nothing the client could do
 * about it.
 *
 * One round trip rather than three, since the client is waiting on it.
 */
export async function getPackageIntakePublic(orgId: string, packageId: string) {
  const [pkg, openVariables, openClassifications] = await Promise.all([
    getPackagePublic(orgId, packageId),
    getOpenVariablesForPackagePublic(orgId, packageId),
    getOpenClassificationsForPackagePublic(orgId, packageId),
  ]);
  // A package that is no longer on offer asks nothing; submit refuses it
  // separately, and by its own rule rather than by this one's silence.
  if (!pkg) return { formSchema: [], openVariables: [], openClassifications: [] };

  return {
    formSchema: pkg.formSchema || [],
    openVariables,
    openClassifications,
  };
}

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
    /**
     * One value per classification the package left open.
     *
     * Not stored beside the booking: they narrow the booking's own instance of
     * the package, because "this booking is for a birthday" is a fact about
     * what was booked rather than an annotation on it. Every later read — the
     * booking page, the invoice, the work board — then sees a package for a
     * birthday without knowing anything about how it got narrowed.
     */
    chosenClassifications?: string[];
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
     * A client who came the custom way said something before they matched.
     *
     * storeAnswers keeps only what the package asked, which is right — it is
     * what stops a removed question's answer lingering. But a booking that
     * started as "tell us what you want" carries a sentence and a set of
     * answers that no package asked and that are the whole reason this package
     * was matched. Dropping them would lose the client's own words at exactly
     * the moment the studio most needs them, so they are kept beside the
     * package's answers, in the same shape a pure enquiry stores them.
     */
    if (formData.fromCustomPath) {
      const message = (formData.customFields?.message || '').trim();
      const dimensions = formData.customFields?.dimensions;
      if (message) storedAnswers.message = message;
      if (dimensions && Object.keys(dimensions).length > 0) storedAnswers.dimensions = dimensions;
    }

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

    /*
     * The instance is narrowed to what the client chose.
     *
     * One step further down the same chain the studio walks: the domain
     * declares five occasions, the package narrows to three, and this narrows
     * to the one. Nothing else in the app has to learn a new idea for it —
     * a booking classified Birthday looks exactly like a package classified
     * Birthday, which it now is.
     */
    if (formData.chosenClassifications?.length) {
      await answerPackageClassifications({
        packageId: instance.packageId,
        organizationId: orgId,
        valueIds: formData.chosenClassifications,
      });
    }
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
