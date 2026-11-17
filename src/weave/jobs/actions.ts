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

  revalidatePath('/');
  return { id: job.id };
}

/**
 * One job, with everything that has happened to it.
 *
 * The history is read from the log rather than reconstructed from the row,
 * because the row only knows where the job ended up. What a studio needs when
 * something has gone wrong is the sequence, and a row cannot tell you that.
 */
export type JobDetail = {
  id: string;
  clientName: string | null;
  wants: string | null;
  expectedOn: string | null;
  turn: Turn;
  startedAt: string;
  history: { id: string; action: string; at: string; payload: Record<string, unknown> }[];
};

export async function readJob(id: string): Promise<JobDetail | null> {
  const who = await whoIsAsking();
  if (!who) return null;

  const [job, log] = await Promise.all([
    db.from('jobs')
      .select('id, wants, expected_on, turn, created_at, client:people(name)')
      .eq('id', id)
      .eq('studio_id', who.studioId)
      .maybeSingle(),
    db.from('events')
      .select('id, action, at, payload')
      .eq('studio_id', who.studioId)
      .eq('subject_type', 'job')
      .eq('subject_id', id)
      .order('at', { ascending: false }),
  ]);

  if (job.error) {
    console.error('Failed to read the job:', job.error);
    throw new Error('Could not read that job');
  }
  if (!job.data) return null;

  const row = job.data as unknown as {
    id: string; wants: string | null; expected_on: string | null;
    turn: Turn; created_at: string; client: { name: string } | null;
  };

  return {
    id: row.id,
    clientName: row.client?.name ?? null,
    wants: row.wants,
    expectedOn: row.expected_on,
    turn: row.turn,
    startedAt: row.created_at,
    history: (log.data ?? []) as JobDetail['history'],
  };
}

/**
 * Change what a job says.
 *
 * Both fields may be emptied again — a date that turns out to be wrong is
 * worse than no date, and the system should not make somebody keep a thing
 * they know to be untrue.
 */
export async function amendJob(input: {
  jobId: string;
  wants?: string | null;
  expectedOn?: string | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const patch: Record<string, string | null> = {};
  if (input.wants !== undefined) patch.wants = input.wants?.trim() || null;
  if (input.expectedOn !== undefined) patch.expected_on = input.expectedOn || null;
  if (Object.keys(patch).length === 0) return;

  const { error } = await db
    .from('jobs')
    .update(patch)
    .eq('id', input.jobId)
    .eq('studio_id', who.studioId);

  if (error) {
    console.error('Failed to amend the job:', error);
    throw new Error('Could not save that');
  }

  await db.from('events').insert({
    studio_id: who.studioId,
    subject_type: 'job',
    subject_id: input.jobId,
    action: 'amended',
    actor_id: who.personId,
    payload: patch,
  });

  revalidatePath('/');
  revalidatePath(`/jobs/${input.jobId}`);
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

  revalidatePath('/');
  revalidatePath(`/jobs/${input.jobId}`);
}
