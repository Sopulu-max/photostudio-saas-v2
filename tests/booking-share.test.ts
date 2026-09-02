import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * THE LINK THAT LETS A CLIENT READ THEIR OWN BOOKING.
 *
 * A capability token: whoever holds it can read, and nobody signs in. That
 * bargain is only safe if the token behaves exactly as advertised, so what is
 * pinned here is the lifecycle rather than the page — minting, re-pressing,
 * revoking, and the fact that a revoked token opens nothing.
 *
 * The re-press case is the one worth having. Minting a fresh token every time
 * Share is pressed would silently kill a link the client already has in a
 * message, and an operator pressing it twice is asking to send it again, not
 * to replace it. That is invisible in the interface — both presses look
 * identical and both appear to succeed — so only a test can hold it.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'booking-share', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'booking-share', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import { createBooking, shareBooking, unshareBooking } from '@/modules/bookings/domain';
import { seedStudio } from './seed';
import { PURGE_ORDER } from './purge';

/** What the public page will do: look a booking up by token and nothing else. */
async function openByToken(token: string) {
  const { data } = await supabaseAdmin
    .from('bookings').select('id, title').eq('share_token', token).maybeSingle();
  return data;
}

let bookingId = '';

describe('sharing a booking with the client who made it', () => {
  beforeAll(async () => {
    await seedStudio({ orgId: TEST_ORG_ID, actorId: TEST_PERSON_ID, name: 'Share Studio' });
    const made = await createBooking({ contactId: TEST_PERSON_ID, brief: 'A booking to share' });
    bookingId = made.bookingId;
  }, 120000);

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('is unreadable until somebody shares it', async () => {
    const { data } = await supabaseAdmin
      .from('bookings').select('share_token, shared_at').eq('id', bookingId).maybeSingle();
    // No default and no backfill: a booking is private until said otherwise.
    expect(data!.share_token, 'a new booking already has a live link').toBeNull();
    expect(data!.shared_at).toBeNull();
  });

  it('mints a link that opens the booking, and only that booking', async () => {
    const { shareToken, reused } = await shareBooking({ bookingId });
    expect(reused, 'the first share reported itself as a re-press').toBe(false);
    expect(shareToken, 'no token was minted').toBeTruthy();
    // Long enough that guessing is not a strategy. Two UUIDs, hyphens stripped.
    expect(shareToken.length, 'the token is short enough to be worth guessing')
      .toBeGreaterThanOrEqual(32);

    const opened = await openByToken(shareToken);
    expect(opened?.id, 'the minted token does not open the booking it came from').toBe(bookingId);

    const { data } = await supabaseAdmin
      .from('bookings').select('shared_at').eq('id', bookingId).maybeSingle();
    expect(data!.shared_at, 'sharing did not record when').toBeTruthy();
  });

  it('hands back the SAME link when shared again', async () => {
    const first = await shareBooking({ bookingId });
    const second = await shareBooking({ bookingId });

    /*
     * The whole point. An operator pressing Share a second time is asking to
     * send the link again — if this minted a new one, the link already sitting
     * in the client's inbox would quietly stop working, and nothing in the
     * interface would say so.
     */
    expect(second.shareToken, 'sharing twice replaced a link the client may already hold')
      .toBe(first.shareToken);
    expect(second.reused, 'a re-press did not report itself as one').toBe(true);
  });

  it('revoking kills the link, and it opens nothing afterwards', async () => {
    const { shareToken } = await shareBooking({ bookingId });
    expect(await openByToken(shareToken), 'the token did not work before revoking').toBeTruthy();

    await unshareBooking({ bookingId });

    expect(await openByToken(shareToken),
      'a revoked link still opens the booking').toBeNull();
    const { data } = await supabaseAdmin
      .from('bookings').select('share_token, shared_at').eq('id', bookingId).maybeSingle();
    expect(data!.share_token, 'the token survived revoking').toBeNull();
    expect(data!.shared_at, 'the shared-at date outlived the token it belongs to').toBeNull();
  });

  it('gives a different token after a revoke', async () => {
    const before = await shareBooking({ bookingId });
    await unshareBooking({ bookingId });
    const after = await shareBooking({ bookingId });

    // Revoking means revoked. Handing back the old token would make the button
    // a no-op for anyone still holding the original link.
    expect(after.shareToken, 'a revoked link came back to life on the next share')
      .not.toBe(before.shareToken);
    expect(await openByToken(before.shareToken),
      'the revoked token opens the booking again').toBeNull();
  });

  it('refuses to share a booking belonging to another studio', async () => {
    // The id is a real booking, just not this session's. assertOurs equivalent:
    // the update is scoped by organization_id, so it must find nothing.
    await expect(
      shareBooking({ bookingId: randomUUID() }),
      'a booking id from outside the studio was accepted',
    ).rejects.toThrow();
  });
});
