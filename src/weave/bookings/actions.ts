'use server';

import { revalidatePath } from 'next/cache';
import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import { galleryForAcceptedJob } from '@/weave/packages/accepting';
import { invoiceFrom, paymentFrom } from '@/weave/payments/forms';
import { INVOICE_TOKEN } from '@/weave/payments/shape';
import { COLUMNS, MAX_PACKAGE_QUANTITY, type Board, type BookingCard, type PackageQuantity, type Turn } from './shape';

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
 * The studio selects a client record or creates one as part of the booking.
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
  bookingId: string;
  clientId?: string | null;
  /** Optional invoice and initial payment fields from the studio's form. */
  billing?: FormData;
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
  packages?: PackageQuantity[];
}): Promise<{ id: string } | { problem: string }> {
  const who = await whoIsAsking();
  if (!who) return { problem: 'Sign in to start a booking.' };

  const name = input.clientName.trim();
  if (!name) return { problem: 'A client name is required.' };

  /*
   * Checked here and not only in the form. A server action is a public
   * endpoint — the form is a convenience in front of it, never the gate.
   */
  const email = input.clientEmail?.trim().toLowerCase() || null;
  const phone = input.clientPhone?.trim() || null;
  if (!email || !email.includes('@')) return { problem: 'A valid client email address is required.' };
  if (!phone) return { problem: 'A client phone number is required.' };

  /*
   * Also a check constraint on the table, because a server action is a public
   * endpoint and a form is only the convenience in front of it. Said here
   * first so the studio reads a sentence rather than a constraint violation.
   */
  const on = input.on?.trim() || null;
  const at = input.at?.trim() || null;
  if (at && !on) return { problem: 'A time needs a date.' };

  const id = input.bookingId;
  if (!INVOICE_TOKEN.test(id)) return { problem: 'Reload the form to start a booking.' };
  const clientId = input.clientId || null;
  if (clientId && !INVOICE_TOKEN.test(clientId)) return { problem: 'The selected client is unavailable.' };
  const selection = input.packages ?? [];
  if (!Array.isArray(selection)) return { problem: 'Invalid package selection.' };
  const packageIds = new Set<string>();
  const packages = [];
  for (const line of selection) {
    if (!line || !INVOICE_TOKEN.test(line.packageId) || packageIds.has(line.packageId)
      || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_PACKAGE_QUANTITY) {
      return { problem: 'Invalid package quantities.' };
    }
    packageIds.add(line.packageId);
    packages.push({ package_id: line.packageId, quantity: line.quantity });
  }
  const crew = [];
  const seen = new Set<string>();
  for (const mate of input.crew ?? []) {
    if (!INVOICE_TOKEN.test(mate.personId) || seen.has(mate.personId)) continue;
    seen.add(mate.personId);
    crew.push({ person_id: mate.personId, role: mate.role?.trim() || null });
  }

  let invoice = null;
  if (input.billing) {
    if (!(input.billing instanceof FormData)) return { problem: 'Invalid invoice details.' };
    try {
      const draft = invoiceFrom(input.billing);
      const receipt = input.billing.get('recordPayment') === 'on' ? paymentFrom(input.billing) : null;
      if (receipt && receipt.amount_minor > draft.total_minor) return { problem: 'Payment exceeds the invoice total.' };
      invoice = { ...draft, receipt };
    } catch (error) {
      return { problem: error instanceof Error ? error.message : 'Invalid invoice or payment details.' };
    }
  }

  const { data: created, error } = await db.rpc('start_studio_booking', {
    p_studio_id: who.studioId, p_actor_id: who.personId, p_booking_id: id,
    p_booking: {
      ...(clientId ? { client_id: clientId } : {}),
      client_name: name, client_email: email, client_phone: phone,
      wants: input.wants?.trim() || null, packages,
      occasion: input.occasion?.trim() || null, occasion_on: input.occasionOn?.trim() || null,
      scheduled_for: on, at, crew,
    },
    p_invoice: invoice,
  });
  if (error) {
    if (error.code === 'P0001') return { problem: error.message };
    console.error('Could not start booking:', error.code);
    return { problem: 'Could not save the booking. Check the details and try again.' };
  }

  revalidatePath('/');
  revalidatePath('/bookings');
  if (invoice) {
    revalidatePath('/payments');
    revalidatePath('/clients/[id]', 'page');
  }
  if (created && packages.length > 0) {
    try {
      const clientName = clientId ? (await db.from('people').select('name')
        .eq('studio_id', who.studioId).eq('id', clientId).maybeSingle().throwOnError()).data?.name ?? null : name;
      await galleryForAcceptedJob({
        studioId: who.studioId, bookingId: id, clientName, actorId: who.personId,
      });
    } catch (error) {
      console.error('Booking saved, but initial gallery could not be created:', error);
    }
  }

  revalidatePath('/galleries');
  revalidatePath('/dashboard');
  return { id };
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
  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/dashboard');
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
  revalidatePath(`/bookings/${input.bookingId}`);
  revalidatePath('/dashboard');
}
