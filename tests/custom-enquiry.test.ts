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
import { getEnquiryForBooking, buildPackageForBooking, getBooking } from '@/modules/bookings/domain';
import { seedStudio } from './seed';
import { PURGE_ORDER } from './purge';

/** The studio's own vocabulary, which is what a client's answers resolve against. */
let occasionDimensionId = '';
let portraitServiceId = '';
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
     * nothing can be resolved against.
     */
    const seeded = await createService({
      name: 'Portrait Session',
      serviceDomain: 'Photography',
      dimensions: [{ name: 'Occasion', values: ['Wedding', 'Birthday'] }],
      deliverables: ['Edited photographs'],
    });
    portraitServiceId = seeded.serviceId;

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
    /*
     * Resolvable because something CAN do it, not because they answered. There
     * was a flag saying "they answered something", which is the enquiry
     * asserting about itself what only the relation can say.
     */
    expect(enquiry!.capabilities.map((c) => c.name),
      'nothing the studio does was found to admit this').toContain('Portrait Session');
  }, 120000);

  it('is assembled from what the studio already does, never invented', async () => {
    /*
     * THE ERROR THIS REPLACES.
     *
     * Building from an enquiry used to CREATE A SERVICE named after whatever
     * the client had chosen — so "Occasion: Maternity" produced a service
     * called "Maternity", filed under the wrong domain, carrying no
     * deliverable, no workflow and no variables. A classification value became
     * a capability, and an empty one, so everything built on it inherited
     * nothing. Meanwhile the service that actually lists Maternity among its
     * occasions sat in the catalogue unconsulted.
     *
     * Capabilities are chosen now, not conjured, and what the package carries
     * is inherited from them.
     */
    const { bookingId } = await submitBookingForm(TEST_ORG_ID, 'custom', {
      firstName: 'Chidi', lastName: 'Eze', email: 'chidi@example.com', phone: '',
      customFields: { message: '', dimensions: { [occasionDimensionId]: weddingValueId } },
    } as any);

    expect(await linesOf(bookingId), 'it started with something on it').toEqual([]);

    // The capability query — the question nothing used to ask.
    const enquiry = await getEnquiryForBooking(bookingId);
    expect(enquiry!.capabilities.map((c) => c.name),
      'the service that does weddings was not offered').toContain('Portrait Session');

    const { packageId } = await buildPackageForBooking({
      bookingId, serviceIds: [portraitServiceId],
    });

    // It belongs to this booking and nowhere else.
    const { data: built } = await supabaseAdmin
      .from('packages').select('name, status, instance_of').eq('id', packageId).single();
    expect(built!.status, 'the built package went into the catalogue').toBe('custom');
    expect(built!.instance_of, 'it claims to be a copy of something').toBeNull();
    expect(built!.name, 'it was not named for the work').toBe('Portrait Session');

    // It bundles the chosen capability, narrowed to what they answered.
    const { data: bundle } = await supabaseAdmin
      .from('package_services')
      .select('id, service_id, package_service_dimension_values(dimension_value_id), package_deliverables(deliverable_id)')
      .eq('package_id', packageId);
    expect((bundle || []).length).toBe(1);
    expect(bundle![0].service_id, 'it bundled a different service').toBe(portraitServiceId);
    expect(((bundle![0] as any).package_service_dimension_values || []).map((n: any) => n.dimension_value_id),
      'it was not narrowed to what the client chose').toEqual([weddingValueId]);
    // And promises what that service already produces.
    expect(((bundle![0] as any).package_deliverables || []).length,
      'it promised nothing, though the service produces something').toBeGreaterThan(0);

    // NOTHING was added to the catalogue — no invented service, no offer.
    const { data: services } = await supabaseAdmin
      .from('services').select('name').eq('organization_id', TEST_ORG_ID);
    expect((services || []).map((x: any) => x.name).sort(),
      'building invented a service').toEqual(['Portrait Session']);

    const { data: catalogue } = await supabaseAdmin
      .from('packages').select('id').eq('organization_id', TEST_ORG_ID)
      .is('instance_of', null).eq('status', 'active');
    expect((catalogue || []).length, 'building added an offer to the catalogue').toBe(0);

    const lines = await linesOf(bookingId);
    expect(lines.length).toBe(1);
    expect(lines[0].package_id).toBe(packageId);
  }, 240000);

  it('refuses a capability that cannot do what was asked', async () => {
    /*
     * A service is chosen from a list of what admits the answers, so an id that
     * does not is a stale screen or a bug. Refused rather than quietly
     * honoured: a package narrowed to work the studio does not do would promise
     * something nobody can deliver.
     */
    const { serviceId: unrelated } = await createService({
      name: 'Framing', serviceDomain: 'Printing',
      dimensions: [{ name: 'Occasion', values: ['Convocation'] }],
    });

    const { bookingId } = await submitBookingForm(TEST_ORG_ID, 'custom', {
      firstName: 'Nkem', lastName: 'Obi', email: 'nkem@example.com', phone: '',
      customFields: { message: '', dimensions: { [occasionDimensionId]: weddingValueId } },
    } as any);

    await expect(buildPackageForBooking({ bookingId, serviceIds: [unrelated] }),
      'a service that cannot do this was accepted').rejects.toThrow();
    expect(await linesOf(bookingId), 'a refused build still wrote a line').toEqual([]);
  }, 180000);

  it('can be built again after the line was taken off, polluting nothing', async () => {
    /*
     * PRESSED TWICE, WHICH IS ORDINARY — and used to be fatal.
     *
     * The old step created a service unconditionally, and services carry
     * UNIQUE (organization_id, name), so the second attempt collided with the
     * one the first had made. It happened for real: a studio built from an
     * enquiry, removed the line, and from then on only ever saw "Something
     * went wrong" — the reason unreachable, because Next redacts a thrown
     * message in production.
     *
     * Nothing enters the catalogue now, so there is nothing to collide with.
     */
    const { bookingId } = await submitBookingForm(TEST_ORG_ID, 'custom', {
      firstName: 'Ify', lastName: 'Nwosu', email: 'ify@example.com', phone: '',
      customFields: { message: '', dimensions: { [occasionDimensionId]: weddingValueId } },
    } as any);

    await buildPackageForBooking({ bookingId, serviceIds: [portraitServiceId] });
    const line = (await linesOf(bookingId))[0];
    expect(line, 'the first build put nothing on the booking').toBeTruthy();

    const { removeBookingLine } = await import('@/modules/bookings/domain');
    await removeBookingLine({ lineId: line.id, bookingId });
    expect(await linesOf(bookingId), 'the line did not come off').toEqual([]);

    // This threw before.
    await buildPackageForBooking({ bookingId, serviceIds: [portraitServiceId] });
    expect((await linesOf(bookingId)).length, 'the second build put nothing on the booking').toBe(1);

    const { data: catalogue } = await supabaseAdmin
      .from('packages').select('id').eq('organization_id', TEST_ORG_ID)
      .is('instance_of', null).eq('status', 'active');
    expect((catalogue || []).length, 'repeated builds leaked into the catalogue').toBe(0);
  }, 240000);

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

    // Nothing to test against, so nothing is offered to build from either.
    expect(enquiry!.capabilities, 'capabilities were offered for an empty enquiry').toEqual([]);
    expect(enquiry!.offers, 'offers were suggested for an empty enquiry').toEqual([]);
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
