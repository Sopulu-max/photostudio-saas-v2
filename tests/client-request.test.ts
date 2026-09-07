import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * WHAT THE CLIENT SAID, AND WHAT THE BOOKING IS FOR.
 *
 * Two facts that were sharing one field. A client's answers arrive as JSON on
 * bookings.metadata, which is a record of an EVENT — on this day this person
 * ticked these boxes — and is evidence that must not be rewritten. But a
 * booking also has a classification of its own: what the studio understands
 * the work to be, seeded from those answers and the studio's thereafter.
 *
 * Because there was only the one, a client who misread the form cornered the
 * studio. Pius James asked for a wedding and ticked Maternity, and the only
 * record of the classification WAS the record of his submission — so the
 * resolver went on offering maternity packages and correcting it would have
 * meant falsifying what he sent.
 *
 * This pins the separation: correcting the understanding changes what the
 * studio is offered, and leaves the submission exactly as it arrived.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'req', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'req', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import {
  createBookingFromIntake,
  getBookingClassification,
  setBookingClassification,
  getEnquiryForBooking,
  listBookingsForDimensionValue,
} from '@/modules/bookings/interface';
import { seedStudio, seedRow } from './seed';
import { PURGE_ORDER } from './purge';

const THEIR_WORDS = 'Pre wedding pics, outdoors if possible';

let occasionId = '';
let maternityId = '';
let weddingId = '';
let clientId = '';
let bookingId = '';

describe('a client request the studio can correct', () => {
  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Request Studio' });

    const domain = await seedRow('service_domains', { organization_id: TEST_ORG_ID, name: 'Photography' });
    const dimension = await seedRow('dimensions', {
      organization_id: TEST_ORG_ID, service_domain_id: domain.id,
      name: 'Occasion', question: 'What occasion is it for?', position: 0,
    });
    occasionId = dimension.id;
    /*
     * The join that makes it a question the studio ASKS, rather than one it
     * merely has. getPublicIntakeDimensions reads this table, not dimensions —
     * so without it the enquiry resolves against an empty vocabulary and every
     * answer a client gave silently reads as nothing.
     */
    await seedRow('service_domain_dimensions', {
      organization_id: TEST_ORG_ID, service_domain_id: domain.id,
      dimension_id: dimension.id, position: 0, is_active: true,
    });
    maternityId = (await seedRow('dimension_values', {
      organization_id: TEST_ORG_ID, dimension_id: dimension.id, name: 'Maternity', position: 0,
    })).id;
    weddingId = (await seedRow('dimension_values', {
      organization_id: TEST_ORG_ID, dimension_id: dimension.id, name: 'Wedding', position: 1,
    })).id;

    const contact = await seedRow('contacts', {
      organization_id: TEST_ORG_ID, display_name: 'Pius James',
    });
    clientId = contact.id;

    /*
     * Taken exactly as the public form takes one: a custom enquiry, no
     * package, the client's own words and their answer.
     */
    const made = await createBookingFromIntake({
      organizationId: TEST_ORG_ID,
      contactId: clientId,
      clientName: 'Pius James',
      packageName: 'Custom Enquiry',
      answers: { message: THEIR_WORDS, dimensions: { [occasionId]: maternityId } },
      source: 'public_booking_page',
    });
    bookingId = made.bookingId;
  }, 180000);

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('puts the client’s own words in the column built for them', async () => {
    const { data } = await supabaseAdmin
      .from('bookings').select('brief, metadata').eq('id', bookingId).single();
    /*
     * bookings.brief has existed all along — rendered, editable, audited — and
     * intake never wrote it, so what every client typed went into JSON and the
     * field a studio actually reads stayed null on every booking ever taken.
     */
    expect((data as any).brief, 'the client’s words never reached the brief').toBe(THEIR_WORDS);
    // And the submission is still verbatim, because it is the record.
    expect((data as any).metadata?.form_responses?.message).toBe(THEIR_WORDS);
  }, 60000);

  it('classifies the booking from what they answered', async () => {
    const current = await getBookingClassification(bookingId);
    expect(current.length, 'intake recorded no classification').toBe(1);
    expect(current[0].valueName).toBe('Maternity');
  }, 60000);

  it('lets the studio correct it without touching what was submitted', async () => {
    await setBookingClassification({ bookingId, dimensionId: occasionId, valueId: weddingId });

    const current = await getBookingClassification(bookingId);
    expect(current[0].valueName, 'the correction did not take').toBe('Wedding');

    /*
     * THE POINT OF THE WHOLE SEPARATION. He did tick Maternity, and six months
     * from now "why is this filed as a wedding?" has to be answerable.
     */
    const { data } = await supabaseAdmin
      .from('bookings').select('metadata').eq('id', bookingId).single();
    expect(
      (data as any).metadata?.form_responses?.dimensions?.[occasionId],
      'correcting the studio’s understanding rewrote the client’s submission',
    ).toBe(maternityId);
  }, 90000);

  it('resolves against the correction, not against the submission', async () => {
    const enquiry = await getEnquiryForBooking(bookingId);
    expect(enquiry, 'the enquiry disappeared').toBeTruthy();
    /*
     * The studio's understanding is what the offers are computed from. That
     * the submission survives untouched is checked directly against the row
     * in the test above — it is a guarantee about the record, not something
     * this screen narrates.
     */
    expect(enquiry!.chosen.map((c) => c.value)).toEqual(['Wedding']);
  }, 90000);

  it('counts a booking under its classification before anything is sold', async () => {
    /*
     * listBookingsForDimensionValue reached a booking only THROUGH a package,
     * so an enquiry that named an occasion and had not been quoted yet counted
     * under nothing at all — which is the opposite of what a studio asking
     * "how much wedding work do we take?" needs.
     */
    const under = await listBookingsForDimensionValue(weddingId);
    expect(
      under.bookings.some((b: any) => b.id === bookingId),
      'a booking with no package counted under no classification',
    ).toBe(true);

    // And it is no longer under the answer it was corrected away from.
    const stillMaternity = await listBookingsForDimensionValue(maternityId);
    expect(stillMaternity.bookings.some((b: any) => b.id === bookingId)).toBe(false);
  }, 90000);

  it('refuses an answer belonging to a different question', async () => {
    const other = await seedRow('dimensions', {
      organization_id: TEST_ORG_ID, name: 'Context', question: null, position: 1,
    });
    /*
     * Without this check a booking could be filed under "Studio" for the
     * question "what occasion is it for?", and every later read of the graph
     * would carry the contradiction.
     */
    await expect(
      setBookingClassification({ bookingId, dimensionId: other.id, valueId: weddingId }),
    ).rejects.toThrow(/different question/);
  }, 90000);
});
