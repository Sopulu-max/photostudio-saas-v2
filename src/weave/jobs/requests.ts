'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type { Request, StudioFront } from './shape';

/**
 * Work arriving from outside.
 *
 * Every job until now began with somebody in the studio pressing a button. A
 * booking is the same act from the other side: a person the studio may never
 * have met, asking for work that does not exist yet.
 *
 * A request is a job nobody has answered. Not a separate table that gets copied
 * into `jobs` on acceptance — that would make two records of one piece of work
 * from the moment it is agreed, and they would drift. So accepting a request
 * writes a timestamp, and the thing the client asked for is the thing the
 * studio is now doing. Same row, start to finish.
 */

/** The studio at its own address, for a page strangers can open. */
export async function studioAtSlug(slug: string): Promise<StudioFront | null> {
  const { data } = await db.from('studios')
    .select('id, name, slug').eq('slug', slug).maybeSingle();
  return data ? { studioId: data.id, name: data.name, slug: data.slug } : null;
}

/** The asking studio's own front, so it can show operators where people ask. */
export async function myStudioFront(): Promise<StudioFront | null> {
  const who = await whoIsAsking();
  if (!who) return null;
  const { data } = await db.from('studios')
    .select('id, name, slug').eq('id', who.studioId).maybeSingle();
  return data ? { studioId: data.id, name: data.name, slug: data.slug } : null;
}

/**
 * Somebody asks a studio for work.
 *
 * No account needed, deliberately. Requiring a password before a stranger may
 * even ask is the ceremony this system exists to remove, and it is the same
 * ruling as the gallery: the link works, the account is an upgrade.
 *
 * It creates a person in that studio — which is what a new enquiry IS, a
 * relationship that did not exist a moment ago. What it must never do is
 * attach the asker to a person the studio already keeps, on the strength of a
 * typed email. That would let anyone inherit a stranger's history by guessing
 * their address. A studio that recognises the name merges them, deliberately,
 * seeing both.
 */
export async function requestBooking(input: {
  slug: string;
  name: string;
  email: string;
  wants: string;
  expectedOn?: string | null;
}): Promise<void> {
  const studio = await studioAtSlug(input.slug);
  if (!studio) throw new Error('That studio is not here');

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const wants = input.wants.trim();

  if (!name) throw new Error('Tell them who you are');
  if (!email.includes('@')) throw new Error('An email address, so they can answer you');
  if (!wants) throw new Error('Say what you are asking for');
  if (wants.length > 2_000) throw new Error('Keep it under 2,000 characters');

  const { data: person, error: personError } = await db.from('people')
    .insert({ studio_id: studio.studioId, name, email })
    .select('id').single();
  if (personError || !person) {
    console.error('Could not record who is asking:', personError);
    throw new Error('Could not send that request');
  }

  const { data: job, error } = await db.from('jobs').insert({
    studio_id: studio.studioId,
    client_id: person.id,
    wants,
    expected_on: input.expectedOn || null,
    // Unanswered, so it stays off the board until somebody takes it.
    turn: 'us',
    requested_at: new Date().toISOString(),
  }).select('id').single();

  if (error || !job) {
    console.error('Could not record the request:', error);
    throw new Error('Could not send that request');
  }

  await db.from('events').insert({
    studio_id: studio.studioId,
    subject_type: 'job',
    subject_id: job.id,
    action: 'requested',
    actor_id: person.id,
    payload: { wants, expected_on: input.expectedOn || null },
  });

  revalidatePath('/');
  revalidatePath('/mobile');
}

/** What is waiting for an answer, oldest first — somebody has been waiting longest. */
export async function requestsWaiting(): Promise<Request[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db.from('jobs')
    .select('id, wants, expected_on, requested_at, created_at, client:people(name, email)')
    .eq('studio_id', who.studioId)
    .is('accepted_at', null)
    .is('declined_at', null)
    .order('requested_at', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('Failed to read what is waiting:', error);
    return [];
  }

  return ((data ?? []) as unknown as {
    id: string; wants: string | null; expected_on: string | null;
    requested_at: string | null; created_at: string;
    client: { name: string; email: string | null } | null;
  }[]).map((row) => ({
    id: row.id,
    wants: row.wants,
    expectedOn: row.expected_on,
    askedBy: row.client?.name ?? null,
    askedByEmail: row.client?.email ?? null,
    requestedAt: row.requested_at ?? row.created_at,
  }));
}

/**
 * Take the work on. From here it is an ordinary job and the board carries it.
 *
 * A dated request becomes scheduled; an undated one still needs the studio,
 * because agreeing to shoot somebody is not the same as knowing when.
 */
export async function acceptRequest(input: { jobId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: job } = await db.from('jobs')
    .select('id, expected_on, accepted_at, declined_at')
    .eq('id', input.jobId).eq('studio_id', who.studioId).maybeSingle();
  if (!job) throw new Error('That request is not in this studio');
  if (job.accepted_at || job.declined_at) throw new Error('That request has already been answered');

  const { error } = await db.from('jobs')
    .update({
      accepted_at: new Date().toISOString(),
      turn: job.expected_on ? 'scheduled' : 'us',
    })
    .eq('id', input.jobId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not accept that request');

  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'job', subject_id: input.jobId,
    action: 'accepted', actor_id: who.personId, payload: {},
  });

  revalidatePath('/');
  revalidatePath('/mobile');
  revalidatePath(`/jobs/${input.jobId}`);
}

/**
 * Refuse it, and keep it.
 *
 * Deleting a declined request would lose the fact that somebody asked and was
 * turned away, which is a thing a studio has every reason to look back on.
 */
export async function declineRequest(input: { jobId: string; because?: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: job } = await db.from('jobs')
    .select('id, accepted_at, declined_at')
    .eq('id', input.jobId).eq('studio_id', who.studioId).maybeSingle();
  if (!job) throw new Error('That request is not in this studio');
  if (job.accepted_at || job.declined_at) throw new Error('That request has already been answered');

  const { error } = await db.from('jobs')
    .update({
      declined_at: new Date().toISOString(),
      declined_because: input.because?.trim() || null,
    })
    .eq('id', input.jobId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not decline that request');

  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'job', subject_id: input.jobId,
    action: 'declined', actor_id: who.personId,
    payload: { because: input.because?.trim() || null },
  });

  revalidatePath('/');
  revalidatePath('/mobile');
}
