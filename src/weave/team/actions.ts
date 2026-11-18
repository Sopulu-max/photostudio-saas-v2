'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type { TeamMember } from './shape';

/**
 * Who works here.
 *
 * `weave.people` holds everybody a studio knows, so this is the reading that
 * separates the ones it employs from the ones it serves. Everything that asks
 * "who could do this work" has to come through here — the alternative is the
 * crew picker offering a studio its own customers, which is what it did.
 */

export async function team(): Promise<TeamMember[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const today = new Date().toLocaleDateString('en-CA');

  const { data, error } = await db.from('people')
    .select('id, name, email, phone, joined_at, left_at, auth_user_id, '
      + 'crew:crew(occasion:occasions(on_date, happened_at))')
    .eq('studio_id', who.studioId)
    .not('joined_at', 'is', null)
    .order('left_at', { ascending: true, nullsFirst: true })
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('Failed to read the team:', error);
    return [];
  }

  return ((data ?? []) as unknown as {
    id: string; name: string; email: string | null; phone: string | null;
    joined_at: string; left_at: string | null; auth_user_id: string | null;
    crew: { occasion: { on_date: string; happened_at: string | null } | null }[];
  }[]).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    hasAccount: row.auth_user_id !== null,
    /*
     * Ahead and not yet marked as happened. A shoot in the past that nobody
     * recorded is the studio's bookkeeping, not a reason to keep somebody on.
     */
    booked: (row.crew ?? []).filter(
      (c) => c.occasion && !c.occasion.happened_at && c.occasion.on_date >= today,
    ).length,
  }));
}

/**
 * Somebody starts working here.
 *
 * It always makes a new person rather than matching a name against the ones
 * already known. A studio may well employ somebody who was once a client, but
 * deciding that the Chidi on the team is the Chidi in the client list is the
 * kind of helpfulness that quietly merges two different people.
 */
export async function addToTeam(input: {
  name: string; email?: string; phone?: string;
}): Promise<{ id: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const name = input.name.trim();
  if (!name) throw new Error('Who is joining?');

  const { data, error } = await db.from('people').insert({
    studio_id: who.studioId,
    name,
    email: input.email?.trim().toLowerCase() || null,
    phone: input.phone?.trim() || null,
    joined_at: new Date().toISOString(),
  }).select('id').single();

  if (error || !data) {
    console.error('Could not add them to the team:', error);
    throw new Error('Could not add them');
  }

  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'person', subject_id: data.id,
    action: 'joined', actor_id: who.personId, payload: { name },
  });

  revalidatePath('/team');
  return { id: data.id };
}

/**
 * Somebody stops working here.
 *
 * Their row stays, and so does every shoot they were on. A studio that cannot
 * say who photographed a wedding because the photographer left has lost
 * something it needed, and the crew rows are the only record of it.
 */
export async function theyLeft(input: { personId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  if (input.personId === who.personId) {
    throw new Error('You cannot take yourself off the team');
  }

  const { error } = await db.from('people')
    .update({ left_at: new Date().toISOString() })
    .eq('id', input.personId).eq('studio_id', who.studioId)
    .not('joined_at', 'is', null);
  if (error) throw new Error('Could not do that');

  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'person', subject_id: input.personId,
    action: 'left', actor_id: who.personId, payload: {},
  });

  revalidatePath('/team');
  revalidatePath('/calendar');
}

/** They came back. People do. */
export async function theyReturned(input: { personId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { error } = await db.from('people')
    .update({ left_at: null })
    .eq('id', input.personId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not do that');

  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'person', subject_id: input.personId,
    action: 'rejoined', actor_id: who.personId, payload: {},
  });

  revalidatePath('/team');
  revalidatePath('/calendar');
}
