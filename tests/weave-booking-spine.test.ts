import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

/**
 * The spine of a booking: client, package, and what happens on it.
 *
 * Written the day the sediment came out. The `weave` floor was laid in two
 * days and its own comments justify columns by saying the previous system had
 * found them useful — which is not a derivation. Three columns were cleared
 * out on 2026-11-26, and this file is what stops them coming back:
 *
 *   title        dead from the first day
 *   stage_id     a second stored position beside `turn`
 *   expected_on  a date on the booking, beside the occasions that held dates
 *
 * `expected_on` became `asked_for` — the date a client ASKED for, which is a
 * fact about the request and not a schedule. The schedule was `weave.occasions`
 * and that is gone too, so `asked_for` is now the only date a booking has and
 * it still is not a schedule.
 */

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    db: { schema: 'weave' },
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  },
);

let studioId: string;
let personId: string;
let packageId: string;

beforeAll(async () => {
  const { data: studio, error } = await db
    .from('studios').insert({ name: `Spine Test ${Date.now()}` }).select('id').single();
  if (error) throw error;
  studioId = studio.id;

  const { data: person } = await db.from('people')
    .insert({ studio_id: studioId, name: 'Ada Okafor' }).select('id').single();
  personId = person!.id;

  const { data: pack } = await db.from('packages')
    .insert({ studio_id: studioId, name: 'The Wedding Day' }).select('id').single();
  packageId = pack!.id;
});

afterAll(async () => {
  if (studioId) await db.from('studios').delete().eq('id', studioId);
});

describe('a booking keeps no schedule of its own', () => {
  it('has no column to hold a date in', async () => {
    const { error } = await db.from('bookings')
      .select('expected_on').eq('studio_id', studioId).limit(1);

    expect(error, 'a booking still has a date of its own').not.toBeNull();
  });

  it('has no second position beside turn, and no stages table behind it', async () => {
    const column = await db.from('bookings')
      .select('stage_id').eq('studio_id', studioId).limit(1);
    const table = await db.from('stages').select('id').limit(1);

    expect(column.error, 'stage_id came back').not.toBeNull();
    expect(table.error, 'the stages table came back').not.toBeNull();
  });

  it('has no title, which nothing ever read', async () => {
    const { error } = await db.from('bookings')
      .select('title').eq('studio_id', studioId).limit(1);

    expect(error, 'title came back').not.toBeNull();
  });

  /*
   * The date that survived, and the reason it survived: it is not the
   * schedule. Somebody the studio has never met types it into the public form
   * before anything is arranged, and nothing else in the system holds it.
   */
  it('still records the date a client asked for, which is a different fact', async () => {
    const { data, error } = await db.from('bookings').insert({
      studio_id: studioId, client_id: personId,
      asked_for: '2027-06-12', requested_at: new Date().toISOString(),
    }).select('asked_for').single();

    expect(error).toBeNull();
    expect(data!.asked_for).toBe('2027-06-12');
  });
});

describe('when a booking happens', () => {
  /*
   * A property of the booking, not a row beside it. `weave.occasions` held
   * this and was removed because a thing that happens belongs to the work.
   * A column holds ONE value, which is the trade: a wedding with an
   * engagement shoot besides is two bookings now, not one with two days.
   */
  it('carries a day and an hour of its own', async () => {
    const { data, error } = await db.from('bookings').insert({
      studio_id: studioId, client_id: personId,
      scheduled_for: '2027-04-10', at: '15:00',
    }).select('scheduled_for, at').single();

    expect(error).toBeNull();
    expect(data!.scheduled_for).toBe('2027-04-10');
    expect(data!.at).toBe('15:00:00');
  });

  /*
   * ONE TIME, NOT A SPAN. A start and an end came across from occasions,
   * where the pair fed double-booking detection by comparing spans. That
   * mechanism went with `weave.crew`, so the end informed nobody.
   */
  it('has no end time, because nothing was left to compare spans', async () => {
    const { error } = await db.from('bookings')
      .select('ends_at').eq('studio_id', studioId).limit(1);

    expect(error, 'an end time came back').not.toBeNull();
  });

  /* The day may be unsettled. Agreed with no date is a real state. */
  it('may have no day at all', async () => {
    const { error } = await db.from('bookings')
      .insert({ studio_id: studioId, client_id: personId });

    expect(error, 'a booking was made to carry a date').toBeNull();
  });

  /* An hour with no day is a number, not a time. */
  it('refuses a time with no day behind it', async () => {
    const { error } = await db.from('bookings')
      .insert({ studio_id: studioId, client_id: personId, at: '15:00' });

    expect(error, 'an hour was accepted with no day').not.toBeNull();
  });

  /* A day with no hour is a real answer: booked for Saturday, time to agree. */
  it('allows a day with no hour', async () => {
    const { error } = await db.from('bookings')
      .insert({ studio_id: studioId, client_id: personId, scheduled_for: '2027-04-11' });

    expect(error, 'a day without an hour was refused').toBeNull();
  });

  /*
   * TWO DATES, AND THEY ARE DIFFERENT FACTS. What a client asked for and what
   * was agreed are both worth knowing, and one column cannot say both.
   */
  it('keeps what was asked for apart from what was agreed', async () => {
    const { data, error } = await db.from('bookings').insert({
      studio_id: studioId, client_id: personId,
      asked_for: '2027-06-12', scheduled_for: '2027-06-19',
    }).select('asked_for, scheduled_for').single();

    expect(error).toBeNull();
    expect(data!.asked_for).toBe('2027-06-12');
    expect(data!.scheduled_for).toBe('2027-06-19');
  });
});

describe('what a booking is for', () => {
  /*
   * FREE TEXT, NEVER A LIST. The system before last hardcoded birthday and
   * wedding; nothing in this engine behaves differently for one than another,
   * so nothing earns a fixed set of values.
   */
  it('takes the word the studio types, exactly as typed', async () => {
    const { data, error } = await db.from('bookings').insert({
      studio_id: studioId, client_id: personId, occasion: 'Naming Ceremony',
    }).select('occasion').single();

    expect(error).toBeNull();
    expect(data!.occasion, 'the word was re-cased').toBe('Naming Ceremony');
  });

  /*
   * THE OCCASION'S DAY AND THE STUDIO'S DAY COME APART. A pre-wedding session
   * is shot before the wedding; a christening may be photographed the day
   * after. Neither is derived from the other, deliberately — a default would
   * make the copy silently, which is how the last pair of dates drifted.
   */
  it('keeps the occasion day apart from the day the studio works', async () => {
    const { data, error } = await db.from('bookings').insert({
      studio_id: studioId, client_id: personId,
      occasion: 'Wedding', occasion_on: '2027-06-14', scheduled_for: '2027-06-02',
    }).select('occasion_on, scheduled_for').single();

    expect(error).toBeNull();
    expect(data!.occasion_on).toBe('2027-06-14');
    expect(data!.scheduled_for).toBe('2027-06-02');
  });

  it('may have an occasion with no day, and a day with no occasion', async () => {
    const named = await db.from('bookings')
      .insert({ studio_id: studioId, client_id: personId, occasion: 'Headshots' });
    const dated = await db.from('bookings')
      .insert({ studio_id: studioId, client_id: personId, occasion_on: '2027-08-01' });

    expect(named.error).toBeNull();
    expect(dated.error).toBeNull();
  });
});

describe('a client books a package', () => {
  it('a booking points at the package it is for', async () => {
    const { data, error } = await db.from('bookings')
      .insert({ studio_id: studioId, client_id: personId, package_id: packageId })
      .select('package_id').single();

    expect(error).toBeNull();
    expect(data!.package_id).toBe(packageId);
  });

  /*
   * Why the column is nullable rather than required. Deleting a package must
   * never delete the work that was sold under it, so the reference has to be
   * allowed to go. `not null` and that rule cannot both hold, so the schema
   * stays honest about what can happen and the DOOR is what insists.
   */
  it('survives the package being deleted, standing with none', async () => {
    const { data: pack } = await db.from('packages')
      .insert({ studio_id: studioId, name: 'Withdrawn' }).select('id').single();
    const { data: booking } = await db.from('bookings')
      .insert({ studio_id: studioId, client_id: personId, package_id: pack!.id })
      .select('id').single();

    await db.from('packages').delete().eq('id', pack!.id);

    const { data: after } = await db.from('bookings')
      .select('id, package_id').eq('id', booking!.id).single();

    expect(after, 'the booking went with the package').not.toBeNull();
    expect(after!.package_id).toBeNull();
  });
});
