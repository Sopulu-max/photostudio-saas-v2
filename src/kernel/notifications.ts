'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';

/**
 * Notifications — a projection of the event log, not a second log.
 *
 * Every notification here is an event the system already recorded. Nothing is
 * written when one is "sent"; the only stored state is a per-operator
 * watermark (contacts.notifications_seen_at) marking how far you have read.
 * A notifications table would be a duplicate of organizational memory that
 * drifts from it the first time a write fails.
 *
 * Two rules decide what interrupts someone:
 *
 *   1. The event is in NOTIFIABLE below — most of what a studio does is
 *      activity, and the activity feed is where activity belongs.
 *   2. You did not do it yourself.
 *
 * Rule 2 is what makes this work for a one-person studio and a ten-person one
 * without branching. Client actions carry the client's contact as actor, so
 * they always pass. A colleague's action passes for you and not for them. Your
 * own clicks never come back at you as news.
 */

type Notifiable = {
  /** Reads as "<who> <phrase>" — the same voice as the activity feed. */
  phrase: string;
  /** Where clicking it should land. Payload carries what the entity id can't. */
  href: (e: { entityId: string; payload: Record<string, any> }) => string;
};

/**
 * What is worth interrupting someone for.
 *
 * Deliberately excluded: everything in the catalog (services, packages,
 * blueprints, roles) and every rename. Defining what the studio does is
 * considered work, not news — it belongs in the activity feed. What arrives
 * here is the outside world acting, or a colleague changing something already
 * in motion.
 */
const NOTIFIABLE: Record<string, Notifiable> = {
  // The outside world. Actor is a client contact, so these always pass rule 2.
  'booking.created':                       { phrase: 'booked', href: (e) => `/bookings/${e.entityId}` },
  'contract.activated':                    { phrase: 'signed a contract', href: (e) => `/contracts/${e.entityId}` },
  'financial_transaction.payment_settled': { phrase: 'paid an invoice', href: () => `/finances` },
  'delivery.viewed':                       { phrase: 'opened the gallery', href: (e) => e.payload?.bookingId ? `/bookings/${e.payload.bookingId}` : `/bookings` },

  // In motion — a colleague moved something that is already live.
  'booking.stage_changed':  { phrase: 'moved a booking along',        href: (e) => `/bookings/${e.entityId}` },
  'booking.scheduled':      { phrase: 'put a date on a booking',      href: (e) => `/bookings/${e.entityId}` },
  'booking.deleted':        { phrase: 'deleted a booking',            href: () => `/bookings` },
  'booking.crew_assigned':  { phrase: 'put someone on a booking',     href: (e) => `/bookings/${e.entityId}` },
  'booking_line.created':   { phrase: 'added a package to a booking', href: (e) => e.payload?.bookingId ? `/bookings/${e.payload.bookingId}` : `/bookings` },
  'task.assigned':          { phrase: 'assigned a task',              href: () => `/tasks` },
  'financial_transaction.created': { phrase: 'raised an invoice',     href: () => `/finances` },
  'contract.cancelled':     { phrase: 'cancelled a contract',         href: (e) => `/contracts/${e.entityId}` },
  'delivery.shared':        { phrase: 'shared a delivery',            href: (e) => e.payload?.bookingId ? `/bookings/${e.payload.bookingId}` : `/bookings` },
};

const NOTIFIABLE_ACTIONS = [...new Set(Object.keys(NOTIFIABLE).map((k) => k.split('.')[1]))];

export type Notification = {
  id: string;
  at: string;
  description: string;
  href: string;
  unread: boolean;
};

/**
 * The studio's notifications, newest first, each marked against this
 * operator's watermark. Filtering to notifiable actions happens in the query
 * so a busy studio's catalog edits never reach the app.
 */
export async function listNotifications(limit = 20): Promise<Notification[]> {
  const { orgId, contactId } = await getAuthOrgId();

  const [{ data: me }, { data: rows }] = await Promise.all([
    contactId
      ? supabaseAdmin.from('contacts').select('notifications_seen_at').eq('id', contactId).maybeSingle()
      : Promise.resolve({ data: null } as any),
    supabaseAdmin
      .from('events')
      .select('id, entity_type, entity_id, action, payload, created_at, actor_id, actor:contacts(display_name)')
      .eq('organization_id', orgId)
      .in('action', NOTIFIABLE_ACTIONS)
      .order('created_at', { ascending: false })
      .limit(limit * 4),
  ]);

  const seenAt = (me as any)?.notifications_seen_at ? new Date((me as any).notifications_seen_at).getTime() : 0;

  const out: Notification[] = [];
  for (const e of ((rows || []) as any[])) {
    // The action filter above is deliberately loose — PostgREST can't express
    // "this entity type with this action" — so the pair is checked here.
    const spec = NOTIFIABLE[`${e.entity_type}.${e.action}`];
    if (!spec) continue;
    // Rule 2: your own doing is not news.
    if (contactId && e.actor_id === contactId) continue;

    const who = e.actor?.display_name || 'Someone';
    const at = e.created_at as string;
    out.push({
      id: e.id,
      at,
      description: `${who} ${spec.phrase}`,
      href: spec.href({ entityId: e.entity_id, payload: e.payload || {} }),
      unread: new Date(at).getTime() > seenAt,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Everything up to now has been seen. Called when the panel is opened.
 *
 * There is no separate unread count: the caller derives it from the list it
 * already has, so the badge can never disagree with the panel it opens.
 */
export async function markNotificationsSeen() {
  const { contactId } = await getAuthOrgId();
  if (!contactId) return { ok: false };

  const { error } = await supabaseAdmin
    .from('contacts')
    .update({ notifications_seen_at: new Date().toISOString() })
    .eq('id', contactId);
  if (error) {
    console.error('Failed to mark notifications seen:', error);
    return { ok: false };
  }
  return { ok: true };
}
