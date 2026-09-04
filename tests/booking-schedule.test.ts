import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * WHEN A BOOKING IS, AND WHOSE CLOCK SAYS SO.
 *
 * A booking at 10:00 is at 10:00 in the STUDIO, whoever is looking and from
 * where. The public booking form settled that: it sends the wall clock exactly
 * as typed and lets the server resolve it against the studio's own timezone.
 *
 * The edit page did the opposite, and it corrupted data on every save. It sent
 * `new Date(when).toISOString()` — an instant, in the browser's zone. The
 * server's check for "is this a wall clock?" was an UNANCHORED regex, so the
 * instant matched on its prefix and its UTC time was re-read as a studio wall
 * clock. For a studio in Lagos (UTC+1) that moved the booking an hour earlier;
 * and because the shifted value was displayed and sent again next time, it
 * moved an hour earlier on every subsequent save.
 *
 * Nothing about this was visible. No error, no warning — just a booking that
 * drifted an hour every time somebody opened it and pressed Save.
 *
 * What is pinned here is the round trip: what is typed is what is stored, what
 * is stored is what is shown, and saving an unchanged form changes nothing.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'schedule', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'schedule', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import { createBooking, updateBookingRecord } from '@/modules/bookings/domain';
import { wallClockIn, isWallClock } from '@/kernel/wallClock';
import { seedStudio } from './seed';
import { PURGE_ORDER } from './purge';

/** UTC+1 all year, so the arithmetic in these assertions is plain to read. */
const STUDIO_TZ = 'Africa/Lagos';

const storedTimeOf = async (bookingId: string) => {
  const { data } = await supabaseAdmin
    .from('bookings').select('scheduled_for').eq('id', bookingId).single();
  return data!.scheduled_for as string | null;
};

describe('when a booking is', () => {
  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Schedule Studio' });
    const { error } = await supabaseAdmin.from('organizations')
      .update({ timezone: STUDIO_TZ }).eq('id', TEST_ORG_ID);
    if (error) throw new Error(`Could not set the studio timezone: ${error.message}`);
  }, 120000);

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('stores what was typed, in the studio’s zone', async () => {
    const { bookingId } = await createBooking({ title: 'Ten in the morning' });

    await updateBookingRecord({ bookingId, title: 'Ten in the morning', scheduledFor: '2026-08-29T10:00' });

    // 10:00 in Lagos is 09:00 UTC. Read as an instant so the assertion does not
    // depend on how Postgres spells it back.
    const stored = await storedTimeOf(bookingId);
    expect(new Date(stored!).toISOString(), 'the studio’s 10:00 was not stored as 09:00 UTC')
      .toBe('2026-08-29T09:00:00.000Z');
  }, 120000);

  it('shows back exactly what was typed, wherever it is read from', async () => {
    const { bookingId } = await createBooking({ title: 'Read back' });
    await updateBookingRecord({ bookingId, title: 'Read back', scheduledFor: '2026-08-29T10:00' });

    const stored = await storedTimeOf(bookingId);
    /*
     * The form fills its field with this. It used to use getHours(), which
     * answers in the BROWSER's zone — so an operator in London opened a Lagos
     * booking and was shown the wrong hour, then saved it back.
     */
    expect(wallClockIn(stored, STUDIO_TZ), 'the stored time did not read back as what was typed')
      .toBe('2026-08-29T10:00');

    // And it is the studio's clock, not the reader's: the same instant in
    // another zone is a different wall clock, which is the whole point.
    expect(wallClockIn(stored, 'UTC')).toBe('2026-08-29T09:00');
  }, 120000);

  it('does not move when an unchanged form is saved again', async () => {
    /*
     * THE COMPOUNDING BUG, STATED DIRECTLY.
     *
     * Opening a booking and pressing Save sent back exactly what was displayed.
     * If that round trip is not lossless, every save moves the booking — an
     * hour each time, for as long as anybody keeps editing it.
     */
    const { bookingId } = await createBooking({ title: 'Untouched' });
    await updateBookingRecord({ bookingId, title: 'Untouched', scheduledFor: '2026-08-29T10:00' });

    const first = await storedTimeOf(bookingId);

    for (let i = 0; i < 3; i++) {
      // Exactly what the form does: read the stored instant into the field,
      // then send that back untouched.
      const shown = wallClockIn(await storedTimeOf(bookingId), STUDIO_TZ);
      await updateBookingRecord({ bookingId, title: 'Untouched', scheduledFor: shown });
    }

    const after = await storedTimeOf(bookingId);
    expect(new Date(after!).getTime(), 'the booking drifted when nothing was changed')
      .toBe(new Date(first!).getTime());
  }, 180000);

  it('leaves an instant alone rather than reading it as a wall clock', async () => {
    /*
     * The check that went wrong. It was unanchored, so an ISO instant matched
     * on its prefix and was treated as a local time — which is precisely how
     * the shift happened. Anything carrying a zone is already a moment.
     */
    expect(isWallClock('2026-08-29T10:00')).toBe(true);
    expect(isWallClock('2026-08-29T10:00:00')).toBe(true);
    expect(isWallClock('2026-08-29T09:00:00.000Z')).toBe(false);
    expect(isWallClock('2026-08-29T10:00+01:00')).toBe(false);

    const { bookingId } = await createBooking({ title: 'Given a moment' });
    await updateBookingRecord({
      bookingId, title: 'Given a moment', scheduledFor: '2026-08-29T09:00:00.000Z',
    });

    const stored = await storedTimeOf(bookingId);
    expect(new Date(stored!).toISOString(), 'an instant was shifted by the studio offset')
      .toBe('2026-08-29T09:00:00.000Z');
  }, 120000);

  it('clears the date when the field is emptied', async () => {
    const { bookingId } = await createBooking({ title: 'Off the calendar' });
    await updateBookingRecord({ bookingId, title: 'Off the calendar', scheduledFor: '2026-08-29T10:00' });
    expect(await storedTimeOf(bookingId)).toBeTruthy();

    await updateBookingRecord({ bookingId, title: 'Off the calendar', scheduledFor: null });
    expect(await storedTimeOf(bookingId), 'emptying the date left it on the calendar').toBeNull();
    expect(wallClockIn(null, STUDIO_TZ), 'an absent date did not read back as an empty field').toBe('');
  }, 120000);
});
