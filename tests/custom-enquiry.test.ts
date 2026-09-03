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
import { submitBookingForm } from '@/app/book/[slug]/[packageId]/actions';
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
