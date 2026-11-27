'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
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
    .select('id, name, role, email, phone, avatar_path, joined_at, left_at, '
      + 'crew:crew(booking:bookings(scheduled_for))')
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
    role: string | null; avatar_path: string | null;
    joined_at: string; left_at: string | null;
    crew: { booking: { scheduled_for: string | null } | null }[];
  }[]).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    avatarPath: row.avatar_path,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    /*
     * NOT BEHIND THEM: dated today or later, and undated ones too. A booking
     * nobody has put a day to is still work somebody is carrying, and this
     * count has to mean exactly what the list on their page shows — a heading
     * that disagrees with the rows under it is worse than no heading.
     */
    booked: (row.crew ?? []).filter(
      (c) => !c.booking?.scheduled_for || c.booking.scheduled_for >= today,
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
  /** What they do here. Optional: somebody joins before anybody writes it down. */
  role?: string | null;
  name: string; email?: string; phone?: string;
}): Promise<{ id: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const name = input.name.trim();
  if (!name) throw new Error('Who is joining?');

  const today = new Date().toLocaleDateString('en-CA');

  const { data, error } = await db.from('people').insert({
    studio_id: who.studioId,
    name,
    role: input.role?.trim() || null,
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
 * Their row stays, and so does every booking they were on. A studio that
 * cannot say who photographed a wedding because the photographer left has
 * lost something it needed, and the crew rows are the only record of it.
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
}

/**
 * Change what the studio holds about somebody who works here.
 *
 * THE ROLE IS CHANGED HERE AND NOWHERE ELSE. Putting somebody on a booking
 * fills a blank role, because that is the moment a studio first needs the
 * word — but it will not overwrite one, and the crew panel says so. This is
 * where it is changed deliberately, which is what that promise means.
 *
 * Every field may be emptied again. A phone number that turns out to be wrong
 * is worse than no phone number.
 */
export async function amendMember(input: {
  personId: string;
  name?: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const patch: Record<string, string | null> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    /* A person with no name is a row nobody can find again. */
    if (!name) throw new Error('A team member needs a name');
    patch.name = name;
  }
  if (input.role !== undefined) patch.role = input.role?.trim() || null;
  if (input.email !== undefined) patch.email = input.email?.trim().toLowerCase() || null;
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (Object.keys(patch).length === 0) return;

  if (patch.email && !patch.email.includes('@')) {
    throw new Error('That is not an email address');
  }

  /*
   * Scoped to somebody who WORKS here. `weave.people` holds a studio's
   * clients in the same table, and this endpoint must not become a way to
   * edit one of them from the team page.
   */
  const { error } = await db.from('people')
    .update(patch)
    .eq('id', input.personId).eq('studio_id', who.studioId)
    .not('joined_at', 'is', null);

  if (error) {
    console.error('Could not change that team member:', error);
    throw new Error('Could not save that');
  }

  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'person', subject_id: input.personId,
    action: 'amended', actor_id: who.personId, payload: patch,
  });

  revalidatePath('/team');
  revalidatePath('/bookings');
}

/**
 * One member of the team.
 *
 * Scoped to somebody who WORKS here: `weave.people` holds a studio's clients
 * in the same table, and `/team/<id>` must not become a way to open one of
 * them. Somebody who has left still resolves — their page is where a studio
 * looks to see what they were on.
 */
export async function readMember(personId: string): Promise<TeamMember | null> {
  const who = await whoIsAsking();
  if (!who) return null;

  const today = new Date().toLocaleDateString('en-CA');

  const { data, error } = await db.from('people')
    .select('id, name, role, email, phone, avatar_path, joined_at, left_at, '
      + 'crew:crew(booking:bookings(scheduled_for))')
    .eq('id', personId)
    .eq('studio_id', who.studioId)
    .not('joined_at', 'is', null)
    .maybeSingle();

  if (error) {
    console.error('Failed to read that team member:', error);
    throw new Error('Could not read that team member');
  }
  if (!data) return null;

  const row = data as unknown as {
    id: string; name: string; role: string | null;
    email: string | null; phone: string | null; avatar_path: string | null;
    joined_at: string; left_at: string | null;
    crew: { booking: { scheduled_for: string | null } | null }[];
  };

  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    phone: row.phone,
    avatarPath: row.avatar_path,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    booked: (row.crew ?? []).filter(
      (c) => !c.booking?.scheduled_for || c.booking.scheduled_for >= today,
    ).length,
  };
}

/** One booking somebody is on, for their own page. */
export type TheirWork = {
  bookingId: string;
  clientName: string | null;
  occasion: string | null;
  on: string | null;
  at: string | null;
};

/**
 * What this person is on, soonest first.
 *
 * Read through `weave.crew`, which is the only record of who does the work.
 * Undated bookings sort last: a booking with no day is a real state and the
 * one somebody has to act on, so it is not hidden — it just does not pretend
 * to a place in a sequence of dates.
 */
export async function workOf(personId: string): Promise<TheirWork[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db.from('crew')
    .select('booking:bookings(id, occasion, scheduled_for, at, client:people(name))')
    .eq('studio_id', who.studioId)
    .eq('person_id', personId);

  if (error) {
    console.error('Failed to read what they are on:', error);
    return [];
  }

  return ((data ?? []) as unknown as {
    booking: {
      id: string; occasion: string | null;
      scheduled_for: string | null; at: string | null;
      client: { name: string } | null;
    } | null;
  }[])
    .flatMap((row) => (row.booking ? [{
      bookingId: row.booking.id,
      clientName: row.booking.client?.name ?? null,
      occasion: row.booking.occasion,
      on: row.booking.scheduled_for,
      at: row.booking.at,
    }] : []))
    .sort((a, b) => (a.on ?? '9999').localeCompare(b.on ?? '9999'));
}

/* Every file in this system lives in one bucket. */
const BUCKET = 'weave-files';

/**
 * Room for somebody's picture.
 *
 * The browser uploads straight to storage with a one-shot signed URL: a
 * photograph is megabytes, and routing it through a server action would put
 * every one of them through the application's memory for no reason.
 */
export async function placeToPutFace(input: {
  personId: string;
  name: string;
}): Promise<{ path: string; token: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: ours } = await db.from('people')
    .select('id').eq('id', input.personId).eq('studio_id', who.studioId)
    .not('joined_at', 'is', null).maybeSingle();
  if (!ours) throw new Error('That person is not on this team');

  const safe = input.name.replace(/[^\w.\-]+/g, '_').slice(-120);
  const path = `${who.studioId}/people/${input.personId}/${randomUUID()}-${safe}`;

  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('Failed to make room for that picture:', error);
    throw new Error('Could not make room for that picture');
  }
  return { path: data.path, token: data.token };
}

/**
 * Record what landed, and take the old one away.
 *
 * The previous object is deleted rather than left: a studio changing somebody's
 * photograph four times should not be paying to keep the three it replaced,
 * and nothing in this system ever reads a face it has stopped pointing at.
 */
export async function recordFace(input: {
  personId: string;
  storagePath: string;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: before } = await db.from('people')
    .select('avatar_path').eq('id', input.personId).eq('studio_id', who.studioId)
    .not('joined_at', 'is', null).maybeSingle();
  if (!before) throw new Error('That person is not on this team');

  const { error } = await db.from('people')
    .update({ avatar_path: input.storagePath })
    .eq('id', input.personId).eq('studio_id', who.studioId);
  if (error) {
    console.error('Could not record that picture:', error);
    throw new Error('Could not save that picture');
  }

  const old = (before as { avatar_path: string | null }).avatar_path;
  if (old && old !== input.storagePath) {
    await db.storage.from(BUCKET).remove([old]);
  }

  revalidatePath('/team');
  revalidatePath(`/team/${input.personId}`);
}

/** Take somebody's picture away, from the row and from storage both. */
export async function removeFace(input: { personId: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: before } = await db.from('people')
    .select('avatar_path').eq('id', input.personId).eq('studio_id', who.studioId)
    .not('joined_at', 'is', null).maybeSingle();
  if (!before) throw new Error('That person is not on this team');

  await db.from('people').update({ avatar_path: null })
    .eq('id', input.personId).eq('studio_id', who.studioId);

  const old = (before as { avatar_path: string | null }).avatar_path;
  if (old) await db.storage.from(BUCKET).remove([old]);

  revalidatePath('/team');
  revalidatePath(`/team/${input.personId}`);
}

/**
 * A URL somebody can actually look at, minted now.
 *
 * The bucket is private, so what is stored is a path and the URL is signed at
 * the moment of reading. One round trip for the whole page rather than one
 * per face.
 */
export async function facesFor(paths: (string | null)[]): Promise<Map<string, string>> {
  const real = paths.filter((p): p is string => Boolean(p));
  if (real.length === 0) return new Map();

  const { data } = await db.storage.from(BUCKET).createSignedUrls(real, 60 * 60);
  const urls = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl);
  }
  return urls;
}
