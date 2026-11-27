'use server';

import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type {
  Dashboard, NotHandedOver, NotSent, ShortOfPromise, UnansweredRequest,
} from './shape';

/**
 * Four questions, asked of the database directly.
 *
 * Every one is scoped to the asking studio. None of them reads `bookings.turn` —
 * a column somebody sets by hand is a claim about the work, and these are
 * readings OF the work: a shoot that happened, a gallery never shared, an
 * order paid and not sent. If the studio stops maintaining `turn` tomorrow,
 * every line here is still true.
 *
 * Read in parallel because they are independent, and a dashboard that waits
 * for the slowest of six in sequence is six waits instead of one.
 */

const EMPTY: Dashboard = {
  unanswered: [], notHandedOver: [], shortOfPromise: [], notSent: [],
};

export async function theDashboard(today: string): Promise<Dashboard> {
  const who = await whoIsAsking();
  if (!who) return EMPTY;
  const studio = who.studioId;

  const [waiting, unshared, galleries, orders] = await Promise.all([
    /* Asked, and not yet answered either way. */
    db.from('bookings')
      .select('id, wants, requested_at, client:people(name)')
      .eq('studio_id', studio)
      .not('requested_at', 'is', null)
      .is('accepted_at', null).is('declined_at', null)
      .order('requested_at', { ascending: true }),

    /*
     * Pictures in a gallery nobody has been shown. Read off the gallery
     * rather than off a shoot somebody marked as done: a gallery with
     * pictures in it is the evidence the work happened, and it is true
     * without anybody having to remember to say so.
     */
    db.from('galleries')
      .select('id, booking_id, name, shared_at, '
        + 'booking:bookings(client:people(name)), files:gallery_files(id)')
      .eq('studio_id', studio)
      .is('shared_at', null)
      .order('created_at', { ascending: true }),

    /* Handed over, against what was agreed. */
    db.from('galleries')
      .select('id, booking_id, name, pictures_promised, shared_at, files:gallery_files(id)')
      .eq('studio_id', studio)
      .not('pictures_promised', 'is', null)
      .not('shared_at', 'is', null),

    /* Paid for and still here. */
    db.from('orders')
      .select('id, paid_at, person:people(name)')
      .eq('studio_id', studio)
      .not('paid_at', 'is', null)
      .is('fulfilled_at', null)
      .order('paid_at', { ascending: true }),
  ]);

  for (const [what, result] of Object.entries({
    waiting, unshared, galleries, orders,
  })) {
    if (result.error) console.error(`Dashboard could not read ${what}:`, result.error);
  }

  type NamedJob = { client: { name: string } | null } | null;

  const unanswered: UnansweredRequest[] = ((waiting.data ?? []) as unknown as {
    id: string; wants: string | null; requested_at: string; client: { name: string } | null;
  }[]).map((row) => ({
    id: row.id, wants: row.wants, requestedAt: row.requested_at,
    clientName: row.client?.name ?? null,
  }));

  /*
   * One line per GALLERY. A booking with two galleries, one shared and one
   * not, has one thing undone and saying it twice would make a studio think
   * it had two.
   */
  const notHandedOver: NotHandedOver[] = ((unshared.data ?? []) as unknown as {
    id: string; booking_id: string | null; name: string;
    booking: NamedJob; files: { id: string }[];
  }[])
    .map((row) => ({
      bookingId: row.booking_id,
      clientName: row.booking?.client?.name ?? null,
      galleryId: row.id,
      galleryName: row.name,
      have: (row.files ?? []).length,
    }))
    /* An empty gallery is not undelivered work, it is work not started. */
    .filter((row) => row.have > 0);

  const shortOfPromise: ShortOfPromise[] = ((galleries.data ?? []) as unknown as {
    id: string; booking_id: string | null; name: string;
    pictures_promised: number; files: { id: string }[];
  }[])
    .map((row) => ({
      galleryId: row.id, bookingId: row.booking_id, name: row.name,
      have: (row.files ?? []).length, promised: row.pictures_promised,
    }))
    .filter((row) => row.have < row.promised);

  const notSent: NotSent[] = ((orders.data ?? []) as unknown as {
    id: string; paid_at: string; person: { name: string } | null;
  }[]).map((row) => ({
    id: row.id, paidAt: row.paid_at, clientName: row.person?.name ?? null,
  }));

  return { unanswered, notHandedOver, shortOfPromise, notSent };
}
