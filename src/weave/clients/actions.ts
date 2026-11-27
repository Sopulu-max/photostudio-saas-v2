'use server';

import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type { Client } from './shape';

/**
 * The people a studio serves, read off the edges that make them clients.
 *
 * No table was added for this and none was needed. A client is a person a
 * booking points at; what they have spent is what their paid orders come to;
 * when they were last shot is their occasions. Every line here is a second
 * reading of something the system already records, which is the whole reason
 * a CRM in this system is a page rather than a database.
 */

type Row = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  bookings: {
    id: string;
    accepted_at: string | null;
    declined_at: string | null;
    requested_at: string | null;
    scheduled_for: string | null;
  }[] | null;
  orders: {
    currency: string;
    paid_at: string | null;
    discount_off: number | null;
    items: { unit_price: number; quantity: number }[] | null;
  }[] | null;
};

const SELECT =
  'id, name, email, phone, created_at, '
  + 'bookings:bookings(id, accepted_at, declined_at, requested_at, scheduled_for), '
  + 'orders:orders(currency, paid_at, discount_off, '
  + 'items:order_items(unit_price, quantity))';

function shape(row: Row, today: string): Client {
  const bookings = row.bookings ?? [];

  /*
   * Their days, from the bookings themselves. A booking holds one date, so
   * these are simply the soonest ahead and the latest behind.
   */
  const days = bookings.map((b) => b.scheduled_for).filter((d): d is string => Boolean(d));
  const ahead = days.filter((d) => d >= today).sort();
  const behind = days.filter((d) => d < today).sort().reverse();

  const paid = (row.orders ?? []).filter((o) => o.paid_at !== null);
  const spent = paid.reduce((total, order) => {
    const lines = (order.items ?? [])
      .reduce((n, line) => n + line.unit_price * line.quantity, 0);
    return total + Math.max(0, lines - (order.discount_off ?? 0));
  }, 0);

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    bookings: bookings.filter((b) => b.accepted_at !== null).length,
    /* Asked for, not answered either way. Declined is answered. */
    waiting: bookings.filter(
      (b) => b.requested_at !== null && !b.accepted_at && !b.declined_at,
    ).length,
    next: ahead[0] ?? null,
    last: behind[0] ?? null,
    spent,
    currency: paid[0]?.currency ?? 'NGN',
    since: row.created_at,
  };
}

export async function clients(): Promise<Client[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const today = new Date().toLocaleDateString('en-CA');

  const { data, error } = await db.from('people')
    .select(SELECT)
    .eq('studio_id', who.studioId)
    /* Not the people it employs. That list is /team and this is its mirror. */
    .is('joined_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to read the clients:', error);
    return [];
  }

  return ((data ?? []) as unknown as Row[])
    /*
     * A BOOKING IS WHAT MAKES SOMEBODY A CLIENT. Dropping the rest is not
     * tidying: a gallery visitor who typed an email to see pictures is a
     * person row in this studio too, and showing a wedding's guests as
     * clients would make the list useless at exactly the size it matters.
     */
    .filter((row) => (row.bookings ?? []).length > 0)
    .map((row) => shape(row, today));
}

/**
 * One client.
 *
 * Read by the same query as the list rather than a narrower one, so a client's
 * page and their row can never disagree about what they have spent or when
 * they are next in.
 */
export async function readClient(id: string): Promise<Client | null> {
  const who = await whoIsAsking();
  if (!who) return null;

  const today = new Date().toLocaleDateString('en-CA');

  const { data, error } = await db.from('people')
    .select(SELECT)
    .eq('id', id)
    .eq('studio_id', who.studioId)
    .is('joined_at', null)
    .maybeSingle();

  if (error) {
    console.error('Failed to read the client:', error);
    throw new Error('Could not read that client');
  }
  if (!data) return null;

  return shape(data as unknown as Row, today);
}

/** What this client has had done, newest first, for their own page. */
export type ClientWork = {
  id: string;
  wants: string | null;
  /** The studio's own word for what the day is. */
  occasion: string | null;
  on: string | null;
  at: string | null;
  standing: 'waiting' | 'declined' | 'agreed';
};

export async function workFor(id: string): Promise<ClientWork[]> {
  const who = await whoIsAsking();
  if (!who) return [];

  const { data, error } = await db.from('bookings')
    .select('id, wants, occasion, accepted_at, declined_at, requested_at, created_at, scheduled_for, at')
    .eq('studio_id', who.studioId)
    .eq('client_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to read the work for a client:', error);
    return [];
  }

  return ((data ?? []) as unknown as {
    id: string; wants: string | null; occasion: string | null;
    accepted_at: string | null;
    declined_at: string | null; requested_at: string | null;
    scheduled_for: string | null; at: string | null;
  }[]).map((row) => ({
    id: row.id,
    wants: row.wants,
    occasion: row.occasion,
    on: row.scheduled_for,
    at: row.at,
    standing: row.accepted_at ? 'agreed' : row.declined_at ? 'declined' : 'waiting',
  }));
}
