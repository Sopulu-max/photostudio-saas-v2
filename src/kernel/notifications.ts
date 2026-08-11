'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAuthOrgId } from '@/lib/supabase/getOrgId';
import { NOTIFIABLE_ACTIONS, notifiableFor } from './notificationKinds';
import type { Notification } from './notificationKinds';

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
    const spec = notifiableFor(e.entity_type, e.action);
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
export async function markNotificationsSeen(upTo?: string) {
  const { orgId, contactId } = await getAuthOrgId();
  if (!contactId) return { ok: false };

  // The watermark must come from the same clock that stamps the events, which
  // is the database's, never this process's. They run on different machines:
  // a watermark written from here can land *behind* a row Postgres stamped a
  // moment earlier, and that notification then stays unread forever however
  // many times you look at it.
  //
  // `upTo` is the newest item the operator was actually shown. Falling back to
  // the newest that exists is only for callers with no list in hand — it can
  // mark something seen that arrived between render and click, which is the
  // lesser of the two wrongs.
  let seenAt = upTo;
  if (!seenAt) {
    const { data } = await supabaseAdmin
      .from('events')
      .select('created_at')
      .eq('organization_id', orgId)
      .in('action', NOTIFIABLE_ACTIONS)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    seenAt = (data as any)?.created_at;
  }
  // Nothing has ever happened, so there is nothing to have seen.
  if (!seenAt) return { ok: true };

  const { error } = await supabaseAdmin
    .from('contacts')
    .update({ notifications_seen_at: seenAt })
    .eq('id', contactId);
  if (error) {
    console.error('Failed to mark notifications seen:', error);
    return { ok: false };
  }
  return { ok: true };
}
