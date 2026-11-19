import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

/**
 * Somebody who asks twice.
 *
 * A booking request always makes a NEW person rather than attaching a
 * stranger to an existing client on the strength of a typed email, so a
 * studio can legitimately hold two people with one address. The gallery then
 * has to work out which one is looking.
 *
 * It used to resolve with `.eq(email).maybeSingle()`, which does not return
 * the first of two — it throws — so anyone who enquired twice was locked out
 * of their own pictures and nothing said so. These tests hold the resolution
 * rule rather than the symptom.
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
const email = `asked-twice-${Date.now()}@weave.test`;
let firstPersonId: string;
let secondPersonId: string;
let galleryId: string;

beforeAll(async () => {
  const { data: studio, error } = await db.from('studios')
    .insert({ name: `Repeat Test ${Date.now()}` }).select('id').single();
  if (error) throw error;
  studioId = studio.id;

  // Two requests from one address: two people, exactly as requestBooking does.
  const { data: first } = await db.from('people')
    .insert({ studio_id: studioId, name: 'Asked Twice', email }).select('id').single();
  firstPersonId = first!.id;

  const { data: second } = await db.from('people')
    .insert({ studio_id: studioId, name: 'Asked Twice', email }).select('id').single();
  secondPersonId = second!.id;

  // The studio took on the SECOND one, and that job has the gallery.
  const { data: job } = await db.from('jobs').insert({
    studio_id: studioId, client_id: secondPersonId, turn: 'scheduled',
    accepted_at: new Date().toISOString(),
  }).select('id').single();

  const { data: gallery } = await db.from('galleries')
    .insert({ studio_id: studioId, job_id: job!.id, name: 'Theirs' })
    .select('id').single();
  galleryId = gallery!.id;
});

afterAll(async () => {
  if (studioId) await db.from('studios').delete().eq('id', studioId);
});

describe('asking twice', () => {
  it('really does leave two people with one address', async () => {
    const { data } = await db.from('people')
      .select('id').eq('studio_id', studioId).eq('email', email);
    expect(data).toHaveLength(2);
  });

  /*
   * The exact call the gallery used to make. Kept as a test so nobody
   * reintroduces it: it reads like a safe lookup and is a lockout.
   */
  it('is why maybeSingle on an email throws', async () => {
    const { error } = await db.from('people').select('id')
      .eq('studio_id', studioId).eq('email', email).maybeSingle();
    expect(error, 'maybeSingle should refuse two rows').toBeTruthy();
  });

  it('listing them instead returns both, oldest first', async () => {
    const { data, error } = await db.from('people').select('id')
      .eq('studio_id', studioId).eq('email', email)
      .order('created_at', { ascending: true });
    expect(error).toBeNull();
    expect(data!.map((r) => r.id)).toEqual([firstPersonId, secondPersonId]);
  });

  /*
   * The rule itself. Not "pick one" — pick the one the GALLERY is for, which
   * is the person the studio means and the row their keeps and orders should
   * land on.
   */
  it('resolves to the person the gallery is for, not merely the first', async () => {
    const { data: gallery } = await db.from('galleries')
      .select('job:jobs(client_id)').eq('id', galleryId).maybeSingle();
    const client = (gallery as unknown as { job: { client_id: string } | null })?.job?.client_id;

    const { data: rows } = await db.from('people').select('id')
      .eq('studio_id', studioId).eq('email', email)
      .order('created_at', { ascending: true });

    const resolved = rows!.find((r) => r.id === client)?.id ?? rows![0].id;

    expect(resolved).toBe(secondPersonId);
    expect(resolved).not.toBe(firstPersonId);
  });
});
