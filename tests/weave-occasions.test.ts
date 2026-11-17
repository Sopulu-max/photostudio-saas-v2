import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { standingOf, sayWhen, sayCrew, type Occasion } from '@/weave/occasions/shape';

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
let jobId: string;
let personId: string;

beforeAll(async () => {
  const { data: studio, error } = await db
    .from('studios').insert({ name: `Test Studio ${Date.now()}` }).select('id').single();
  if (error) throw error;
  studioId = studio.id;

  const { data: person } = await db
    .from('people').insert({ studio_id: studioId, name: 'Test Person' }).select('id').single();
  personId = person!.id;

  const { data: job } = await db
    .from('jobs').insert({ studio_id: studioId }).select('id').single();
  jobId = job!.id;
});

afterAll(async () => {
  if (studioId) await db.from('studios').delete().eq('id', studioId);
});

describe('what happens', () => {
  it('can happen without belonging to a job', async () => {
    const { error } = await db
      .from('occasions')
      .insert({ studio_id: studioId, on_date: '2026-12-01', what: 'Maintenance day' });

    expect(error, 'an occasion with no job was refused').toBeNull();
  });

  it('needs a day', async () => {
    const { error } = await db
      .from('occasions')
      .insert({ studio_id: studioId, job_id: jobId, what: 'Someday' });

    expect(error, 'an occasion was accepted with no date').not.toBeNull();
  });

  it('refuses to end before it starts', async () => {
    const { error } = await db.from('occasions').insert({
      studio_id: studioId, job_id: jobId, on_date: '2026-12-02',
      starts_at: '14:00', ends_at: '10:00',
    });

    expect(error, 'an occasion was accepted that ends before it begins').not.toBeNull();
  });

  it('puts a person on once, however many times asked', async () => {
    const { data: occasion } = await db
      .from('occasions')
      .insert({ studio_id: studioId, job_id: jobId, on_date: '2026-12-03' })
      .select('id').single();

    await db.from('crew').insert({
      studio_id: studioId, occasion_id: occasion!.id, person_id: personId,
    });
    const { error: second } = await db.from('crew').insert({
      studio_id: studioId, occasion_id: occasion!.id, person_id: personId,
    });

    expect(second, 'the same person went on twice').not.toBeNull();

    const { data: crew } = await db
      .from('crew').select('id').eq('occasion_id', occasion!.id);
    expect(crew!.length).toBe(1);
  });

  it('goes with the job when the job goes', async () => {
    const { data: job } = await db
      .from('jobs').insert({ studio_id: studioId }).select('id').single();
    const { data: occasion } = await db
      .from('occasions')
      .insert({ studio_id: studioId, job_id: job!.id, on_date: '2026-12-04' })
      .select('id').single();

    await db.from('jobs').delete().eq('id', job!.id);

    const { data: left } = await db
      .from('occasions').select('id').eq('id', occasion!.id).maybeSingle();
    expect(left, 'an occasion outlived the job it belonged to').toBeNull();
  });
});

describe('how an occasion stands', () => {
  const base: Occasion = {
    id: 'x', jobId: null, what: 'The shoot', onDate: '2026-11-20',
    startsAt: '10:00:00', endsAt: '14:00:00', happenedAt: null, crew: [],
  };

  it('is derived, never stored', () => {
    expect(standingOf(base, '2026-11-20')).toBe('today');
    expect(standingOf(base, '2026-11-19')).toBe('ahead');
    expect(standingOf(base, '2026-11-21')).toBe('unmarked');
    expect(standingOf({ ...base, happenedAt: '2026-11-20T12:00:00Z' }, '2026-11-25')).toBe('done');
  });

  it('says itself without a legend', () => {
    expect(sayWhen(base)).toBe('Fri 20 Nov, 10:00–14:00');
    expect(sayWhen({ ...base, startsAt: null, endsAt: null })).toBe('Fri 20 Nov');
    expect(sayCrew(base)).toBe('Nobody on it');
    expect(sayCrew({ ...base, crew: [{ id: 'a', personId: 'p', name: 'Chidi' }] })).toBe('Chidi');
  });
});
