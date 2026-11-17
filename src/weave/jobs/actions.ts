'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import { COLUMNS, type Board, type Turn } from './shape';

/**
 * Jobs, read as a board.
 *
 * Grouped by WHOSE TURN IT IS rather than by stage of production. In a studio
 * most waiting is not the studio's own — the client has not chosen selects, has
 * not approved, has not paid — and a board that shows those beside your own
 * work misreports the day's load every time it is looked at.
 */
export async function readBoard(): Promise<Board> {
  const who = await whoIsAsking();
  if (!who) return COLUMNS.map((c) => ({ ...c, jobs: [] }));

  /*
   * One query for the whole board. A board is read constantly, and four round
   * trips to draw one screen is how an app starts feeling like a website.
   *
   * Finished work is capped below: a done column that grows forever stops being
   * a reading and becomes an archive, and nobody scrolls an archive.
   */
  const { data, error } = await db
    .from('jobs')
    .select('id, wants, expected_on, turn, client:people(name)')
    .eq('studio_id', who.studioId)
    .order('expected_on', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to read the board:', error);
    throw new Error('Could not read the board');
  }

  const rows = (data ?? []) as unknown as {
    id: string; wants: string | null; expected_on: string | null;
    turn: Turn; client: { name: string } | null;
  }[];

  return COLUMNS.map((col) => ({
    ...col,
    jobs: rows
      .filter((r) => r.turn === col.turn)
      .slice(0, col.turn === 'done' ? 10 : undefined)
      .map((r) => ({
        id: r.id,
        wants: r.wants,
        expectedOn: r.expected_on,
        clientName: r.client?.name ?? null,
        turn: r.turn,
      })),
  }));
}

/**
 * Start a job from what you actually know.
 *
 * A name is the only thing required. The client does not have to exist first —
 * a name that is new becomes a person — because making somebody visit a Clients
 * screen before they may write down a job is the ceremony this system exists to
 * remove.
 */
export async function createJob(input: {
  clientName: string;
  wants?: string;
  expectedOn?: string | null;
}): Promise<{ id: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const name = input.clientName.trim();
  if (!name) throw new Error('A job needs somebody it is for');

  /*
   * Match an existing person by the studio's own spelling before making a
   * second one. Exact match only: deciding that "Ada O." is "Ada Okafor" is the
   * kind of helpfulness that quietly merges two different clients.
   */
  const { data: found } = await db
    .from('people')
    .select('id')
    .eq('studio_id', who.studioId)
    .eq('name', name)
    .maybeSingle();

  let clientId: string | null = found?.id ?? null;

  if (!clientId) {
    const { data: made, error } = await db
      .from('people')
      .insert({ studio_id: who.studioId, name })
      .select('id')
      .single();
    if (error) {
      console.error('Failed to add the client:', error);
      throw new Error('Could not add that client');
    }
    clientId = made.id;
  }

  const { data: job, error: jobError } = await db
    .from('jobs')
    .insert({
      studio_id: who.studioId,
      client_id: clientId,
      wants: input.wants?.trim() || null,
      expected_on: input.expectedOn || null,
      // A dated job is not waiting on anybody yet; an undated one needs you.
      turn: input.expectedOn ? 'scheduled' : 'us',
    })
    .select('id')
    .single();

  if (jobError) {
    console.error('Failed to start the job:', jobError);
    throw new Error('Could not start that job');
  }

  await db.from('events').insert({
    studio_id: who.studioId,
    subject_type: 'job',
    subject_id: job.id,
    action: 'started',
    actor_id: who.personId,
    payload: { client: name },
  });

  revalidatePath('/board');
  return { id: job.id };
}

/** Move a job to another column. The database records the transition itself. */
export async function moveJob(input: { jobId: string; turn: Turn }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { error } = await db
    .from('jobs')
    .update({ turn: input.turn })
    .eq('id', input.jobId)
    .eq('studio_id', who.studioId);

  if (error) {
    console.error('Failed to move the job:', error);
    throw new Error('Could not move that job');
  }

  revalidatePath('/board');
}
