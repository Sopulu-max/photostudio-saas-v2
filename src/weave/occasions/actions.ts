'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type { Occasion } from './shape';

type Row = {
  id: string; job_id: string | null; what: string | null; on_date: string;
  starts_at: string | null; ends_at: string | null; happened_at: string | null;
  crew: { id: string; person_id: string; person: { name: string } | null }[];
};

const SELECT = 'id, job_id, what, on_date, starts_at, ends_at, happened_at, '
  + 'crew:crew(id, person_id, person:people(name))';

function shape(r: Row): Occasion {
  return {
    id: r.id,
    jobId: r.job_id,
    what: r.what,
    onDate: r.on_date,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    happenedAt: r.happened_at,
    crew: (r.crew ?? []).map((c) => ({
      id: c.id,
      personId: c.person_id,
      name: c.person?.name ?? 'Somebody',
    })),
  };
}

/** Everything that is to happen, or has happened, on one job. */
export async function occasionsForJob(jobId: string): Promise<Occasion[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db
    .from('occasions')
    .select(SELECT)
    .eq('studio_id', who.studioId)
    .eq('job_id', jobId)
    .order('on_date', { ascending: true })
    .order('starts_at', { ascending: true, nullsFirst: true });

  if (error) {
    console.error('Failed to read the occasions:', error);
    throw new Error('Could not read what is happening on this job');
  }
  return ((data ?? []) as unknown as Row[]).map(shape);
}

/**
 * Everything happening in a span, whichever job it belongs to — and things
 * that belong to no job at all, which is why this reads by date and not
 * through jobs.
 */
export async function occasionsBetween(from: string, to: string): Promise<Occasion[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db
    .from('occasions')
    .select(SELECT)
    .eq('studio_id', who.studioId)
    .gte('on_date', from)
    .lte('on_date', to)
    .order('on_date', { ascending: true })
    .order('starts_at', { ascending: true, nullsFirst: true });

  if (error) {
    console.error('Failed to read the diary:', error);
    throw new Error('Could not read what is happening');
  }
  return ((data ?? []) as unknown as Row[]).map(shape);
}

export async function addOccasion(input: {
  jobId: string | null;
  what?: string;
  onDate: string;
  startsAt?: string | null;
  endsAt?: string | null;
}): Promise<{ id: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');
  if (!input.onDate) throw new Error('Something that happens needs a day');

  const { data, error } = await db
    .from('occasions')
    .insert({
      studio_id: who.studioId,
      job_id: input.jobId,
      what: input.what?.trim() || null,
      on_date: input.onDate,
      starts_at: input.startsAt || null,
      ends_at: input.endsAt || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to add the occasion:', error);
    throw new Error('Could not add that');
  }

  await db.from('events').insert({
    studio_id: who.studioId,
    subject_type: 'occasion',
    subject_id: data.id,
    action: 'arranged',
    actor_id: who.personId,
    payload: { on: input.onDate, what: input.what ?? null, job: input.jobId },
  });

  revalidatePath('/');
  if (input.jobId) revalidatePath(`/jobs/${input.jobId}`);
  return { id: data.id };
}

/**
 * Say that it happened — or take that back.
 *
 * Reversible on purpose. Marking the wrong row is the commonest mistake in any
 * list, and a system that will not let you undo it teaches people to avoid the
 * control entirely.
 */
export async function markHappened(input: {
  occasionId: string;
  happened: boolean;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data, error } = await db
    .from('occasions')
    .update({ happened_at: input.happened ? new Date().toISOString() : null })
    .eq('id', input.occasionId)
    .eq('studio_id', who.studioId)
    .select('job_id')
    .maybeSingle();

  if (error) {
    console.error('Failed to mark the occasion:', error);
    throw new Error('Could not record that');
  }

  await db.from('events').insert({
    studio_id: who.studioId,
    subject_type: 'occasion',
    subject_id: input.occasionId,
    action: input.happened ? 'happened' : 'unmarked',
    actor_id: who.personId,
    payload: {},
  });

  revalidatePath('/');
  if (data?.job_id) revalidatePath(`/jobs/${data.job_id}`);
}

export async function removeOccasion(input: { occasionId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data } = await db
    .from('occasions').select('job_id, on_date, what')
    .eq('id', input.occasionId).eq('studio_id', who.studioId).maybeSingle();

  const { error } = await db
    .from('occasions')
    .delete()
    .eq('id', input.occasionId)
    .eq('studio_id', who.studioId);

  if (error) {
    console.error('Failed to remove the occasion:', error);
    throw new Error('Could not remove that');
  }

  // Recorded with what it was, because after the row is gone the log is the
  // only thing that can say what was taken off the diary.
  await db.from('events').insert({
    studio_id: who.studioId,
    subject_type: 'occasion',
    subject_id: input.occasionId,
    action: 'dropped',
    actor_id: who.personId,
    payload: { on: data?.on_date ?? null, what: data?.what ?? null },
  });

  revalidatePath('/');
  if (data?.job_id) revalidatePath(`/jobs/${data.job_id}`);
}

/** Put somebody on, or take them off. One shape, both directions. */
export async function setCrew(input: {
  occasionId: string;
  personId: string;
  on: boolean;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  if (input.on) {
    const { error } = await db.from('crew').insert({
      studio_id: who.studioId,
      occasion_id: input.occasionId,
      person_id: input.personId,
    });
    // Already on it is not a failure; the operator asked for a state, not an
    // insert, and the state is what they wanted.
    if (error && !String(error.message).includes('duplicate')) {
      console.error('Failed to put somebody on:', error);
      throw new Error('Could not put them on it');
    }
  } else {
    const { error } = await db
      .from('crew')
      .delete()
      .eq('studio_id', who.studioId)
      .eq('occasion_id', input.occasionId)
      .eq('person_id', input.personId);
    if (error) {
      console.error('Failed to take somebody off:', error);
      throw new Error('Could not take them off it');
    }
  }

  const { data } = await db
    .from('occasions').select('job_id')
    .eq('id', input.occasionId).eq('studio_id', who.studioId).maybeSingle();

  revalidatePath('/');
  if (data?.job_id) revalidatePath(`/jobs/${data.job_id}`);
}

/** Everyone the studio knows, for putting on an occasion. */
export async function listPeople(): Promise<{ id: string; name: string }[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db
    .from('people')
    .select('id, name')
    .eq('studio_id', who.studioId)
    .order('name');

  if (error) {
    console.error('Failed to read the people:', error);
    return [];
  }
  return data ?? [];
}
