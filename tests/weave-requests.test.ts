import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { sayRequests, type Request } from '@/weave/jobs/shape';

/**
 * Work arriving from outside.
 *
 * The property under test is that a request and the job it becomes are ONE
 * row, and that an unanswered or refused one is not work. Both are invariants
 * of the shape rather than of any screen, so they are checked here.
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

beforeAll(async () => {
  const { data, error } = await db.from('studios')
    .insert({ name: `Asking Test ${Date.now()}`, slug: `asking-test-${Date.now()}` })
    .select('id').single();
  if (error) throw error;
  studioId = data.id;
});

afterAll(async () => {
  if (studioId) await db.from('studios').delete().eq('id', studioId);
});

async function ask(name: string, when: string | null = null) {
  const { data: person } = await db.from('people')
    .insert({ studio_id: studioId, name, email: `${name.replace(/\W/g, '')}@weave.test` })
    .select('id').single();
  const { data: job, error } = await db.from('jobs').insert({
    studio_id: studioId, client_id: person!.id, wants: 'A sitting',
    expected_on: when, turn: 'us', requested_at: new Date().toISOString(),
  }).select('id').single();
  if (error) throw error;
  return job!.id;
}

describe('a request is a job nobody has answered', () => {
  it('arrives unanswered, and is therefore not on the board', async () => {
    const id = await ask('Unanswered');
    const { data } = await db.from('jobs')
      .select('accepted_at, declined_at, requested_at').eq('id', id).single();

    expect(data!.requested_at).toBeTruthy();
    expect(data!.accepted_at).toBeNull();
    expect(data!.declined_at).toBeNull();

    // The board reads only accepted work.
    const { count } = await db.from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).not('accepted_at', 'is', null);
    expect(count).toBe(0);
  });

  /*
   * The whole reason a request is not its own table: accepting must not copy
   * anything. The row the client asked about is the row the studio works on.
   */
  it('accepting keeps the same row, so nothing can drift', async () => {
    const id = await ask('Accepted', '2027-04-17');
    await db.from('jobs')
      .update({ accepted_at: new Date().toISOString(), turn: 'scheduled' }).eq('id', id);

    const { data } = await db.from('jobs')
      .select('id, wants, accepted_at, turn').eq('id', id).single();
    expect(data!.id).toBe(id);
    expect(data!.wants).toBe('A sitting');
    expect(data!.accepted_at).toBeTruthy();
    expect(data!.turn).toBe('scheduled');
  });

  it('a refused request is kept, and stays off the board', async () => {
    const id = await ask('Refused');
    await db.from('jobs').update({
      declined_at: new Date().toISOString(), declined_because: 'Not our thing',
    }).eq('id', id);

    const { data } = await db.from('jobs')
      .select('declined_at, declined_because').eq('id', id).single();
    expect(data!.declined_at).toBeTruthy();
    expect(data!.declined_because).toBe('Not our thing');

    const { count } = await db.from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('id', id).not('accepted_at', 'is', null);
    expect(count).toBe(0);
  });

  it('cannot be both taken and refused', async () => {
    const id = await ask('Both');
    const now = new Date().toISOString();
    const { error } = await db.from('jobs')
      .update({ accepted_at: now, declined_at: now }).eq('id', id);
    expect(error).toBeTruthy();
  });

  /*
   * The reason a refusal was recorded and the reply sent back are two
   * different things, written for two different readers. A reading built for
   * the client must never carry the private one — this is the kind of leak
   * that gets reintroduced by someone adding a column to a select.
   */
  it('keeps the studio\'s private reason out of what the asker can read', async () => {
    const id = await ask('Refused Privately');
    await db.from('jobs').update({
      declined_at: new Date().toISOString(),
      declined_because: 'PRIVATE: not worth the rate',
      answered_with: 'Thank you for asking, we cannot take this one.',
      request_token: 'test-token-' + Date.now(),
    }).eq('id', id);

    const { data: token } = await db.from('jobs')
      .select('request_token').eq('id', id).single();

    // The same select the client-facing reading uses.
    const { data: asAsked } = await db.from('jobs')
      .select('wants, expected_on, requested_at, accepted_at, declined_at, '
        + 'answered_with, studio:studios(name, slug)')
      .eq('request_token', token!.request_token).maybeSingle();

    expect(asAsked).toBeTruthy();
    expect(JSON.stringify(asAsked)).not.toContain('PRIVATE');
    expect((asAsked as unknown as { answered_with: string }).answered_with)
      .toContain('cannot take this one');
  });

  it('every studio gets an address to be asked at', async () => {
    const { data } = await db.from('studios').select('slug').eq('id', studioId).single();
    expect(data!.slug).toBeTruthy();
  });
});

describe('how waiting is said', () => {
  const one = (over: Partial<Request> = {}): Request => ({
    id: 'a', wants: 'A sitting', expectedOn: null, askedBy: 'Ada',
    askedByEmail: 'ada@weave.test', requestedAt: new Date().toISOString(),
    token: 'tok', ...over,
  });

  it('says the silence rather than showing nothing', () => {
    expect(sayRequests([])).toBe('No pending requests.');
  });

  it('counts people, not rows', () => {
    expect(sayRequests([one()])).toBe('1 request awaiting a response.');
    expect(sayRequests([one(), one({ id: 'b' })])).toBe('2 requests awaiting a response.');
  });
});
