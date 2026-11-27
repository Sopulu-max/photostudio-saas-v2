'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';

/**
 * Who is on a booking, and what they do on it.
 *
 * `weave.crew` is two ids and nothing else — the booking and the person —
 * because that is what an edge is. What somebody DOES is on the person:
 * Chidi is a photographer whichever booking Chidi is on.
 *
 * Drawn ONLY from the people the studio employs. The crew picker once offered
 * every row in `weave.people`, which is a studio's clients and its gallery
 * visitors as well as its staff, so a studio could put its own customer on a
 * shoot. `joined_at` is what separates them, and it is read here.
 */

/** Somebody who works here, who could be put on a booking. */
export type Mate = {
  personId: string;
  name: string;
  /** What they do at the studio. Null until somebody writes it down. */
  role: string | null;
};

/** Somebody who IS on a booking. The role comes with them, off their record. */
export type OnIt = Mate;

async function teamOf(studioId: string): Promise<Mate[]> {
  const { data, error } = await db.from('people')
    .select('id, name, role')
    .eq('studio_id', studioId)
    .not('joined_at', 'is', null)
    .is('left_at', null)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('Failed to read the team:', error);
    return [];
  }
  return ((data ?? []) as { id: string; name: string; role: string | null }[])
    .map((p) => ({ personId: p.id, name: p.name, role: p.role }));
}

/** Who works here. For a booking that does not exist yet. */
export async function whoCouldBeOnIt(): Promise<Mate[]> {
  const who = await whoIsAsking();
  if (!who) return [];
  return teamOf(who.studioId);
}

/** Who is on this booking, in the order they were put on it. */
export async function crewFor(bookingId: string): Promise<OnIt[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db.from('crew')
    .select('person_id, person:people(name, role)')
    .eq('studio_id', who.studioId)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to read who is on the booking:', error);
    return [];
  }

  return ((data ?? []) as unknown as {
    person_id: string; person: { name: string; role: string | null } | null;
  }[]).map((row) => ({
    personId: row.person_id,
    name: row.person?.name ?? 'Somebody',
    role: row.person?.role ?? null,
  }));
}

/**
 * Put somebody on a booking.
 *
 * Checked rather than trusted: the ids arrive from a browser and a server
 * action is a public endpoint. The booking must be this studio's, and the
 * person must WORK here — `weave.people` holds a studio's clients too, so
 * without this a crafted request could put a client on a shoot.
 */
export async function putOnBooking(input: {
  bookingId: string;
  personId: string;
  role?: string | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: booking } = await db.from('bookings')
    .select('id').eq('id', input.bookingId).eq('studio_id', who.studioId).maybeSingle();
  if (!booking) throw new Error('That booking is not in this studio');

  const { data: mate } = await db.from('people')
    .select('id').eq('id', input.personId).eq('studio_id', who.studioId)
    .not('joined_at', 'is', null).is('left_at', null)
    .maybeSingle();
  if (!mate) throw new Error('Only somebody who works here can be put on a booking');

  /*
   * The role given here is written to the PERSON, because that is where a
   * role lives. Only when it is blank: putting somebody on a booking is not
   * the place to silently rewrite what they are, and the studio has a team
   * page for changing it deliberately.
   */
  const role = input.role?.trim() || null;
  if (role) {
    await db.from('people').update({ role })
      .eq('id', input.personId).eq('studio_id', who.studioId)
      .is('role', null);
  }

  const { error } = await db.from('crew').insert({
    studio_id: who.studioId,
    booking_id: input.bookingId,
    person_id: input.personId,
  });
  /* 23505: already on it. Saying so beats a silent no-op. */
  if (error) {
    if (error.code === '23505') throw new Error('They are already on this booking');
    console.error('Failed to put somebody on the booking:', error);
    throw new Error('Could not do that');
  }

  revalidatePath('/bookings');
  revalidatePath('/dashboard');
  revalidatePath(`/bookings/${input.bookingId}`);
}

/**
 * What somebody does, changed.
 *
 * On the person, so it changes everywhere they appear — which is the point of
 * the role living there. `bookingId` is only the page to refresh afterwards.
 */
export async function amendRole(input: {
  personId: string;
  role: string | null;
  bookingId?: string;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { error } = await db.from('people')
    .update({ role: input.role?.trim() || null })
    .eq('id', input.personId).eq('studio_id', who.studioId)
    .not('joined_at', 'is', null);

  if (error) {
    console.error('Failed to change what they do:', error);
    throw new Error('Could not do that');
  }

  revalidatePath('/team');
  if (input.bookingId) revalidatePath(`/bookings/${input.bookingId}`);
}

/** Take somebody off a booking. */
export async function takeOffBooking(input: {
  bookingId: string;
  personId: string;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { error } = await db.from('crew').delete()
    .eq('studio_id', who.studioId)
    .eq('booking_id', input.bookingId)
    .eq('person_id', input.personId);

  if (error) {
    console.error('Failed to take somebody off the booking:', error);
    throw new Error('Could not do that');
  }

  revalidatePath('/bookings');
  revalidatePath('/dashboard');
  revalidatePath(`/bookings/${input.bookingId}`);
}
