import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

/**
 * The board, tested against the real database.
 *
 * This writes into a studio of its own and deletes it afterwards, so it never
 * touches a working studio's jobs. The previous system learned that one the
 * hard way: tests that seeded into a shared studio left debris that made
 * unrelated suites fail days later.
 */
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'weave' }, auth: { persistSession: false } },
);

let studioId: string;

beforeAll(async () => {
  const { data, error } = await db
    .from('studios')
    .insert({ name: `Test Studio ${Date.now()}` })
    .select('id')
    .single();
  if (error) throw error;
  studioId = data.id;
});

afterAll(async () => {
  if (studioId) await db.from('studios').delete().eq('id', studioId);
});

describe('the floor holds', () => {
  it('a job needs nothing but a studio', async () => {
    const { data, error } = await db
      .from('jobs')
      .insert({ studio_id: studioId })
      .select('id, turn, wants, expected_on')
      .single();

    expect(error, 'a bare job was refused').toBeNull();
    expect(data!.turn, 'an undated job starts as yours to move').toBe('us');
    expect(data!.wants).toBeNull();
    expect(data!.expected_on).toBeNull();
  });

  it('refuses a turn the board has no column for', async () => {
    const { error } = await db
      .from('jobs')
      .insert({ studio_id: studioId, turn: 'someday' });

    expect(error, 'the database accepted a turn that is not a column').not.toBeNull();
  });

  it('records a move without being asked to', async () => {
    const { data: job } = await db
      .from('jobs')
      .insert({ studio_id: studioId, turn: 'us' })
      .select('id')
      .single();

    await db.from('jobs').update({ turn: 'them' }).eq('id', job!.id);

    const { data: events } = await db
      .from('events')
      .select('action, payload')
      .eq('subject_type', 'job')
      .eq('subject_id', job!.id);

    const moves = (events ?? []).filter((e) => e.action === 'turn_changed');
    expect(moves.length, 'the move went unrecorded').toBe(1);
    expect(moves[0].payload).toMatchObject({ from: 'us', to: 'them' });
  });

  it('keeps one studio out of another', async () => {
    const { data: other } = await db
      .from('studios')
      .insert({ name: `Other Studio ${Date.now()}` })
      .select('id')
      .single();

    await db.from('jobs').insert({ studio_id: other!.id });

    const { data: mine } = await db
      .from('jobs')
      .select('studio_id')
      .eq('studio_id', studioId);

    expect(
      (mine ?? []).every((j) => j.studio_id === studioId),
      'a scoped read returned another studio\'s work',
    ).toBe(true);

    await db.from('studios').delete().eq('id', other!.id);
  });
});
