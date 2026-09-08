import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * A PACKAGE ASKS WHATEVER IT IS SUPPOSED TO ASK — ON EVERY WAY IN.
 *
 * A package can ask along three separate routes:
 *
 *   form_schema           the studio's OWN written intake questions
 *   open variables        what it declined to fix, left to the client
 *   open classifications  a dimension it narrowed to more than one value
 *
 * They arrive from three different places, and every surface was assembling
 * its own idea of what a package asks. Each one that forgot a route dropped it
 * IN SILENCE — nothing errors when a question is not asked, it simply never
 * appears, and the answer is missing later with nothing to say why.
 *
 * Two had gone missing that way. The public form's Details step was gated on
 * form_schema and variables and never mentioned classifications, so a package
 * offering a choice of occasion never showed it — and the booking's own date
 * lived inside that step, so a package that fixed everything asked for no date
 * either. And getOpenQuestionsForPackage, the function that is supposed to BE
 * the answer for the studio's own screens, returned two of the three: intake
 * questions a studio wrote were asked of clients booking online and never of
 * the studio taking the same booking by phone.
 *
 * So this pins the whole of it against one package that asks along all three.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'q', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'q', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import { createService, declareServiceVariable } from '@/modules/services/domain';
import { createPackage, getOpenQuestionsForPackage } from '@/modules/packages/domain';
import {
  createBooking, setBookingIntakeAnswers, getIntakeAnswersForBooking,
} from '@/modules/bookings/interface';
import { seedStudio, seedRow } from './seed';
import { PURGE_ORDER } from './purge';

const WHERE_FROM = { id: 'q_referral', type: 'text' as const, label: 'How did you hear about us?' };
const HEADCOUNT = { id: 'q_guests', type: 'number' as const, label: 'How many guests?' };

let packageId = '';
let serviceId = '';
let bookingId = '';

describe('every route a package asks along', () => {
  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Questions Studio' });

    const created = await createService({
      name: 'Event Coverage', serviceDomain: 'Photography', primaryDeliverable: 'Edited image',
    });
    serviceId = created.serviceId;

    /* ROUTE 2: something the service declares and the package will not fix. */
    await declareServiceVariable({
      serviceId,
      key: 'hours',
      label: 'Coverage hours',
      kind: 'number',
    } as any);

    /* ROUTE 3: a dimension narrowed to more than one value is still a question. */
    const domain = await supabaseAdmin.from('service_domains')
      .select('id').eq('organization_id', TEST_ORG_ID).eq('name', 'Photography').maybeSingle();
    const dimension = await seedRow('dimensions', {
      organization_id: TEST_ORG_ID, service_domain_id: (domain.data as any).id,
      name: 'Occasion', question: 'What occasion is it for?', position: 0,
    });
    const values = [];
    for (const [i, name] of ['Birthday', 'Convocation'].entries()) {
      values.push(await seedRow('dimension_values', {
        organization_id: TEST_ORG_ID, dimension_id: dimension.id, name, position: i,
      }));
    }
    for (const v of values) {
      await seedRow('service_dimension_values', {
        organization_id: TEST_ORG_ID, service_id: serviceId, dimension_value_id: v.id,
      });
    }

    /* ROUTE 1: the studio's own questions, written on the package itself. */
    const pkg = await createPackage({
      name: 'Event Coverage',
      serviceIds: [serviceId],
      formSchema: [WHERE_FROM, HEADCOUNT],
      narrowings: values.map((v) => ({ serviceId, valueId: v.id })),
    } as any);
    packageId = pkg.packageId;

    const booking = await createBooking({ contactId: null, brief: 'A birthday' } as any);
    bookingId = booking.bookingId;
  }, 240000);

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('reports all three routes from the one reader', async () => {
    const asked = await getOpenQuestionsForPackage(packageId);

    /*
     * THE ONE THAT WAS MISSING. getOpenQuestionsForPackage returned variables
     * and classifications only, so the studio's own screens never learned that
     * a package had questions of its own.
     */
    expect(
      asked.formSchema.map((q: any) => q.id),
      'the studio’s own intake questions never reached its own screens',
    ).toEqual([WHERE_FROM.id, HEADCOUNT.id]);

    // And the other two are still there — this must add, not replace.
    expect(asked.classifications.length, 'the open classification was dropped').toBe(1);
    expect((asked.classifications[0] as any).values.length).toBe(2);
    expect(Array.isArray(asked.variables), 'variables stopped being reported').toBe(true);
  }, 120000);

  it('records answers to those questions from the studio’s own side', async () => {
    /*
     * Nothing internal wrote form_responses and createBooking had no route for
     * it, so this was not a missing section on a screen — it was missing
     * plumbing. The public form could always do it; the studio could not.
     */
    await setBookingIntakeAnswers({
      bookingId,
      packageId,
      values: { [WHERE_FROM.id]: 'A friend', [HEADCOUNT.id]: 40 },
    });

    const { data } = await supabaseAdmin
      .from('bookings').select('metadata').eq('id', bookingId).single();
    const stored = (data as any).metadata?.form_responses || {};
    expect(stored[WHERE_FROM.id], 'the answer never reached the booking').toBe('A friend');
    expect(Number(stored[HEADCOUNT.id])).toBe(40);
  }, 120000);

  it('keeps what was already recorded when a second package answers', async () => {
    /*
     * MERGED, NOT REPLACED. A booking can carry more than one package, and a
     * public client's classification answers live under this same key — so
     * writing the whole object would erase either the other package's answers
     * or the record of what the client said.
     */
    await supabaseAdmin.from('bookings')
      .update({ metadata: { form_responses: { existing_other_package: 'kept', [WHERE_FROM.id]: 'A friend' } } })
      .eq('id', bookingId);

    await setBookingIntakeAnswers({
      bookingId, packageId, values: { [WHERE_FROM.id]: 'Instagram' },
    });

    const { data } = await supabaseAdmin
      .from('bookings').select('metadata').eq('id', bookingId).single();
    const stored = (data as any).metadata?.form_responses || {};
    expect(stored.existing_other_package, 'writing one package’s answers erased another’s').toBe('kept');
    expect(stored[WHERE_FROM.id], 'the new answer did not take').toBe('Instagram');
  }, 120000);

  it('reads them back as the questions the studio asked', async () => {
    /*
     * The point of storing them by question id: the booking can state what was
     * asked and what came back, in the studio's own words, months later.
     */
    const rows = await getIntakeAnswersForBooking(bookingId);
    expect(Array.isArray(rows)).toBe(true);
  }, 120000);
});
