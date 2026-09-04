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

import { createBooking, updateBookingRecord, whatElseIsOn, studioDay } from '@/modules/bookings/domain';
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


  it('says what else is on that day, by the studio’s day and not the server’s', async () => {
    /*
     * THE QUESTION THE EDIT PAGE NEVER ASKED.
     *
     * The new-booking form has warned about clashes since it was written and
     * the edit page did not — though rescheduling happens there, and a clash
     * matters far more when moving a shoot onto an occupied day than when
     * first writing one down.
     *
     * The boundary is the part worth pinning. "That day" has to mean the day
     * the STUDIO is having: 23:30 in Lagos is 22:30 UTC, and a naive UTC window
     * would file an evening shoot under the wrong date — which is precisely
     * when a clash goes unseen.
     */
    const DAY = '2026-10-10';

    const morning = await createBooking({ title: 'Morning shoot' });
    await updateBookingRecord({ bookingId: morning.bookingId, title: 'Morning shoot', scheduledFor: `${DAY}T09:00` });

    const lateEvening = await createBooking({ title: 'Late evening shoot' });
    await updateBookingRecord({ bookingId: lateEvening.bookingId, title: 'Late evening shoot', scheduledFor: `${DAY}T23:30` });

    // 00:30 the NEXT day in Lagos — 23:30 UTC on DAY. It belongs to the day
    // after, and a UTC-shaped window would wrongly pull it into this one.
    const justAfter = await createBooking({ title: 'After midnight' });
    await updateBookingRecord({ bookingId: justAfter.bookingId, title: 'After midnight', scheduledFor: '2026-10-11T00:30' });

    const onDay = await whatElseIsOn(DAY);
    const titles = onDay.map((b) => b.title).sort();
    expect(titles, 'the studio’s own day is not what was counted')
      .toEqual(['Late evening shoot', 'Morning shoot']);

    // And each is reported at the instant it actually sits at.
    const late = onDay.find((b) => b.title === 'Late evening shoot')!;
    expect(new Date(late.at).toISOString()).toBe(`${DAY}T22:30:00.000Z`);
  }, 180000);

  it('does not report a booking as clashing with itself', async () => {
    /*
     * The edit page asks this about the booking being edited, so without the
     * exclusion every rescheduling would warn that the day already holds the
     * very booking being moved — a false alarm on every single edit, which
     * teaches an operator to ignore the real ones.
     */
    const DAY = '2026-10-12';
    const only = await createBooking({ title: 'The only one that day' });
    await updateBookingRecord({ bookingId: only.bookingId, title: 'The only one that day', scheduledFor: `${DAY}T11:00` });

    expect((await whatElseIsOn(DAY)).map((b) => b.title), 'it was not found at all')
      .toEqual(['The only one that day']);

    expect(await whatElseIsOn(DAY, only.bookingId), 'a booking reported itself as a clash')
      .toEqual([]);
  }, 180000);

  it('answers what the studio’s day looks like', async () => {
    // Read through the same call the field uses. A studio that has said nothing
    // about a day constrains nothing, which is the answer it gives everywhere.
    const day = await studioDay('2026-10-10');
    expect(day, 'the day could not be described at all').toBeTruthy();
    expect(typeof day.closed, 'a day did not say whether it is closed').toBe('boolean');
  }, 120000);

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
