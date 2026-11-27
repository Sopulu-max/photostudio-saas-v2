'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { galleryForAcceptedJob } from '@/weave/packages/accepting';
import { whoIsAsking } from '@/weave/studio';
import type { AnsweredRequest, Request, RequestAsAsked, StudioFront } from './shape';

/**
 * Work arriving from outside.
 *
 * Every booking until now began with somebody in the studio pressing a button. A
 * booking is the same act from the other side: a person the studio may never
 * have met, asking for work that does not exist yet.
 *
 * A request is a booking nobody has answered. Not a separate table that gets copied
 * into `bookings` on acceptance — that would make two records of one piece of work
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
  askedFor?: string | null;
  /** What they are asking for, if the studio publishes packages. */
  packageId?: string | null;
}): Promise<{ token: string }> {
  const studio = await studioAtSlug(input.slug);
  if (!studio) throw new Error('That studio is not here');

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const wants = input.wants.trim();

  if (!name) throw new Error('Tell them who you are');
  if (!email.includes('@')) throw new Error('An email address, so they can answer you');
  if (!wants) throw new Error('Say what you are asking for');
  if (wants.length > 2_000) throw new Error('Keep it under 2,000 characters');
  if (input.packageId) {
    const { data: pack } = await db.from('packages').select('id')
      .eq('studio_id', studio.studioId).eq('id', input.packageId)
      .not('published_at', 'is', null).maybeSingle();
    if (!pack) throw new Error('That package is unavailable');
  }

  const { data: person, error: personError } = await db.from('people')
    .insert({ studio_id: studio.studioId, name, email })
    .select('id').single();
  if (personError || !person) {
    console.error('Could not record who is asking:', personError);
    throw new Error('Could not send that request');
  }

  const { data: booking, error } = await db.from('bookings').insert({
    studio_id: studio.studioId,
    client_id: person.id,
    wants,
    asked_for: input.askedFor || null,
    // Unanswered, so it stays off the board until somebody takes it.
    turn: 'us',
    requested_at: new Date().toISOString(),
    // An address of their own, so the answer has somewhere to be read.
    request_token: randomBytes(16).toString('hex'),
    package_id: input.packageId || null,
  }).select('id, request_token').single();

  if (error || !booking) {
    console.error('Could not record the request:', error);
    throw new Error('Could not send that request');
  }

  await db.from('events').insert({
    studio_id: studio.studioId,
    subject_type: 'booking',
    subject_id: booking.id,
    action: 'requested',
    actor_id: person.id,
    payload: { wants, asked_for: input.askedFor || null },
  });

  revalidatePath('/');
  revalidatePath('/bookings');
  revalidatePath('/dashboard');

  return { token: booking.request_token as string };
}

/**
 * The request as the person who made it sees it.
 *
 * By token, with no account and no sign-in — the same ruling as a gallery.
 * It is deliberately thin: what they asked for, and what came back. Nothing
 * about the studio's board, its other work, or what it decided internally.
 */
export async function requestAsAsked(token: string): Promise<RequestAsAsked | null> {
  const { data } = await db.from('bookings')
    .select('wants, asked_for, requested_at, accepted_at, declined_at, declined_because, '
      + 'answered_with, studio:studios(name, slug)')
    .eq('request_token', token).maybeSingle();
  if (!data) return null;

  const row = data as unknown as {
    wants: string | null; asked_for: string | null; requested_at: string | null;
    accepted_at: string | null; declined_at: string | null; declined_because: string | null;
    answered_with: string | null; studio: { name: string; slug: string } | null;
  };

  return {
    studioName: row.studio?.name ?? 'The studio',
    studioSlug: row.studio?.slug ?? '',
    wants: row.wants,
    askedFor: row.asked_for,
    requestedAt: row.requested_at ?? new Date().toISOString(),
    answer: row.accepted_at ? 'taken' : row.declined_at ? 'turned away' : 'waiting',
    answeredAt: row.accepted_at ?? row.declined_at,
    /*
     * A refusal's reason and the studio's reply are different things. The
     * reason was written for the studio's own records; only what they chose to
     * SAY to the client is shown here.
     */
    answeredWith: row.answered_with,
  };
}

/** What is waiting for an answer, oldest first — somebody has been waiting longest. */
export async function requestsWaiting(): Promise<Request[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db.from('bookings')
    .select('id, wants, asked_for, requested_at, created_at, request_token, client:people(name, email)')
    .eq('studio_id', who.studioId)
    .not('requested_at', 'is', null)
    .is('accepted_at', null)
    .is('declined_at', null)
    .order('requested_at', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('Failed to read what is waiting:', error);
    return [];
  }

  return ((data ?? []) as unknown as {
    id: string; wants: string | null; asked_for: string | null;
    requested_at: string | null; created_at: string; request_token: string | null;
    client: { name: string; email: string | null } | null;
  }[]).map((row) => ({
    id: row.id,
    wants: row.wants,
    askedFor: row.asked_for,
    askedBy: row.client?.name ?? null,
    askedByEmail: row.client?.email ?? null,
    requestedAt: row.requested_at ?? row.created_at,
    token: row.request_token,
  }));
}

/**
 * What has already been answered, newest first.
 *
 * Only what arrived from outside — a booking the studio started itself was never
 * a request and would be noise in this reading.
 */
export async function requestsAnswered(limit = 25): Promise<AnsweredRequest[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db.from('bookings')
    .select('id, wants, asked_for, requested_at, created_at, accepted_at, declined_at, '
      + 'declined_because, request_token, client:people(name, email)')
    .eq('studio_id', who.studioId)
    .not('requested_at', 'is', null)
    .or('accepted_at.not.is.null,declined_at.not.is.null')
    .order('requested_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to read what was answered:', error);
    return [];
  }

  return ((data ?? []) as unknown as {
    id: string; wants: string | null; asked_for: string | null;
    requested_at: string | null; created_at: string;
    accepted_at: string | null; declined_at: string | null; declined_because: string | null;
    request_token: string | null;
    client: { name: string; email: string | null } | null;
  }[]).map((row) => ({
    id: row.id,
    wants: row.wants,
    askedFor: row.asked_for,
    askedBy: row.client?.name ?? null,
    askedByEmail: row.client?.email ?? null,
    requestedAt: row.requested_at ?? row.created_at,
    token: row.request_token,
    answer: row.accepted_at ? 'taken' : 'turned away',
    answeredAt: (row.accepted_at ?? row.declined_at)!,
    because: row.declined_because,
  }));
}

/**
 * Take the work on. From here it is an ordinary booking and the board carries it.
 *
 * A dated request becomes scheduled; an undated one still needs the studio,
 * because agreeing to shoot somebody is not the same as knowing when.
 */
export async function acceptRequest(input: { bookingId: string; saying?: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: booking } = await db.from('bookings')
    .select('id, asked_for, accepted_at, declined_at, client:people(name)')
    .eq('id', input.bookingId).eq('studio_id', who.studioId).maybeSingle();
  if (!booking) throw new Error('That request is not in this studio');
  if (booking.accepted_at || booking.declined_at) throw new Error('That request has already been answered');

  const { error } = await db.from('bookings')
    .update({
      accepted_at: new Date().toISOString(),
      turn: booking.asked_for ? 'scheduled' : 'us',
      answered_with: input.saying?.trim() || null,
    })
    .eq('id', input.bookingId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not accept that request');

  /*
   * The date the client asked for stays on the booking as `asked_for` and goes
   * nowhere else. Accepting used to copy it into the diary as an occasion, so
   * that taking on a shoot for the nineteenth filled the nineteenth in. There
   * is no diary now, so what was asked for is simply what the studio has on
   * record against the booking.
   */

  /*
   * Taking the work on brings the work into existence. The gallery is opened
   * here, sized by what was promised, so the agreement becomes a thing with
   * a shape rather than a sentence in a request.
   */
  try {
    await galleryForAcceptedJob({
      studioId: who.studioId,
      bookingId: input.bookingId,
      clientName: (booking as unknown as { client: { name: string } | null }).client?.name ?? null,
      actorId: who.personId,
    });
  } catch (error) {
    console.error('Booking accepted, but initial gallery could not be created:', error);
  }

  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'booking', subject_id: input.bookingId,
    action: 'accepted', actor_id: who.personId, payload: {},
  });

  revalidatePath('/');
  revalidatePath('/bookings');
  revalidatePath('/dashboard');
  /* Accepting opens a gallery, so the screen that lists them is told too. */
  revalidatePath('/galleries');
  revalidatePath(`/bookings/${input.bookingId}`);
}

/**
 * Refuse it, and keep it.
 *
 * Deleting a declined request would lose the fact that somebody asked and was
 * turned away, which is a thing a studio has every reason to look back on.
 */
export async function declineRequest(input: { bookingId: string; because?: string; saying?: string }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { data: booking } = await db.from('bookings')
    .select('id, accepted_at, declined_at')
    .eq('id', input.bookingId).eq('studio_id', who.studioId).maybeSingle();
  if (!booking) throw new Error('That request is not in this studio');
  if (booking.accepted_at || booking.declined_at) throw new Error('That request has already been answered');

  const { error } = await db.from('bookings')
    .update({
      declined_at: new Date().toISOString(),
      declined_because: input.because?.trim() || null,
      answered_with: input.saying?.trim() || null,
    })
    .eq('id', input.bookingId).eq('studio_id', who.studioId);
  if (error) throw new Error('Could not decline that request');

  await db.from('events').insert({
    studio_id: who.studioId, subject_type: 'booking', subject_id: input.bookingId,
    action: 'declined', actor_id: who.personId,
    payload: { because: input.because?.trim() || null },
  });

  revalidatePath('/');
  revalidatePath('/bookings');
  revalidatePath('/dashboard');
}
