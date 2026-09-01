import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { randomUUID } from 'crypto';

/**
 * A booking taken for somebody who has never booked before.
 *
 * createClient writes TWO rows and returns both keys — { clientId, contactId }.
 * A contact is the person; a client is that person in the role of buying
 * something. The new-booking form took clientId and handed it to createBooking
 * as its contactId, which asserts it against the contacts table, does not find
 * it, and throws.
 *
 * So a booking for a new client never saved, while one for an existing client
 * always did — the picker hands over a contact id — which is why it presented
 * as intermittent rather than broken. And by the time it threw, the contact and
 * the booking's package instance were already written, so every attempt left
 * both behind and told the operator nothing had happened.
 *
 * Both ids are strings, so nothing in the type system could see it. This is
 * what can.
 */

const TEST_ORG_ID = randomUUID();
const TEST_PERSON_ID = randomUUID();

vi.mock('@/lib/supabase/getOrgId', () => ({
  getAuthOrgId: async () => ({
    userId: 'new-client-booking', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
  getOptionalAuthOrgId: async () => ({
    userId: 'new-client-booking', orgId: TEST_ORG_ID, personId: TEST_PERSON_ID, contactId: TEST_PERSON_ID,
  }),
}));

import { createClient } from '@/modules/clients/domain';
import { createBooking } from '@/modules/bookings/domain';
import { PURGE_ORDER } from './purge';

describe('a booking for a client who did not exist a moment ago', () => {
  beforeAll(async () => {
    const { error } = await supabaseAdmin.from('organizations').insert({
      id: TEST_ORG_ID, name: 'New Client Studio', status: 'active',
    });
    if (error) throw new Error(`Could not seed the studio: ${error.message}`);

    // The actor every write is attributed to. logEvent refuses to record an
    // event it cannot attribute, and without this the failure surfaces as
    // "failed to persist event" from inside createClient — a long way from the
    // missing row that caused it.
    const { error: actorError } = await supabaseAdmin.from('contacts').insert({
      id: TEST_PERSON_ID, organization_id: TEST_ORG_ID, display_name: 'New Client Studio Owner',
    });
    if (actorError) throw new Error(`Could not seed the actor: ${actorError.message}`);

    const { error: stageError } = await supabaseAdmin.from('booking_stages').insert([
      { organization_id: TEST_ORG_ID, name: 'Enquiry', kind: 'enquiry', position: 0, is_default: true },
    ]);
    if (stageError) throw new Error(`Could not seed booking stages: ${stageError.message}`);
  });

  afterAll(async () => {
    for (const table of PURGE_ORDER) {
      await supabaseAdmin.from(table).delete().eq('organization_id', TEST_ORG_ID);
    }
    await supabaseAdmin.from('organizations').delete().eq('id', TEST_ORG_ID);
  });

  it('hands the booking the person, not the person-as-buyer', async () => {
    const made = await createClient({ name: 'Ngozi Madu', email: `ngozi+${randomUUID().slice(0, 8)}@example.com` });

    // The two keys are different rows. If they were ever the same this test
    // would pass while proving nothing, so it says so out loud first.
    expect(made.contactId, 'createClient no longer returns a contact id').toBeTruthy();
    expect(made.clientId).not.toBe(made.contactId);

    const { bookingId } = await createBooking({ contactId: made.contactId, brief: 'Called about a shoot' });
    expect(bookingId, 'a booking for a new client did not save').toBeTruthy();

    const { data: booking } = await supabaseAdmin
      .from('bookings').select('contact_id').eq('id', bookingId).maybeSingle();
    expect(booking?.contact_id, 'the booking points at something that is not the contact').toBe(made.contactId);
  });

  it('refuses the client id, which is what made this look like nothing happening', async () => {
    const made = await createClient({ name: 'Wrong Key', email: `wrong+${randomUUID().slice(0, 8)}@example.com` });

    // The exact call the form used to make. It must fail — assertOurs looks the
    // id up in contacts — and the point of pinning it is that the failure is
    // real rather than something the form could get away with.
    await expect(
      createBooking({ contactId: made.clientId, brief: 'Should not save' }),
      'a clients id was accepted as a contact id',
    ).rejects.toThrow();
  });
});
