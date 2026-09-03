import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * A CLIENT WHO DID NOT PICK A PACKAGE.
 *
 * The public page offers two ways in: pick a package, or describe what you want
 * and let the studio work it out. The second one used to fabricate a booking
 * line — package_id NULL, title 'Custom Enquiry', price '{}' — which asserted
 * that a specific package had been taken on when none had.
 *
 * That cost more than a wrong-looking row. Everything this app knows how to do
 * with a booking hangs off the package its line points at: services,
 * classifications, variables, deliverables, price, the work. So the line
 * rendered as a card reading "Services: None" carrying none of it. And because
 * the booking now HAD a line, it was never in the "nothing on this booking yet"
 * state — the only place the control for building a package out of an enquiry
 * was rendered. The bridge from a custom enquiry into the rest of the app
 * existed, and was unreachable for exactly the bookings it was built for.
 *
 * What is pinned here is that chain: an enquiry books nothing, an enquiry can
 * still be read back, and building a package from one lands a real line that
 * everything downstream can work with. Plus the case that has nothing to build
 * from, because the old check for it was `if (dimensions)` — and `{}` is truthy,
 * so a message-only enquiry offered a button that failed when pressed.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'enquiry', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'enquiry', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import { createService, getPublicIntakeDimensions } from '@/modules/services/domain';
import { submitBookingForm, getPackageIntakePublic } from '@/app/book/[slug]/[packageId]/actions';
import { getEnquiryForBooking, extractPackageFromEnquiry, getBooking } from '@/modules/bookings/domain';
import { seedStudio } from './seed';
import { PURGE_ORDER } from './purge';

/** The studio's own vocabulary, which is what a client's answers resolve against. */
let occasionDimensionId = '';
let weddingValueId = '';

const linesOf = async (bookingId: string) => {
  const { data } = await supabaseAdmin
    .from('booking_lines').select('id, package_id, title, price').eq('booking_id', bookingId);
  return (data || []) as any[];
};

describe('a client who did not pick a package', () => {
  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Enquiry Studio' });

    /*
     * A service defines the domain's vocabulary, which is what the public
     * enquiry form asks with. Without one there are no dimensions to offer and
     * the extractable case cannot be reached.
     */
    await createService({
      name: 'Portrait Session',
      serviceDomain: 'Photography',
      dimensions: [{ name: 'Occasion', values: ['Wedding', 'Birthday'] }],
    });

    const config = await getPublicIntakeDimensions(TEST_ORG_ID);
    const occasion = config.find((d) => d.name === 'Occasion');
    if (!occasion) throw new Error('The seeded studio has no Occasion dimension to ask about.');
    occasionDimensionId = occasion.id;
    const wedding = occasion.values.find((v) => v.name === 'Wedding');
    if (!wedding) throw new Error('The seeded Occasion dimension has no Wedding value.');
    weddingValueId = wedding.id;
  }, 180000);

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('books nothing, because nothing was booked', async () => {
    const { bookingId } = await submitBookingForm(TEST_ORG_ID, 'custom', {
      firstName: 'Ada', lastName: 'Obi', email: 'ada@example.com', phone: '',
      customFields: { message: 'Something for our anniversary', dimensions: {} },
    } as any);

    /*
     * The booking is real — a stranger asked the studio for something, and that
     * is a fact. What is NOT a fact is that they bought a package.
     */
    const booking = await getBooking(bookingId);
    expect(booking, 'the enquiry did not become a booking at all').toBeTruthy();

    expect(await linesOf(bookingId),
      'a custom enquiry invented a booking line for a package nobody chose').toEqual([]);
  }, 120000);

  it('still says what the client asked for', async () => {
    const { bookingId } = await submitBookingForm(TEST_ORG_ID, 'custom', {
      firstName: 'Bola', lastName: 'Ade', email: 'bola@example.com', phone: '',
      customFields: {
        message: 'Full day, two shooters',
        dimensions: { [occasionDimensionId]: weddingValueId },
      },
    } as any);

    const enquiry = await getEnquiryForBooking(bookingId);
    expect(enquiry, 'the enquiry could not be read back').toBeTruthy();
    expect(enquiry!.message, 'the client’s own words were lost').toBe('Full day, two shooters');
    // Resolved into the studio's vocabulary, not handed back as UUIDs.
    expect(enquiry!.chosen, 'the answers did not resolve to what the studio calls them')
      .toEqual([{ dimension: 'Occasion', value: 'Wedding' }]);
    expect(enquiry!.extractable).toBe(true);
  }, 120000);

  it('can be built into a package, and then behaves like any other booking', async () => {
    const { bookingId } = await submitBookingForm(TEST_ORG_ID, 'custom', {
      firstName: 'Chidi', lastName: 'Eze', email: 'chidi@example.com', phone: '',
      customFields: { message: '', dimensions: { [occasionDimensionId]: weddingValueId } },
    } as any);

    expect(await linesOf(bookingId), 'it started with something on it').toEqual([]);

    const { packageId } = await extractPackageFromEnquiry(bookingId);
    expect(packageId, 'nothing was built').toBeTruthy();

    /*
     * The point of the whole exercise: the booking now has a line POINTING AT A
     * PACKAGE. That is the join everything downstream reads through, so this is
     * the assertion that says the enquiry made it across.
     */
    const lines = await linesOf(bookingId);
    expect(lines.length, 'building a package did not put it on the booking').toBe(1);
    expect(lines[0].package_id, 'the line still points at no package').toBe(packageId);

    // And the package carries what the client actually chose, through its service.
    const { data: pkg } = await supabaseAdmin
      .from('packages').select('name').eq('id', packageId).single();
    expect(pkg!.name, 'the package was not named from what they asked for').toContain('Wedding');
  }, 180000);

  it('does not offer to build from an enquiry with nothing in it', async () => {
    /*
     * The old check was `if (dimensions)`, and `{}` is truthy — so an enquiry
     * that was only a sentence offered a button that then failed. The reader and
     * the doer now share one resolver, so they cannot disagree about this.
     */
    const { bookingId } = await submitBookingForm(TEST_ORG_ID, 'custom', {
      firstName: 'Dami', lastName: 'Oke', email: 'dami@example.com', phone: '',
      customFields: { message: 'Just some pictures', dimensions: {} },
    } as any);

    const enquiry = await getEnquiryForBooking(bookingId);
    expect(enquiry!.message).toBe('Just some pictures');
    expect(enquiry!.extractable, 'a button was offered that has nothing to build from').toBe(false);

    await expect(extractPackageFromEnquiry(bookingId)).rejects.toThrow();
  }, 120000);


  it('asks a matched package its own questions, having asked none before', async () => {
    /*
     * THE GAP THIS CLOSES. Matching a package on the custom path already went
     * down the full package branch of submitBookingForm — instance,
     * classifications and all — while the form went on rendering the custom
     * questions, because `isCustom` describes which page you started on, not
     * what you ended up booking. So the package was booked without being asked
     * anything it asks: its intake form, its open classifications, its declared
     * variables. With a REQUIRED question it was worse than incomplete —
     * validateAnswers refused answers that had never been collected, and the
     * booking failed outright with a message the client could do nothing about.
     */
    const { createPackage, updatePackageQuestions } = await import('@/modules/packages/domain');
    const { serviceId } = await createService({
      name: 'Full Coverage',
      serviceDomain: 'Photography',
      dimensions: [{ name: 'Occasion', values: ['Wedding', 'Birthday'] }],
    });
    const { packageId } = await createPackage({ name: 'Full Coverage Package', serviceIds: [serviceId] });
    await updatePackageQuestions({
      packageId,
      questions: [{ id: 'venue', type: 'text', label: 'Where is it?', required: true }] as any,
    });

    // What the form now fetches the moment a match is picked.
    const intake = await getPackageIntakePublic(TEST_ORG_ID, packageId);
    expect(intake.formSchema.length, 'the package’s own questions were not offered').toBe(1);
    // Two values under Occasion is a choice, not two simultaneous facts.
    expect(intake.openClassifications.length, 'the package’s open classification was not offered').toBe(1);

    // Unanswered, it still refuses — the server rule is unchanged, and is what
    // the new step exists to satisfy rather than to replace.
    await expect(submitBookingForm(TEST_ORG_ID, packageId, {
      firstName: 'Femi', lastName: 'Ola', email: 'femi@example.com', phone: '',
      customFields: { message: 'Saw this one', dimensions: {} },
      fromCustomPath: true,
    } as any), 'a required question went unasked and the booking was allowed').rejects.toThrow();
  }, 180000);

  it('keeps what a matched client said, alongside the package’s answers', async () => {
    /*
     * storeAnswers keeps only what the package asked, which is right — it is
     * what stops a removed question's answer lingering. But somebody who came
     * the custom way said a sentence and picked answers that no package asked,
     * and those are the whole reason this package was matched. Dropping them
     * would lose the client's own words at the moment the studio most needs
     * them.
     */
    const { createPackage, updatePackageQuestions } = await import('@/modules/packages/domain');
    const { serviceId } = await createService({ name: 'Studio Hour', serviceDomain: 'Photography' });
    const { packageId } = await createPackage({ name: 'Studio Hour Package', serviceIds: [serviceId] });
    await updatePackageQuestions({
      packageId,
      questions: [{ id: 'venue', type: 'text', label: 'Where is it?', required: true }] as any,
    });

    const { data: schema } = await supabaseAdmin
      .from('packages').select('form_schema').eq('id', packageId).single();
    const questionId = (schema!.form_schema as any[])[0].id as string;

    const { bookingId } = await submitBookingForm(TEST_ORG_ID, packageId, {
      firstName: 'Grace', lastName: 'Nnamdi', email: 'grace@example.com', phone: '',
      customFields: {
        [questionId]: 'The Botanical Gardens',
        message: 'Golden hour if possible',
        dimensions: { [occasionDimensionId]: weddingValueId },
      },
      fromCustomPath: true,
    } as any);

    const { data: booking } = await supabaseAdmin
      .from('bookings').select('metadata').eq('id', bookingId).single();
    const stored = (booking!.metadata as any).form_responses;

    expect(stored[questionId], 'the package’s own answer was not stored').toBe('The Botanical Gardens');
    expect(stored.message, 'the client’s own words were dropped once they matched a package')
      .toBe('Golden hour if possible');
    expect(stored.dimensions, 'what they described was dropped once they matched a package')
      .toEqual({ [occasionDimensionId]: weddingValueId });

    // And it is a real booking on a real package instance, not an enquiry.
    const lines = await linesOf(bookingId);
    expect(lines.length).toBe(1);
    expect(lines[0].package_id).toBeTruthy();
  }, 180000);

  it('a package booking is untouched — it still gets its line', async () => {
    /*
     * The change is narrow on purpose. Removing the line for an enquiry must not
     * remove it for the path that actually bought something, which is the same
     * function with a package id.
     */
    const { createPackage } = await import('@/modules/packages/domain');
    const { serviceId } = await createService({ name: 'Half Day', serviceDomain: 'Photography' });
    const { packageId } = await createPackage({ name: 'Half Day Package', serviceIds: [serviceId] });

    const { bookingId } = await submitBookingForm(TEST_ORG_ID, packageId, {
      firstName: 'Ese', lastName: 'Uche', email: 'ese@example.com', phone: '',
      customFields: {},
    } as any);

    const lines = await linesOf(bookingId);
    expect(lines.length, 'a real package booking lost its line').toBe(1);
    expect(lines[0].package_id, 'the booking points at no package').toBeTruthy();
    // Its own instance, never the catalogue row — the rule package-instancing pins.
    expect(lines[0].package_id, 'the booking points straight at the catalogue').not.toBe(packageId);
  }, 180000);
});
