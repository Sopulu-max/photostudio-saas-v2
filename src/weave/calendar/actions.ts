'use server';

import { weave as db } from '@/weave/db';
import { whoIsAsking } from '@/weave/studio';
import type { Entry } from './shape';

/**
 * Everything the studio is committed to, on the day it falls.
 *
 * A SECOND READING, NOT A TABLE. Nothing is stored for the calendar's sake:
 * every line is a date already recorded somewhere because something needed
 * it, and a day with nothing on it is a day nothing points at. The moment
 * this grows a table of its own, a studio has two places to change a date in
 * and they drift.
 *
 * WHAT COUNTS AS AN ENGAGEMENT. The schema holds twenty-five dates and most
 * of them are a RECORD OF WHAT HAPPENED — accepted_at, paid_at, shared_at,
 * joined_at. Those belong in a log, not on a calendar: nobody can act on the
 * day a gallery was shared. What is here is what the studio is committed to
 * or owes somebody on a day:
 *
 *   the shoot          bookings.scheduled_for
 *   the occasion       bookings.occasion_on, when it is not the shoot day
 *   a day asked for    bookings.asked_for on a request nobody has answered
 *   selects due        gallery_collections.due_on
 *   a submission due   gallery_hub_requests.due_on
 *   a gallery closing  galleries.expires_on
 *   a code expiring    discounts.expires_on
 *   a follow-up owed   automation_sends.due_at
 *
 * Read in parallel because they are independent, and a month that waits for
 * the slowest of eight in sequence is eight waits instead of one.
 */
export async function theCalendar(from: string, to: string): Promise<Entry[]> {
  const who = await whoIsAsking();
  if (!who) return [];
  const studio = who.studioId;

  const [shoots, asked, selects, submissions, closing, codes, followUps] =
    await Promise.all([
      /* The work itself, and the occasion it is for. */
      db.from('bookings')
        .select('id, occasion, occasion_on, scheduled_for, at, '
          + 'client:people(name), crew:crew(person:people(name))')
        .eq('studio_id', studio)
        .or(`and(scheduled_for.gte.${from},scheduled_for.lte.${to}),`
          + `and(occasion_on.gte.${from},occasion_on.lte.${to})`),

      /* A day somebody has asked the studio to hold, and nobody has answered. */
      db.from('bookings')
        .select('id, occasion, asked_for, client:people(name)')
        .eq('studio_id', studio)
        .not('requested_at', 'is', null)
        .is('accepted_at', null).is('declined_at', null)
        .gte('asked_for', from).lte('asked_for', to),

      db.from('gallery_collections')
        .select('id, name, due_on, gallery:galleries(id, name)')
        .eq('studio_id', studio)
        .is('submitted_at', null)
        .gte('due_on', from).lte('due_on', to),

      db.from('gallery_hub_requests')
        .select('id, title, due_on, gallery:galleries(id, name)')
        .eq('studio_id', studio)
        .gte('due_on', from).lte('due_on', to),

      db.from('galleries')
        .select('id, name, expires_on')
        .eq('studio_id', studio)
        .gte('expires_on', from).lte('expires_on', to),

      db.from('discounts')
        .select('id, code, expires_on')
        .eq('studio_id', studio)
        .gte('expires_on', from).lte('expires_on', to),

      db.from('automation_sends')
        .select('id, due_at, person:people(name), gallery:galleries(id, name)')
        .eq('studio_id', studio)
        .is('sent_at', null)
        .gte('due_at', `${from}T00:00:00Z`).lte('due_at', `${to}T23:59:59Z`),
    ]);

  for (const [what, result] of Object.entries({
    shoots, asked, selects, submissions, closing, codes, followUps,
  })) {
    if (result.error) console.error(`The calendar could not read ${what}:`, result.error);
  }

  const entries: Entry[] = [];

  for (const row of (shoots.data ?? []) as unknown as {
    id: string; occasion: string | null;
    occasion_on: string | null; scheduled_for: string | null; at: string | null;
    client: { name: string } | null;
    crew: { person: { name: string } | null }[];
  }[]) {
    const who_ = row.client?.name ?? null;
    const crew = (row.crew ?? [])
      .map((c) => c.person?.name)
      .filter((n): n is string => Boolean(n));

    if (row.scheduled_for && row.scheduled_for >= from && row.scheduled_for <= to) {
      entries.push({
        kind: 'shoot',
        on: row.scheduled_for,
        at: row.at,
        what: row.occasion ?? 'Booking',
        who: who_,
        crew,
        href: `/bookings/${row.id}`,
      });
    }

    /*
     * The occasion only when it is NOT the day the studio works. A wedding
     * shot on the day of the wedding is one engagement, and saying it twice
     * would make a studio think it had two.
     */
    if (row.occasion_on && row.occasion_on !== row.scheduled_for
      && row.occasion_on >= from && row.occasion_on <= to) {
      entries.push({
        kind: 'occasion',
        on: row.occasion_on,
        at: null,
        what: row.occasion ?? 'The occasion',
        who: who_,
        crew: [],
        href: `/bookings/${row.id}`,
      });
    }
  }

  for (const row of (asked.data ?? []) as unknown as {
    id: string; occasion: string | null; asked_for: string;
    client: { name: string } | null;
  }[]) {
    entries.push({
      kind: 'asked',
      on: row.asked_for,
      at: null,
      what: row.occasion ?? 'Asked for',
      who: row.client?.name ?? null,
      crew: [],
      href: `/bookings/${row.id}`,
    });
  }

  for (const row of (selects.data ?? []) as unknown as {
    id: string; name: string; due_on: string;
    gallery: { id: string; name: string } | null;
  }[]) {
    entries.push({
      kind: 'selects',
      on: row.due_on,
      at: null,
      what: row.name,
      who: row.gallery?.name ?? null,
      crew: [],
      href: row.gallery ? `/galleries/${row.gallery.id}` : '/galleries',
    });
  }

  for (const row of (submissions.data ?? []) as unknown as {
    id: string; title: string; due_on: string;
    gallery: { id: string; name: string } | null;
  }[]) {
    entries.push({
      kind: 'submission',
      on: row.due_on,
      at: null,
      what: row.title,
      who: row.gallery?.name ?? null,
      crew: [],
      href: row.gallery ? `/galleries/${row.gallery.id}` : '/galleries',
    });
  }

  for (const row of (closing.data ?? []) as unknown as {
    id: string; name: string; expires_on: string;
  }[]) {
    entries.push({
      kind: 'closes',
      on: row.expires_on,
      at: null,
      what: row.name,
      who: null,
      crew: [],
      href: `/galleries/${row.id}`,
    });
  }

  for (const row of (codes.data ?? []) as unknown as {
    id: string; code: string; expires_on: string;
  }[]) {
    entries.push({
      kind: 'code',
      on: row.expires_on,
      at: null,
      /* The studio's own code, exactly as minted. */
      what: row.code,
      who: null,
      crew: [],
      href: '/automations',
    });
  }

  for (const row of (followUps.data ?? []) as unknown as {
    id: string; due_at: string;
    person: { name: string } | null;
    gallery: { id: string; name: string } | null;
  }[]) {
    entries.push({
      kind: 'follow-up',
      on: row.due_at.slice(0, 10),
      at: null,
      what: row.gallery?.name ?? 'Follow-up',
      who: row.person?.name ?? null,
      crew: [],
      href: '/automations',
    });
  }

  /* By day, then by hour within it; anything untimed sits after what is timed. */
  return entries.sort((a, b) => (
    a.on.localeCompare(b.on) || (a.at ?? '99').localeCompare(b.at ?? '99')
  ));
}
