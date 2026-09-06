import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * A BOOKING HAS THREE DATES, AND THEY ARE THREE DIFFERENT KINDS OF FACT.
 *
 *   booked on      when the agreement was made — the RECORD's own fact,
 *                  produced by the act of booking, answered by nobody
 *   scheduled for  when the work happens — the BOOKING's fact, the one the
 *                  studio's schedule and opening hours run on
 *   the occasion   when the thing the work is about happens — not the
 *                  booking's fact at all. A birthday belongs to the birthday,
 *                  which is why it lives on the classification that carries
 *                  it rather than as a third column here.
 *
 * The two need not coincide, and the difference is the point: a wedding is
 * covered on the wedding day, a birthday portrait is taken the week before and
 * has to be delivered in between. This pins the two readings the calendar
 * composes from those facts.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'cal', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'cal', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import {
  listBookingsPlacedInRange,
  listClassificationDatesInRange,
} from '@/modules/bookings/interface';
import { seedStudio, seedRow } from './seed';
import { PURGE_ORDER } from './purge';

/* The month under test, and the two days inside it that matter. */
const FROM = '2026-11-01T00:00:00.000Z';
const TO = '2026-11-30T23:59:59.000Z';
const BOOKED_ON = '2026-11-03T09:15:00.000Z';
const SHOOT_ON = '2026-11-07T12:00:00.000Z';
const THE_BIRTHDAY = '2026-11-14';

let bookingId = '';

describe('the three dates of a booking', () => {
  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Calendar Studio' });

    const domain = await seedRow('service_domains', { organization_id: TEST_ORG_ID, name: 'Photography' });
    const dimension = await seedRow('dimensions', {
      organization_id: TEST_ORG_ID, service_domain_id: domain.id,
      name: 'Occasion', question: 'What occasion is it for?', position: 0,
    });
    /* The date the classification carries. Declared once on the dimension —
       every package classified that way inherits it. */
    const occasionDate = await seedRow('variables', {
      organization_id: TEST_ORG_ID, dimension_id: dimension.id,
      key: 'occasion_date', label: 'Occasion Date', kind: 'date', options: [], position: 0,
    });
    const service = await seedRow('services', {
      organization_id: TEST_ORG_ID, service_domain_id: domain.id, name: 'Sitting', status: 'active',
    });
    /*
     * A DATE DECLARED ON A SERVICE, which must NOT be swept up.
     *
     * The calendar identifies an occasion's date structurally — any date
     * declared on a DIMENSION — rather than by looking for a variable named
     * "occasion date", because the studio owns its vocabulary. The cost of
     * that choice is that a service's own date variable sits one predicate
     * away, so the predicate gets a test of its own.
     */
    const serviceDate = await seedRow('variables', {
      organization_id: TEST_ORG_ID, service_id: service.id,
      key: 'preferred_proof_date', label: 'Preferred proof date', kind: 'date', options: [], position: 1,
    });

    const stage = await seedRow('booking_stages', {
      organization_id: TEST_ORG_ID, name: 'Enquiry Two', kind: 'enquiry', position: 5, is_default: false,
    });
    const booking = await seedRow('bookings', {
      organization_id: TEST_ORG_ID, title: 'A birthday portrait',
      stage_id: stage.id, created_at: BOOKED_ON, scheduled_for: SHOOT_ON,
    });
    bookingId = booking.id;

    /*
     * TWO LINES, BOTH ANSWERING THE SAME QUESTION.
     *
     * A booking bundling two services that carry the same classification
     * answers it once, but the answer is recorded against each line. Without
     * deduplication the calendar shows one birthday twice on one day.
     */
    for (const title of ['Photography', 'Videography']) {
      const line = await seedRow('booking_lines', {
        organization_id: TEST_ORG_ID, booking_id: booking.id, title,
      });
      await seedRow('booking_line_variable_values', {
        organization_id: TEST_ORG_ID, booking_line_id: line.id,
        variable_id: occasionDate.id, value: THE_BIRTHDAY, source: 'client',
      });
      await seedRow('booking_line_variable_values', {
        organization_id: TEST_ORG_ID, booking_line_id: line.id,
        variable_id: serviceDate.id, value: '2026-11-21', source: 'client',
      });
    }
  }, 180000);

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('places the booking on the day the agreement was made', async () => {
    const placed = await listBookingsPlacedInRange(FROM, TO);
    const mine = placed.find((p) => p.bookingId === bookingId);
    expect(mine, 'the booking never appeared on the day it was booked').toBeTruthy();
    expect(mine!.at.slice(0, 10)).toBe('2026-11-03');
    // Carried so the day panel can say what became of it without a second read.
    expect(mine!.scheduledFor?.slice(0, 10), 'the shoot did not travel with it').toBe('2026-11-07');
  }, 90000);

  it('reads the occasion’s own date, once', async () => {
    const dates = await listClassificationDatesInRange(FROM, TO);
    const mine = dates.filter((d) => d.bookingId === bookingId);

    /*
     * ONE, not two. Both lines hold the answer; the birthday happened once.
     */
    expect(mine.length, 'the same occasion was shown once per line').toBe(1);
    expect(mine[0].at).toBe(THE_BIRTHDAY);
    // The studio's own name for the question, so the layer can be labelled
    // with it rather than with a word this repository chose.
    expect(mine[0].dimensionName).toBe('Occasion');
    // And the shoot, which is what makes the gap between them legible.
    expect(mine[0].scheduledFor?.slice(0, 10)).toBe('2026-11-07');
  }, 90000);

  it('leaves a service’s own date out of it', async () => {
    const dates = await listClassificationDatesInRange(FROM, TO);
    /*
     * "Preferred proof date" is a date, on this booking, inside the range. It
     * is not an occasion: it hangs off the service, not off a classification.
     * If this ever fails, the calendar has started calling every date in the
     * system an occasion.
     */
    expect(
      dates.some((d) => d.title === 'Preferred proof date'),
      'a service’s date was read as an occasion',
    ).toBe(false);
  }, 90000);

  it('finds nothing in a month the occasion is not in', async () => {
    const dates = await listClassificationDatesInRange(
      '2026-12-01T00:00:00.000Z', '2026-12-31T23:59:59.000Z',
    );
    /*
     * The range is compared against a jsonb column, where a bare date is not a
     * date but a syntax error — `invalid input syntax for type json`. This
     * would have shipped: the query threw for every studio, on every month,
     * and the calendar would have failed to load rather than quietly
     * mis-filtering. Comparing quoted JSON strings orders ISO dates correctly
     * because lexicographic and chronological agree for that format.
     */
    expect(dates.some((d) => d.bookingId === bookingId)).toBe(false);
  }, 90000);
});
