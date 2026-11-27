'use server';

import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import { scheduleThrough } from './shape';
import type {
  Dashboard, DeadlineGallery, GalleryDeadline, NotHandedOver, NotSent,
  ScheduledShoot, ShortOfPromise, UnansweredRequest,
} from './shape';
import type { Turn } from '@/weave/bookings/shape';

type DatedGallery = { id: string; booking_id: string | null; name: string };

function deadlineGallery(row: DatedGallery): DeadlineGallery {
  return { id: row.id, bookingId: row.booking_id, name: row.name };
}

/**
 * Read commitments from the facts that establish them. A failed query
 * makes the total unavailable, since a partial total can read as clear.
 */
export async function theDashboard(): Promise<Dashboard | null> {
  const who = await whoIsAsking();
  if (!who) return null;
  const studio = who.studioId;

  const [waiting, withoutDate, unshared, galleries, orders] = await Promise.all([
    /* Asked, and not yet answered either way. */
    db.from('bookings')
      .select('id, wants, requested_at, client:people(name)')
      .eq('studio_id', studio)
      .not('requested_at', 'is', null)
      .is('accepted_at', null).is('declined_at', null)
      .order('requested_at', { ascending: true }),

    db.from('bookings')
      .select('id, occasion, client:people(name)')
      .eq('studio_id', studio)
      .not('accepted_at', 'is', null)
      .is('scheduled_for', null)
      .neq('turn', 'done')
      .order('accepted_at', { ascending: true })
      .order('id', { ascending: true }),

    /*
     * Pictures in a gallery nobody has been shown. Read off the gallery
     * rather than off a shoot somebody marked as done: a gallery with
     * pictures in it is the evidence the work happened, and it is true
     * without anybody having to remember to say so.
     */
    db.from('galleries')
      .select('id, booking_id, name, '
        + 'booking:bookings(client:people(name)), files:gallery_files(count)')
      .eq('studio_id', studio)
      .is('shared_at', null)
      .order('created_at', { ascending: true }),

    /* Handed over, against what was agreed. */
    db.from('galleries')
      .select('id, booking_id, name, pictures_promised, files:gallery_files(count)')
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

  const reads = { waiting, withoutDate, unshared, galleries, orders };
  for (const [what, result] of Object.entries(reads)) {
    if (result.error) console.error(`Dashboard could not read ${what}:`, result.error);
  }
  if (Object.values(reads).some((result) => result.error)) return null;

  const unanswered: UnansweredRequest[] = ((waiting.data ?? []) as unknown as {
    id: string; wants: string | null; requested_at: string; client: { name: string } | null;
  }[]).map((row) => ({
    id: row.id, wants: row.wants, requestedAt: row.requested_at,
    clientName: row.client?.name ?? null,
  }));

  const unscheduled = ((withoutDate.data ?? []) as unknown as {
    id: string; occasion: string | null; client: { name: string } | null;
  }[]).map((row) => ({ id: row.id, occasion: row.occasion, clientName: row.client?.name ?? null }));

  /*
   * One line per GALLERY. A booking with two galleries, one shared and one
   * not, has one thing undone and saying it twice would make a studio think
   * it had two.
   */
  const notHandedOver: NotHandedOver[] = ((unshared.data ?? []) as unknown as {
    id: string; booking_id: string | null; name: string;
    booking: { client: { name: string } | null } | null; files: { count: number }[];
  }[])
    .map((row) => ({
      bookingId: row.booking_id,
      clientName: row.booking?.client?.name ?? null,
      galleryId: row.id,
      galleryName: row.name,
      have: row.files[0]?.count ?? 0,
    }))
    /* An empty gallery is not undelivered work, it is work not started. */
    .filter((row) => row.have > 0);

  const shortOfPromise: ShortOfPromise[] = ((galleries.data ?? []) as unknown as {
    id: string; booking_id: string | null; name: string;
    pictures_promised: number; files: { count: number }[];
  }[])
    .map((row) => ({
      galleryId: row.id, bookingId: row.booking_id, name: row.name,
      have: row.files[0]?.count ?? 0, promised: row.pictures_promised,
    }))
    .filter((row) => row.have < row.promised);

  const notSent: NotSent[] = ((orders.data ?? []) as unknown as {
    id: string; paid_at: string; person: { name: string } | null;
  }[]).map((row) => ({
    id: row.id, paidAt: row.paid_at, clientName: row.person?.name ?? null,
  }));

  return { unanswered, unscheduled, notHandedOver, shortOfPromise, notSent };
}

/** Only agreed work with a shoot date in the next seven calendar days. */
export async function upcomingShoots(today: string): Promise<ScheduledShoot[] | null> {
  const who = await whoIsAsking();
  if (!who) return null;

  const { data, error } = await db.from('bookings')
    .select('id, scheduled_for, at, occasion, turn, client:people(name), crew:crew(person:people(name))')
    .eq('studio_id', who.studioId)
    .not('accepted_at', 'is', null)
    .gte('scheduled_for', today)
    .lte('scheduled_for', scheduleThrough(today))
    .order('scheduled_for', { ascending: true })
    .order('at', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true });

  if (error) {
    console.error('Dashboard could not read scheduled shoots:', error);
    return null;
  }

  return (data as unknown as {
    id: string; scheduled_for: string; at: string | null; occasion: string | null; turn: Turn;
    client: { name: string } | null; crew: { person: { name: string } | null }[];
  }[]).map((row) => ({
    id: row.id,
    on: row.scheduled_for,
    at: row.at,
    occasion: row.occasion,
    clientName: row.client?.name ?? null,
    crew: row.crew.flatMap(({ person }) => person ? [person.name] : []),
    needsCrew: row.turn !== 'done' && row.crew.length === 0,
  }));
}

/** Deadlines still in effect during the same seven days as the shoot schedule. */
export async function upcomingDeadlines(today: string): Promise<GalleryDeadline[] | null> {
  const who = await whoIsAsking();
  if (!who) return null;
  const studio = who.studioId;
  const through = scheduleThrough(today);

  const [selections, hub, expiries] = await Promise.all([
    db.from('gallery_collections')
      .select('id, name, due_on, gallery:galleries!inner(id, booking_id, name)')
      .eq('studio_id', studio)
      .eq('gallery.studio_id', studio)
      .eq('kind', 'selection')
      .is('submitted_at', null)
      .gte('due_on', today).lte('due_on', through),
    db.from('gallery_hub_requests')
      .select('id, title, purpose, due_on, gallery:galleries!inner(id, booking_id, name), members:gallery_hub_members!inner(id)')
      .eq('studio_id', studio)
      .eq('gallery.studio_id', studio)
      .eq('members.studio_id', studio)
      .eq('status', 'open')
      .is('members.submitted_at', null)
      .gte('due_on', today).lte('due_on', through),
    db.from('galleries')
      .select('id, booking_id, name, expires_on')
      .eq('studio_id', studio)
      .not('shared_at', 'is', null)
      .gte('expires_on', today).lte('expires_on', through),
  ]);

  const reads = { selections, hub, expiries };
  for (const [what, result] of Object.entries(reads)) {
    if (result.error) console.error(`Dashboard could not read ${what} deadlines:`, result.error);
  }
  if (Object.values(reads).some((result) => result.error)) return null;

  const selectionRows = selections.data as unknown as {
    id: string; name: string; due_on: string; gallery: DatedGallery;
  }[];
  const hubRows = hub.data as unknown as {
    id: string; title: string; due_on: string; gallery: DatedGallery;
    purpose: Extract<GalleryDeadline, { kind: 'hub' }>['purpose'];
  }[];
  const expiryRows = expiries.data as (DatedGallery & { expires_on: string })[];

  const deadlines: GalleryDeadline[] = [
    ...selectionRows.map((row) => ({
      kind: 'selection' as const, id: row.id, on: row.due_on, title: row.name,
      gallery: deadlineGallery(row.gallery),
    })),
    ...hubRows.map((row) => ({
      kind: 'hub' as const, id: row.id, on: row.due_on, title: row.title, purpose: row.purpose,
      gallery: deadlineGallery(row.gallery),
    })),
    ...expiryRows.map((row) => ({
      kind: 'expiry' as const, id: row.id, on: row.expires_on, title: row.name,
      gallery: deadlineGallery(row),
    })),
  ];
  return deadlines.sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title));
}
