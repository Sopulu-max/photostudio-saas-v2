'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import { galleryForAcceptedJob } from '@/weave/packages/accepting';
import { COLUMNS, type Board, type BookingCard, type Turn } from './shape';

/**
 * Bookings, read as a board.
 *
 * Grouped by WHOSE TURN IT IS rather than by stage of production. In a studio
 * most waiting is not the studio's own — the client has not chosen selects, has
 * not approved, has not paid — and a board that shows those beside your own
 * work misreports the day's load every time it is looked at.
 */
export async function bookingsHeld(): Promise<BookingCard[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  /*
   * One query for the whole board. A board is read constantly, and four round
   * trips to draw one screen is how an app starts feeling like a website.
   *
   * Finished work is capped below: a done column that grows forever stops being
   * a reading and becomes an archive, and nobody scrolls an archive.
   */
  /*
   * Only work the studio has actually taken on. An unanswered request is not
   * yet work — it is a question — and a refused one never will be. Letting
   * either sit in these four columns would misreport the day's load, which is
   * the one thing this board exists not to do.
   */
  const { data, error } = await db
    .from('bookings')
    .select('id, wants, turn, occasion, occasion_on, scheduled_for, at, client:people(name)')
    .eq('studio_id', who.studioId)
    .not('accepted_at', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to read the board:', error);
    throw new Error('Could not read the board');
  }

  const rows = (data ?? []) as unknown as {
    id: string; wants: string | null; turn: Turn;
    occasion: string | null; occasion_on: string | null;
    scheduled_for: string | null; at: string | null;
    client: { name: string } | null;
  }[];

  const cards: BookingCard[] = rows.map((r) => ({
    id: r.id,
    wants: r.wants,
    clientName: r.client?.name ?? null,
    turn: r.turn,
    occasion: r.occasion,
    occasionOn: r.occasion_on,
    on: r.scheduled_for,
    at: r.at,
  }));

  /*
   * Soonest first, undated last. A booking with no day is a real state and the
   * one somebody has to act on, so it is not hidden — it just does not pretend
   * to a place in a sequence of dates.
   */
  return cards.sort((a, b) => (a.on ?? '9999').localeCompare(b.on ?? '9999'));
}

/**
 * The same work, grouped by whose move it is.
 *
 * A second reading of one list rather than a second query. The phone reads it
 * this way because a day is a sequence of things somebody has to do; a flat
 * list is what a room of work looks like.
 */
export async function readBoard(): Promise<Board> {
  const held = await bookingsHeld();
  return COLUMNS.map((col) => ({
    ...col,
    bookings: held
      .filter((c) => c.turn === col.turn)
      .slice(0, col.turn === 'done' ? 10 : undefined),
  }));
}

/**
 * Start a booking from what you actually know.
 *
 * A name is the only thing required. The client does not have to exist first —
 * a name that is new becomes a person — because making somebody visit a Clients
 * screen before they may write down a booking is the ceremony this system exists to
 * remove.
 *
 * AN EMAIL AND A PHONE NUMBER ARE REQUIRED WITH IT. A client the studio
 * created had a name and nothing else, which left nothing to reach them on and
 * nothing to ever invite them to an account with.
 *
 * Required is a deliberate narrowing of this system's usual rule, which is
 * that a thing may exist thin and grow — "a person can be an email address
 * typed into a gallery, and later the same person with a password". A studio
 * writing a booking down knows who it is for and how to reach them; a client
 * record with no way to reach the client is not an early version of anything,
 * it is a dead end that the gallery, the invoice and the account all run into
 * later. The studio asked for the floor to be here.
 *
 * It does NOT make an account a condition of being booked. A client still
 * never signs up to have work done; these are the details the studio holds,
 * not credentials the client supplies.
 */
export async function createBooking(input: {
  clientName: string;
  /** How to reach them. Both required: a client nobody can reach is a dead end. */
  clientEmail?: string | null;
  clientPhone?: string | null;
  wants?: string;
  /**
   * What the booking is for, in the studio's own words, and the day the
   * occasion itself falls on.
   *
   * Free text, never a list. The system before last hardcoded birthday and
   * wedding and this project spent a year dissolving that; nothing in the
   * engine behaves differently for one than another, so nothing earns a kind.
   *
   * `occasionOn` is NOT the day the studio works — that is `on`. They come
   * apart whenever a studio shoots a pre-wedding session, or photographs a
   * christening the day after.
   */
  occasion?: string | null;
  occasionOn?: string | null;
  /**
   * Who from the studio is on it, and what they do if it is not on their
   * record yet. The role is written to the PERSON — it is what they are at
   * the studio, not what they are on this booking.
   */
  crew?: { personId: string; role?: string | null }[];
  /**
   * When the work happens, and at what hour if that is settled.
   *
   * Columns on the booking. `weave.occasions` held this and was removed: a
   * thing that happens is a property of the work, not an entity beside it.
   * The cost of a column is that there is exactly one of them, so a booking
   * has one dated thing and a wedding with an engagement shoot besides is two
   * bookings.
   *
   * Both optional. "Agreed, day to be settled" is a real state and the
   * commonest one at the moment a booking is taken, and a day with no hour
   * agreed yet is another.
   */
  on?: string | null;
  at?: string | null;
  /**
   * What they are booking.
   *
   * A studio defines what it sells through packages, so a client who walks
   * in or phones is booking one of them — the same thing a client books on
   * the public page, arriving by a different door. It stays optional because
   * the first thing a studio hears is often "do you do weddings?", and a
   * system that refuses to write that down is one a studio keeps a notebook
   * beside.
   */
  packageId?: string | null;
}): Promise<{ id: string }> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const name = input.clientName.trim();
  if (!name) throw new Error('A booking needs somebody it is for');

  /*
   * Checked here and not only in the form. A server action is a public
   * endpoint — the form is a convenience in front of it, never the gate.
   */
  const email = input.clientEmail?.trim().toLowerCase() || null;
  const phone = input.clientPhone?.trim() || null;
  if (!email) throw new Error('A client needs an email address');
  if (!email.includes('@')) throw new Error('That is not an email address');
  if (!phone) throw new Error('A client needs a phone number');

  /*
   * Also a check constraint on the table, because a server action is a public
   * endpoint and a form is only the convenience in front of it. Said here
   * first so the studio reads a sentence rather than a constraint violation.
   */
  const on = input.on?.trim() || null;
  const at = input.at?.trim() || null;
  if (at && !on) throw new Error('A time needs a date');


  /*
   * Match an existing person by the studio's own spelling before making a
   * second one. Exact match only: deciding that "Ada O." is "Ada Okafor" is the
   * kind of helpfulness that quietly merges two different clients.
   *
   * Still by NAME, not by the email now being collected. Matching a person by
   * a typed email is the thing this system refuses to do anywhere, and the
   * question of which records are really one person belongs to a deliberate
   * merge, not to a booking form guessing.
   */
  const { data: found } = await db
    .from('people')
    .select('id, email, phone')
    .eq('studio_id', who.studioId)
    .eq('name', name)
    .maybeSingle();

  let clientId: string | null = found?.id ?? null;

  if (!clientId) {
    const { data: made, error } = await db
      .from('people')
      .insert({ studio_id: who.studioId, name, email, phone })
      .select('id')
      .single();
    if (error) {
      console.error('Failed to add the client:', error);
      throw new Error('Could not add that client');
    }
    clientId = made.id;
  } else {
    /*
     * FILL BLANKS, NEVER OVERWRITE. Learning a client's phone number on the
     * third booking is enrichment and belongs on the record. Replacing an
     * address already there is a change to what the studio holds about
     * somebody, made silently, from a form that is not about them — and if
     * the two disagree it is also evidence these may be two people, which is
     * a question for a merge rather than for a quiet overwrite.
     */
    const fill: Record<string, string> = {};
    if (email && !found!.email) fill.email = email;
    if (phone && !found!.phone) fill.phone = phone;
    if (Object.keys(fill).length > 0) {
      await db.from('people').update(fill)
        .eq('id', clientId).eq('studio_id', who.studioId);
    }
  }

  const { data: booking, error: jobError } = await db
    .from('bookings')
    .insert({
      studio_id: who.studioId,
      client_id: clientId,
      wants: input.wants?.trim() || null,
      package_id: input.packageId || null,
      occasion: input.occasion?.trim() || null,
      occasion_on: input.occasionOn?.trim() || null,
      scheduled_for: on,
      at,
      /* A day in the diary waits on nobody; an undated booking needs the studio. */
      turn: on ? 'scheduled' : 'us',
      // Work the studio starts itself is work the studio has already agreed to.
      // Only a request from outside arrives unanswered.
      accepted_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (jobError) {
    console.error('Failed to start the booking:', jobError);
    throw new Error('Could not start that booking');
  }


  /*
   * Who is on it. Scoped to people who WORK here: the ids arrive from a
   * browser, and `weave.people` holds a studio's clients too, so a crafted
   * request could otherwise put a client on a shoot.
   */
  if (input.crew && input.crew.length > 0) {
    const { data: mates } = await db.from('people')
      .select('id, role')
      .eq('studio_id', who.studioId)
      .in('id', input.crew.map((c) => c.personId))
      .not('joined_at', 'is', null)
      .is('left_at', null);

    const team = (mates ?? []) as { id: string; role: string | null }[];

    /*
     * A role typed here fills a blank on the person. Only a blank: staffing a
     * booking is not the place to silently rewrite what somebody is, and the
     * team page is where that is changed deliberately.
     */
    for (const mate of team) {
      if (mate.role) continue;
      const said = input.crew.find((c) => c.personId === mate.id)?.role?.trim();
      if (said) {
        await db.from('people').update({ role: said })
          .eq('id', mate.id).eq('studio_id', who.studioId);
      }
    }

    const rows = team.map((mate) => ({
      studio_id: who.studioId,
      booking_id: booking.id,
      person_id: mate.id,
    }));

    if (rows.length > 0) {
      const { error: crewError } = await db.from('crew').insert(rows);
      /* Staffing failing does not undo the booking: the agreement is the
       * thing, and somebody can be put on it by hand afterwards. */
      if (crewError) console.error('Started, but could not staff it:', crewError);
    }
  }

  await db.from('events').insert({
    studio_id: who.studioId,
    subject_type: 'booking',
    subject_id: booking.id,
    action: 'started',
    actor_id: who.personId,
    payload: { client: name },
  });

  /*
   * The list of bookings lives at `/bookings`, so every write that changes a
   * booking has to reach it. A literal path refreshes only itself, and
   * `/bookings/<id>` is one booking, not the list.
   */
  revalidatePath('/');
  revalidatePath('/bookings');
  /*
   * Booking it IS accepting it, so the work comes into existence here the
   * same way it does when a request is accepted: a gallery, sized by what
   * the package promised.
   *
   * This was the first cut in the spine. A booking started by the studio was
   * already being marked accepted — "work the studio starts itself is work
   * the studio has already agreed to" — but only `acceptRequest` ever opened
   * the gallery. So a package booked over the phone promised pictures that
   * nothing in the system ever made room for.
   *
   * A booking with no package opens nothing, which is correct: there is no
   * promise yet to give the gallery a shape.
   */
  if (input.packageId) {
    await galleryForAcceptedJob({
      studioId: who.studioId,
      bookingId: booking.id,
      clientName: name,
      packageId: input.packageId,
      actorId: who.personId,
    });
  }

  revalidatePath('/galleries');
  revalidatePath('/mobile');
  return { id: booking.id };
}

/**
 * One booking, with everything that has happened to it.
 *
 * The history is read from the log rather than reconstructed from the row,
 * because the row only knows where the booking ended up. What a studio needs when
 * something has gone wrong is the sequence, and a row cannot tell you that.
 */
export type BookingDetail = {
  id: string;
  /** Who it is for, and the door to them. Null is reachable: a client can be
   *  deleted and the booking stands, because the history is worth more. */
  clientId: string | null;
  clientName: string | null;
  wants: string | null;
  turn: Turn;
  occasion: string | null;
  occasionOn: string | null;
  on: string | null;
  at: string | null;
  startedAt: string;
  history: { id: string; action: string; at: string; payload: Record<string, unknown> }[];
};

export async function readBooking(id: string): Promise<BookingDetail | null> {
  const who = await whoIsAsking();
  if (!who) return null;

  const [booking, log] = await Promise.all([
    db.from('bookings')
      .select('id, wants, turn, occasion, occasion_on, scheduled_for, at, created_at, client_id, client:people(name)')
      .eq('id', id)
      .eq('studio_id', who.studioId)
      .maybeSingle(),
    db.from('events')
      .select('id, action, at, payload')
      .eq('studio_id', who.studioId)
      .eq('subject_type', 'booking')
      .eq('subject_id', id)
      .order('at', { ascending: false }),
  ]);

  if (booking.error) {
    console.error('Failed to read the booking:', booking.error);
    throw new Error('Could not read that booking');
  }
  if (!booking.data) return null;

  const row = booking.data as unknown as {
    id: string; wants: string | null; turn: Turn;
    occasion: string | null; occasion_on: string | null;
    scheduled_for: string | null; at: string | null;
    created_at: string; client_id: string | null; client: { name: string } | null;
  };

  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client?.name ?? null,
    wants: row.wants,
    turn: row.turn,
    occasion: row.occasion,
    occasionOn: row.occasion_on,
    on: row.scheduled_for,
    at: row.at,
    startedAt: row.created_at,
    history: (log.data ?? []) as BookingDetail['history'],
  };
}

/**
 * Change what a booking says.
 *
 * The notes and the day. The client's own details belong to the client and are
 * changed there; what this changes is the booking.
 *
 * Any of them may be emptied again — a date that turns out to be wrong is
 * worse than no date, and the system should not make somebody keep a thing
 * they know to be untrue.
 *
 * It may be emptied again — a note that turns out to be wrong is worse than
 * no note, and the system should not make somebody keep a thing they know to
 * be untrue.
 */
export async function amendBooking(input: {
  bookingId: string;
  wants?: string | null;
  occasion?: string | null;
  occasionOn?: string | null;
  /**
   * Who from the studio is on it, and what they do if it is not on their
   * record yet. The role is written to the PERSON — it is what they are at
   * the studio, not what they are on this booking.
   */
  crew?: { personId: string; role?: string | null }[];
  on?: string | null;
  at?: string | null;
}): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const patch: Record<string, string | null> = {};
  if (input.wants !== undefined) patch.wants = input.wants?.trim() || null;
  if (input.occasion !== undefined) patch.occasion = input.occasion?.trim() || null;
  if (input.occasionOn !== undefined) patch.occasion_on = input.occasionOn?.trim() || null;
  if (input.on !== undefined) patch.scheduled_for = input.on?.trim() || null;
  if (input.at !== undefined) patch.at = input.at?.trim() || null;
  if (Object.keys(patch).length === 0) return;

  /* The same rule the table enforces, said as a sentence. */
  if (patch.at && patch.scheduled_for === null) throw new Error('A time needs a date');

  const { error } = await db
    .from('bookings')
    .update(patch)
    .eq('id', input.bookingId)
    .eq('studio_id', who.studioId);

  if (error) {
    console.error('Failed to amend the booking:', error);
    throw new Error('Could not save that');
  }

  await db.from('events').insert({
    studio_id: who.studioId,
    subject_type: 'booking',
    subject_id: input.bookingId,
    action: 'amended',
    actor_id: who.personId,
    payload: patch,
  });

  revalidatePath('/');
  revalidatePath('/bookings');
  revalidatePath('/mobile');
  revalidatePath(`/bookings/${input.bookingId}`);
}

/** Move a booking to another column. The database records the transition itself. */
export async function moveBooking(input: { bookingId: string; turn: Turn }): Promise<void> {
  const who = await whoIsAsking();
  if (!who) throw new Error('Sign in first');

  const { error } = await db
    .from('bookings')
    .update({ turn: input.turn })
    .eq('id', input.bookingId)
    .eq('studio_id', who.studioId);

  if (error) {
    console.error('Failed to move the booking:', error);
    throw new Error('Could not move that booking');
  }

  await db.from('events').insert({
    studio_id: who.studioId,
    subject_type: 'booking',
    subject_id: input.bookingId,
    action: 'turn_changed',
    actor_id: who.personId,
    payload: { to: input.turn },
  });

  revalidatePath('/');
  revalidatePath('/bookings');
  revalidatePath('/mobile');
  revalidatePath(`/bookings/${input.bookingId}`);
}
