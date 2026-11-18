import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';

/**
 * Founding a studio.
 *
 * These run against the real function rather than a model of it, because what
 * is being asserted is a property of the transaction — that it cannot leave an
 * account half-attached, and that it cannot be talked into attaching one to
 * somebody else's studio. Neither is visible from TypeScript.
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

const madeStudios: string[] = [];

async function found(authUserId: string, email: string, studioName: string, personName = '') {
  const { data, error } = await db.rpc('found_studio', {
    p_auth_user_id: authUserId,
    p_email: email,
    p_studio_name: studioName,
    p_person_name: personName,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { studio_id: string; person_id: string };
  if (row?.studio_id && !madeStudios.includes(row.studio_id)) madeStudios.push(row.studio_id);
  return row;
}

afterAll(async () => {
  for (const id of madeStudios) await db.from('studios').delete().eq('id', id);
});

describe('founding a studio', () => {
  it('creates the studio and the person as one act', async () => {
    const user = randomUUID();
    const row = await found(user, `founder-${Date.now()}@weave.test`, 'Tide & Grain');

    expect(row.studio_id).toBeTruthy();
    expect(row.person_id).toBeTruthy();

    const { data: studio } = await db.from('studios').select('name').eq('id', row.studio_id).single();
    expect(studio!.name).toBe('Tide & Grain');

    const { data: person } = await db.from('people')
      .select('studio_id, auth_user_id').eq('id', row.person_id).single();
    expect(person!.studio_id).toBe(row.studio_id);
    expect(person!.auth_user_id).toBe(user);
  });

  /*
   * The reason it has to be idempotent: it is called after sign-up and again
   * from the confirmation callback, and which of those runs depends on a
   * project setting the app does not read.
   */
  it('called twice, founds once', async () => {
    const user = randomUUID();
    const email = `twice-${Date.now()}@weave.test`;
    const first = await found(user, email, 'Second Light');
    const again = await found(user, email, 'Second Light');

    expect(again.studio_id).toBe(first.studio_id);
    expect(again.person_id).toBe(first.person_id);

    /*
     * Counted by the ACCOUNT, not by the studio's name. Counting by name made
     * this fail whenever an earlier run died before its cleanup and left a
     * 'Second Light' behind — a test that reports someone else's litter as
     * this code's bug is worse than no test.
     */
    const { count } = await db.from('people')
      .select('id', { count: 'exact', head: true }).eq('auth_user_id', user);
    expect(count).toBe(1);
  });

  /*
   * The one that matters. `people` holds a studio's clients as well as its
   * operators, so if founding matched on email, registering with a client's
   * address would hand over that studio.
   */
  it('refuses to join a studio just because it already knows the email', async () => {
    const owner = randomUUID();
    const clientEmail = `client-${Date.now()}@weave.test`;
    const theirs = await found(owner, `owner-${Date.now()}@weave.test`, 'Harbour Light');

    // A client of that studio, with no account of their own.
    await db.from('people').insert({
      studio_id: theirs.studio_id, name: 'A Client', email: clientEmail, auth_user_id: null,
    });

    // A stranger registers with the client's address.
    const stranger = randomUUID();
    const mine = await found(stranger, clientEmail, 'Not Harbour Light');

    expect(mine.studio_id).not.toBe(theirs.studio_id);

    const { data: landed } = await db.from('studios').select('name').eq('id', mine.studio_id).single();
    expect(landed!.name).toBe('Not Harbour Light');

    // And the client row was left exactly as it was.
    const { data: untouched } = await db.from('people')
      .select('auth_user_id').eq('studio_id', theirs.studio_id).eq('email', clientEmail).single();
    expect(untouched!.auth_user_id).toBeNull();
  });

  it('will not found a nameless studio', async () => {
    await expect(found(randomUUID(), 'nameless@weave.test', '   ')).rejects.toThrow();
  });

  it('keeps one account to one person within a studio', async () => {
    const user = randomUUID();
    const row = await found(user, `dupe-${Date.now()}@weave.test`, 'One Each');

    const { error } = await db.from('people').insert({
      studio_id: row.studio_id, name: 'The same person again',
      email: 'dupe2@weave.test', auth_user_id: user,
    });
    expect(error).toBeTruthy();
  });
});
