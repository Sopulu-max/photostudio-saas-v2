import { describe, it, expect } from 'vitest';
import {
  duplicatesOf, sayClient, sayClients, sayDuplicates, type Client,
} from '@/weave/clients/shape';

/**
 * The clients, as the studio reads them.
 *
 * A client is derived, not stored: a person a booking points at. These lock
 * the readings that derivation produces, and the one absence it cannot hide —
 * the duplicates that every public enquiry creates on purpose.
 */

const client = (over: Partial<Client> = {}): Client => ({
  id: over.name ?? 'id',
  name: 'Ada Okafor',
  email: null,
  phone: null,
  bookings: 1,
  waiting: 0,
  next: null,
  last: null,
  spent: 0,
  currency: 'NGN',
  since: '2026-01-01T00:00:00Z',
  ...over,
});

describe('where one client stands', () => {
  /*
   * The live fact, and only one of them. A row that listed what is coming AND
   * what last happened AND the spend would be a record, not a reading.
   */
  it('leads with an answer the studio owes, over anything booked', () => {
    const said = sayClient(client({ waiting: 1, next: '2027-07-04', last: '2026-10-01' }));

    expect(said).toBe('Waiting on an answer');
  });

  it('names the next shoot ahead of the last one', () => {
    expect(sayClient(client({ next: '2027-07-04', last: '2026-10-01' })))
      .toBe('Next shoot 4 Jul 2027');
  });

  it('falls back to what last happened', () => {
    expect(sayClient(client({ last: '2026-10-01' }))).toBe('Last shot 1 Oct 2026');
  });

  it('counts more than one unanswered request', () => {
    expect(sayClient(client({ waiting: 3 }))).toBe('3 requests waiting on an answer');
  });

  /* Agreed work with no day is a real state and a studio should see it. */
  it('says when agreed work has no day', () => {
    expect(sayClient(client({ bookings: 2 }))).toBe('No date set');
  });

  it('states an absence rather than leaving a gap', () => {
    expect(sayClient(client({ bookings: 0 }))).toBe('No bookings');
  });
});

describe('the client list, said as the studio', () => {
  it('states the absence', () => {
    expect(sayClients([])).toBe('No clients.');
  });

  it('leads with anybody owed an answer, because that can be acted on', () => {
    const said = sayClients([
      client({ name: 'a', waiting: 1 }),
      client({ name: 'b' }),
    ]);

    expect(said).toBe('2 clients, 1 waiting on an answer.');
  });

  it('otherwise counts the work ahead', () => {
    expect(sayClients([client({ name: 'a', next: '2027-07-04' }), client({ name: 'b' })]))
      .toBe('2 clients, 1 with a shoot ahead.');
  });

  it('reads one client as the ordinary beginning, not a deficiency', () => {
    expect(sayClients([client()])).toBe('1 client.');
  });
});

describe('the duplicates every enquiry creates', () => {
  /*
   * `requestBooking` writes a NEW person every time, deliberately: matching on
   * a typed email would hand a stranger somebody else's history. The merge
   * that answers for it does not exist, so the list says so.
   */
  it('finds people who share an email address', () => {
    const groups = duplicatesOf([
      client({ name: 'Ada Okafor', email: 'ada@example.com' }),
      client({ name: 'Ada Okafor', email: 'ADA@example.com ' }),
      client({ name: 'Tobi Balogun', email: 'tobi@example.com' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  /* A client the studio has no email for is not a duplicate of the next one. */
  it('never groups people by a missing email', () => {
    expect(duplicatesOf([client({ name: 'a' }), client({ name: 'b' })])).toEqual([]);
  });

  it('says nothing when there is nothing to say', () => {
    expect(sayDuplicates([])).toBeNull();
  });

  it('counts the records, not the addresses, because records are what is shown', () => {
    const groups = duplicatesOf([
      client({ name: 'a', email: 'ada@example.com' }),
      client({ name: 'b', email: 'ada@example.com' }),
      client({ name: 'c', email: 'ada@example.com' }),
    ]);

    expect(sayDuplicates(groups)).toBe('3 records share one email address.');
  });
});
